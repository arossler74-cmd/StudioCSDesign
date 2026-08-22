const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const dns = require('node:dns').promises;

initializeApp();

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const STUDIO_ADMINS = new Set(['arossler74@gmail.com', 'cybellesampaio77@gmail.com']);

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function isPrivateAddress(address) {
  const ip = String(address || '').toLowerCase();
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = match.slice(1).map(Number);
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168;
}

async function publicUrl(input) {
  const url = new URL(String(input || ''));
  if (!['http:', 'https:'].includes(url.protocol) || !['', '80', '443'].includes(url.port)) throw new Error('Only public HTTP or HTTPS URLs are allowed.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Private hosts are not allowed.');
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error('Private network URLs are not allowed.');
  return url;
}

async function fetchPublicPage(input) {
  let url = await publicUrl(input);
  for (let step = 0; step < 4; step++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    let response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (compatible; CybelleStudio/1.0; product research)'
        }
      });
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      if (!next) throw new Error('The retailer returned an incomplete redirect.');
      url = await publicUrl(new URL(next, url).href);
      continue;
    }
    if (!response.ok) throw new Error('The retailer returned HTTP ' + response.status + '.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_RESPONSE_BYTES) throw new Error('The retailer page is too large to read.');
    return { html: (await response.text()).slice(0, MAX_RESPONSE_BYTES), url: url.href };
  }
  throw new Error('Too many redirects from this retailer.');
}

function decode(value) {
  return String(value || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function htmlText(value) {
  return decode(String(value || '').replace(/<[^>]*>/g, ' '));
}

function meta(html, key) {
  const escaped = key.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp("<meta[^>]+(?:property|name)=[\\\"']" + escaped + "[\\\"'][^>]+content=[\\\"']([^\\\"']+)[\\\"']", 'i'),
    new RegExp("<meta[^>]+content=[\\\"']([^\\\"']+)[\\\"'][^>]+(?:property|name)=[\\\"']" + escaped + "[\\\"']", 'i')
  ];
  for (const pattern of patterns) {
    const found = html.match(pattern);
    if (found) return decode(found[1]);
  }
  return '';
}

function productJsonLd(html) {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const candidates = [];
  for (const block of blocks) {
    const raw = block.replace(/^.*?>/, '').replace(/<\/script>$/i, '').trim();
    try { candidates.push(JSON.parse(raw)); } catch (e) {}
  }
  const scan = (value) => {
    if (!value) return null;
    if (Array.isArray(value)) {
      for (const item of value) { const hit = scan(item); if (hit) return hit; }
      return null;
    }
    if (typeof value !== 'object') return null;
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some((type) => String(type).toLowerCase() === 'product')) return value;
    for (const item of Object.values(value)) { const hit = scan(item); if (hit) return hit; }
    return null;
  };
  for (const candidate of candidates) { const hit = scan(candidate); if (hit) return hit; }
  return {};
}

function inferDetails(text) {
  const dimensions = (text.match(/\b\d+(?:\.\d+)?\s*(?:["”]|\bin\.?)?\s*[Ww]\s*[×x]\s*\d+(?:\.\d+)?\s*(?:["”]|\bin\.?)?\s*[Dd]\s*[×x]\s*\d+(?:\.\d+)?\s*(?:["”]|\bin\.?)?\s*[Hh]\b/) || [])[0] || '';
  const finish = (text.match(/\b(?:travertine|marble|wood|oak|walnut|burl|veneer|leather|linen|boucl[eé]|brass|bronze|steel|glass|ceramic|rattan|wool)\b[^\n.]{0,110}/i) || [])[0] || '';
  const color = (text.match(/\b(?:ivory|cream|white|beige|natural|oak|walnut|brown|black|grey|gray|blue|green|sage|brass|bronze)\b[^\n.]{0,60}/i) || [])[0] || '';
  return { dimensions, finish, color };
}

function extractProduct(html, pageUrl) {
  const product = productJsonLd(html);
  const offers = Array.isArray(product.offers) ? product.offers[0] : (product.offers || {});
  const description = htmlText(product.description || meta(html, 'description') || meta(html, 'og:description'));
  const h1 = htmlText((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  const title = decode(product.name || meta(html, 'og:title') || meta(html, 'twitter:title')
    || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || h1);
  const image = Array.isArray(product.image) ? product.image[0]
    : (product.image || meta(html, 'og:image') || meta(html, 'twitter:image'));
  const priceText = product.price || offers.price || offers.lowPrice
    || meta(html, 'product:price:amount') || meta(html, 'og:price:amount')
    || (description.match(/(?:USD\s*|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i) || [])[1] || '';
  const price = Number(String(priceText).replace(/[^0-9.]/g, ''));
  const inferred = inferDetails(description + '\n' + htmlText(product.additionalProperty || ''));
  return {
    name: title,
    retailer: decode(product.brand && (product.brand.name || product.brand)) || meta(html, 'og:site_name')
      || new URL(pageUrl).hostname.replace(/^www\./, ''),
    dimensions: decode(product.dimensions || product.size) || inferred.dimensions,
    finish: decode(product.material) || inferred.finish,
    color: decode(product.color) || inferred.color,
    price: Number.isFinite(price) && price > 0 ? price : null,
    image: image || ''
  };
}

// Crate & Barrel's US storefront runs bot-mitigation that returns HTTP 403 to
// any server-side request regardless of headers (verified directly — not a
// solvable header/UA issue). Their public Philippines storefront exposes the
// same product specifications through an unprotected search endpoint, so it
// is used as a descriptive-only fallback (never for its local-currency price)
// when the US page can't be read at all. This runs server-side so it isn't
// subject to the browser CORS restriction a client-side call would hit.
async function crateAndBarrelFallback(inputUrl) {
  const source = new URL(String(inputUrl || ''));
  if (!/(^|\.)crateandbarrel\.com$/i.test(source.hostname)) return null;
  const words = source.pathname.split('/').filter(Boolean).join(' ')
    .replace(/^s\d+\s*/i, '').split('-').filter((word) => word && !/^(by|and|the|a|an|of)$/i.test(word));
  const query = words.slice(0, 3).join(' ') || words[0];
  if (!query) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch('https://crateandbarrel.com.ph/search/suggest.json?q='
      + encodeURIComponent(query) + '&resources%5Btype%5D=product', { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return null;
  const data = await res.json();
  const products = (((data || {}).resources || {}).results || {}).products || [];
  if (!products.length) return null;
  const expected = new Set(words.map((word) => word.toLowerCase()));
  const product = products.map((item) => ({
    item,
    score: String(item.title || '').toLowerCase().split(/[^a-z0-9]+/).reduce((sum, word) => sum + (expected.has(word) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score)[0].item;
  const inferred = inferDetails(htmlText(product.body || ''));
  return {
    name: decode(product.title || ''),
    retailer: 'Crate & Barrel',
    dimensions: inferred.dimensions,
    finish: inferred.finish,
    color: inferred.color,
    price: null,
    image: product.image || (product.featured_image && product.featured_image.url) || ''
  };
}

exports.fetchProductDetails = onRequest({ region: 'us-west1', timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const inputUrl = req.body && req.body.url;
  try {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Sign in to fetch product details.' });
    const user = await getAuth().verifyIdToken(token);
    const profile = await getFirestore().doc('users/' + user.uid).get();
    const role = profile.exists ? profile.data().role : '';
    if (!(role === 'admin' || role === 'designer' || STUDIO_ADMINS.has(String(user.email || '').toLowerCase()))) {
      return res.status(403).json({ error: 'Only studio users can fetch product details.' });
    }
    let product = null;
    let pageError = null;
    try {
      const page = await fetchPublicPage(inputUrl);
      product = extractProduct(page.html, page.url);
    } catch (error) {
      pageError = error;
    }
    if (!product || !product.name) {
      const fallback = await crateAndBarrelFallback(inputUrl).catch(() => null);
      if (fallback && fallback.name) product = fallback;
    }
    if (!product || !product.name) throw pageError || new Error('No readable product details were found on this page.');
    return res.json({ product });
  } catch (error) {
    logger.warn('fetchProductDetails failed', { message: error && error.message });
    return res.status(422).json({ error: (error && error.message) || 'Could not read this retailer page.' });
  }
});
