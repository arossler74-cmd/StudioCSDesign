const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const dns = require('node:dns').promises;
const Anthropic = require('@anthropic-ai/sdk').default;

initializeApp();

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const STUDIO_ADMINS = new Set(['arossler74@gmail.com', 'cybellesampaio77@gmail.com']);
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
// The model per job — one place to recalibrate cost against quality.
// Text clean-up is simple and frequent, so it runs on the cheapest model;
// drawing a measured plan is the hardest job here and gets the strongest.
const MODELS = {
  text: 'claude-haiku-4-5',      // AI button on text boxes
  products: 'claude-opus-5',     // reading retailer pages, web search, moodboards
  plan: 'claude-opus-5',         // Draw with AI (floor plans)
};
const isHaiku = (model) => /haiku/.test(model);
// Server-side refusal fallback: if a safety classifier declines a request,
// the API re-runs it on a suitable model inside the same call.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Every AI endpoint costs money per call and reads arbitrary URLs, so each
// one is limited to signed-in studio staff — same gate fetchProductDetails
// has always had, shared here instead of repeated.
async function requireStudioUser(req) {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in to use this.');
  const user = await getAuth().verifyIdToken(token);
  const profile = await getFirestore().doc('users/' + user.uid).get();
  const role = profile.exists ? profile.data().role : '';
  if (!(role === 'admin' || role === 'designer' || STUDIO_ADMINS.has(String(user.email || '').toLowerCase()))) {
    throw new HttpError(403, 'Only studio users can use this.');
  }
  return user;
}

function claude() {
  const apiKey = anthropicApiKey.value();
  if (!apiKey) throw new HttpError(503, 'The AI key is not configured on the server.');
  return new Anthropic({ apiKey });
}

function textOf(message) {
  return message.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
}

function checkStop(message) {
  if (message.stop_reason === 'refusal') throw new HttpError(422, 'The AI declined this request.');
  if (message.stop_reason === 'max_tokens') throw new Error('The AI response was cut off before it finished.');
}

// One Claude call constrained to a JSON schema; returns the parsed object.
// stream: for long outputs (an SVG plan), so the HTTP request can't time out.
async function claudeJson({ model, system, content, schema, effort, maxTokens, stream }) {
  model = model || MODELS.products;
  // Haiku 4.5 takes no effort setting (it's a 400 there) and has no
  // server-side refusal fallback — both only apply to the Opus models.
  const params = {
    model, max_tokens: maxTokens || 16000, ...(isHaiku(model) ? {} : FALLBACK), system,
    messages: [{ role: 'user', content }],
    output_config: { ...(isHaiku(model) ? {} : { effort: effort || 'medium' }), format: { type: 'json_schema', schema } }
  };
  const client = claude();
  const message = stream ? await client.beta.messages.stream(params).finalMessage() : await client.beta.messages.create(params);
  checkStop(message);
  return JSON.parse(textOf(message));
}

// Web search, then the answer as a JSON object at the end of the reply.
// (Structured outputs can't be combined with search citations, so the JSON
// is asked for in the prompt and parsed from the final text.) Server tools
// can pause a long turn — pause_turn — which is resumed by sending the
// paused assistant turn straight back.
async function claudeSearchJson({ system, prompt, maxUses }) {
  const client = claude();
  const messages = [{ role: 'user', content: prompt }];
  let message;
  for (let round = 0; round < 4; round++) {
    message = await client.beta.messages.create({
      model: MODELS.products, max_tokens: 16000, ...FALLBACK, system, messages,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxUses || 6 }],
      output_config: { effort: 'medium' }
    });
    if (message.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: message.content });
  }
  checkStop(message);
  const text = textOf(message);
  const json = text.match(/\{[\s\S]*\}/g);
  if (!json) return null;
  try { return JSON.parse(json[json.length - 1]); } catch (e) { return null; }
}

function sendError(res, error, fallbackStatus) {
  const status = (error && error.status) || fallbackStatus || 500;
  return res.status(status).json({ error: (error && error.message) || 'Something went wrong.' });
}

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

const PRODUCT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    found: { type: 'boolean' },
    name: { type: 'string' },
    retailer: { type: 'string' },
    dimensions: { type: 'string' },
    finish: { type: 'string' },
    color: { type: 'string' },
    price: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    image: { type: 'string' },
    notes: { type: 'string' }
  },
  required: ['found', 'name', 'retailer', 'dimensions', 'finish', 'color', 'price', 'image', 'notes']
};

const PRODUCT_RULES = 'Fields: name = the product name as the retailer titles it; retailer = the store or brand; '
  + 'dimensions = overall size as W x D x H with units exactly as published (e.g. 84"W x 38"D x 30"H), '
  + 'add seat height or other key measurements after a semicolon if listed; finish = materials/finish (frame, '
  + 'upholstery, top…); color = the selected colour or fabric name; price = the current USD price as a number '
  + '(sale price if on sale), null if not shown; image = the main product image URL (absolute); notes = one or two '
  + 'short sentences an interior designer would want (construction, care, lead time, COM, variants). '
  + 'Never invent values: use an empty string (or null for price) for anything the source does not state. '
  + 'found=false only when the source clearly is not a single product page.';

function normalizeProduct(result) {
  if (!result || !result.found || !result.name) return null;
  return {
    name: decode(result.name), retailer: decode(result.retailer), dimensions: decode(result.dimensions),
    finish: decode(result.finish), color: decode(result.color),
    price: Number.isFinite(result.price) && result.price > 0 ? result.price : null,
    image: String(result.image || ''), notes: decode(result.notes)
  };
}

// The page as readable text for the model: product JSON-LD and meta tags
// first (the most reliable parts), then the visible text with scripts,
// styles and markup stripped. The page itself is already capped at 2 MB by
// fetchPublicPage; these generous bounds only stop a pathological page (a
// whole catalogue rendered inline) from turning one lookup into a huge bill.
function pageDigest(html) {
  const jsonLd = (html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [])
    .map((block) => block.replace(/^.*?>/, '').replace(/<\/script>$/i, '').trim()).join('\n').slice(0, 60000);
  const metas = (html.match(/<meta[^>]+>/gi) || []).filter((tag) => /og:|product:|twitter:|description/i.test(tag)).join('\n').slice(0, 10000);
  const visible = htmlText(html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')).slice(0, 120000);
  return 'JSON-LD:\n' + jsonLd + '\n\nMETA:\n' + metas + '\n\nPAGE TEXT:\n' + visible;
}

const PRODUCT_SYSTEM = 'You find and extract furniture/decor product details for Cybelle Sampaio Studio, an interior design studio. ' + PRODUCT_RULES;
const PRODUCT_JSON_KEYS = 'found (boolean), name, retailer, dimensions, finish, color, price (number or null), image, notes';

// Reads the fetched page with Claude — much better than regexes at
// dimensions/finish/colour, which every retailer formats differently.
async function aiProductFromPage(pageUrl, html) {
  const result = await claudeJson({
    system: PRODUCT_SYSTEM,
    content: 'Extract the product on this retailer page.\nURL: ' + pageUrl + '\n\n' + pageDigest(html),
    schema: PRODUCT_SCHEMA, effort: 'low', maxTokens: 4000
  });
  return normalizeProduct(result);
}

// Retailers sometimes deny server requests or return bot-challenge HTML;
// then Claude looks the product up with web search instead.
async function aiProductSearch(pageUrl) {
  const result = await claudeSearchJson({
    system: PRODUCT_SYSTEM,
    prompt: 'Find the product at this exact URL: ' + pageUrl + '\n'
      + 'Use web search. Use details only when they clearly match this URL or its product SKU.\n'
      + 'End your reply with one JSON object with these keys: ' + PRODUCT_JSON_KEYS + '.'
  });
  return normalizeProduct(result);
}

// Crate & Barrel's US storefront runs bot-mitigation that returns HTTP 403 to
// any server-side request regardless of headers (verified directly — not a
// solvable header/UA issue). Their public Philippines storefront exposes the
// same product specifications through an unprotected search endpoint, so it
// is used as a descriptive-only fallback (never for its local-currency price)
// when the US page can't be read at all. This runs server-side so it isn't
// subject to the browser CORS restriction a client-side call would hit.
async function crateAndBarrelSearch(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch('https://crateandbarrel.com.ph/search/suggest.json?q='
      + encodeURIComponent(query) + '&resources%5Btype%5D=product', { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return [];
  const data = await res.json();
  return (((data || {}).resources || {}).results || {}).products || [];
}

async function crateAndBarrelFallback(inputUrl) {
  const source = new URL(String(inputUrl || ''));
  if (!/(^|\.)crateandbarrel\.com$/i.test(source.hostname)) return null;
  // The path is "/handle/skucode" — joining with a space keeps them as separate
  // words, but a hyphen-split token adjacent to that boundary (e.g. "sofa" next
  // to "s327164") still ends up glued with a stray space, so each token is cut
  // back to its first word below.
  const words = source.pathname.split('/').filter(Boolean).join(' ').split('-')
    .map((word) => word.trim().split(/\s+/)[0])
    .filter((word) => word && word.length > 1 && !/^\d+$/.test(word) && !/^(by|and|the|a|an|of)$/i.test(word));
  if (!words.length) return null;
  // Their suggest endpoint wants a tight match, not a fuzzy relevance search —
  // a 2-3 word phrase from a real product slug reliably returns nothing even
  // when the single leading word (the product line name) finds it, so back off
  // one word at a time until something comes back.
  let products = [];
  for (let take = Math.min(3, words.length); take >= 1 && !products.length; take--) {
    products = await crateAndBarrelSearch(words.slice(0, take).join(' '));
  }
  if (!products.length) return null;
  const expected = new Set(words.map((word) => word.toLowerCase()));
  const ranked = products.map((item) => ({
    item,
    score: String(item.title || '').toLowerCase().split(/[^a-z0-9]+/).reduce((sum, word) => sum + (expected.has(word) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score)[0];
  // A zero-overlap top result means the query was too generic to find this
  // specific product (e.g. "sectional sofa" alone matches whatever is
  // trending) — better to report nothing than to fill the form with the
  // wrong item.
  if (ranked.score < 1) return null;
  const product = ranked.item;
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

const SITE_URL = 'https://platform.studiocsdesign.com';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Mail/WhatsApp/SMS/iMessage previews are built by a crawler that reads
// whatever <meta> tags come back on the *first* request — it never runs the
// app's JavaScript and never sees location.hash. The real app lives on
// GitHub Pages as one static file with no server, so a share link's own
// domain can never carry per-project meta tags. This function is that
// server: share.studiocsdesign.com/s/{token} answers with a tiny page whose
// title/description/image are read from that one share's Firestore doc,
// then sends a real browser straight on to the live app (same #share=
// link as before). Firestore is read with the admin SDK, not through
// Storage/Firestore rules, since a crawler carries no Firebase Auth.
function shareLinkPage({ title, description, image, redirectTo }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeRedirect = escapeHtml(redirectTo);
  const imageTags = image
    ? `<meta property="og:image" content="${escapeHtml(image)}">\n<meta name="twitter:image" content="${escapeHtml(image)}">\n<meta name="twitter:card" content="summary_large_image">`
    : '<meta name="twitter:card" content="summary">';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Studio CS Design">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${safeRedirect}">
${imageTags}
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta http-equiv="refresh" content="0; url=${safeRedirect}">
<link rel="canonical" href="${safeRedirect}">
<script>location.replace(${JSON.stringify(redirectTo)});</script>
</head>
<body>
<p>Continue to <a href="${safeRedirect}">the review</a>.</p>
</body>
</html>`;
}

exports.shareLink = onRequest({ region: 'us-west1', timeoutSeconds: 10, memory: '128MiB' }, async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Content-Type', 'text/html; charset=utf-8');
  const token = decodeURIComponent((String(req.path || '').match(/\/s\/([^/]+)/i) || [])[1] || String(req.query.token || ''));
  const fallback = () => res.status(200).send(shareLinkPage({
    title: 'Studio CS Design',
    description: 'A private design review from Studio CS Design.',
    image: '',
    redirectTo: SITE_URL + '/'
  }));
  if (!token) return fallback();
  try {
    const snap = await getFirestore().doc('shares/' + token).get();
    if (!snap.exists) return fallback();
    const d = snap.data() || {};
    const title = ['Studio CS', d.clientName, d.projectName].filter(Boolean).join(' | ') || 'Studio CS Design';
    const description = d.tagline || 'A private design review, prepared by Studio CS Design.';
    return res.status(200).send(shareLinkPage({
      title, description, image: d.hero || '', redirectTo: SITE_URL + '/#share=' + encodeURIComponent(token)
    }));
  } catch (error) {
    logger.warn('shareLink failed', { message: error && error.message });
    return fallback();
  }
});

exports.fetchProductDetails = onRequest({ region: 'us-west1', timeoutSeconds: 180, memory: '256MiB', secrets: [anthropicApiKey] }, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const inputUrl = req.body && req.body.url;
  try {
    await requireStudioUser(req);
    const safeUrl = await publicUrl(inputUrl);
    let product = null;
    let pageError = null;
    try {
      const page = await fetchPublicPage(safeUrl.href);
      const direct = extractProduct(page.html, page.url);
      // Claude reads the page we already have; the structured fields the
      // retailer publishes for machines (JSON-LD name/price/image) still win
      // over Claude's reading of them, Claude wins on the free-text fields
      // the regexes only guess at.
      const ai = await aiProductFromPage(page.url, page.html).catch((error) => {
        logger.warn('AI page read failed', { message: error && error.message });
        return null;
      });
      product = ai ? {
        name: direct.name || ai.name, retailer: direct.retailer || ai.retailer,
        price: direct.price != null ? direct.price : ai.price, image: direct.image || ai.image,
        dimensions: ai.dimensions || direct.dimensions, finish: ai.finish || direct.finish,
        color: ai.color || direct.color, notes: ai.notes || ''
      } : direct;
    } catch (error) {
      pageError = error;
    }
    if (!product || !product.name) {
      const fallback = await crateAndBarrelFallback(safeUrl.href).catch(() => null);
      if (fallback && fallback.name) product = fallback;
    }
    if (!product || !product.name) product = await aiProductSearch(safeUrl.href).catch((error) => {
      logger.warn('AI product search failed', { message: error && error.message });
      return null;
    });
    if (!product || !product.name) throw pageError || new Error('No readable product details were found on this page.');
    return res.json({ product });
  } catch (error) {
    logger.warn('fetchProductDetails failed', { message: error && error.message });
    return sendError(res, error, 422);
  }
});

// The AI button on every text box: fix grammar, or rewrite for a client
// document. The text comes back in the same language it was written in.
const ASSIST_MODES = {
  fix: 'Fix spelling, grammar and punctuation only. Keep the wording, tone, meaning, length and line breaks. Do not add or remove ideas.',
  improve: 'Rewrite it as polished copy for a high-end interior design studio\'s client presentation: warm, confident, specific and concise. '
    + 'Keep every fact, measurement, material and name, and add none. Keep roughly the same length.',
  shorten: 'Make it noticeably shorter and tighter while keeping every key fact, measurement and name.',
};

exports.aiAssist = onRequest({ region: 'us-west1', timeoutSeconds: 120, memory: '256MiB', secrets: [anthropicApiKey] }, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    await requireStudioUser(req);
    const body = req.body || {};
    const text = String(body.text || '');
    if (text.length > 20000) throw new HttpError(400, 'That text is too long to edit in one go — split it up.');
    const mode = ASSIST_MODES[body.mode] ? body.mode : 'fix';
    if (!text.trim()) throw new HttpError(400, 'There is no text to work on.');
    const context = String(body.context || '').slice(0, 600);
    const result = await claudeJson({
      model: MODELS.text,
      system: 'You edit text written by Cybelle Sampaio Studio, an interior design studio, for its client documents. '
        + ASSIST_MODES[mode] + ' Answer in the same language as the text. Plain text only — no markdown, no surrounding quotes.',
      content: (context ? 'Where this text is used: ' + context + '\n\n' : '') + '<text>\n' + text + '\n</text>',
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
      effort: mode === 'fix' ? 'low' : 'medium', maxTokens: 16000
    });
    return res.json({ text: String((result && result.text) || '').trim() });
  } catch (error) {
    logger.warn('aiAssist failed', { message: error && error.message });
    return sendError(res, error, 500);
  }
});

// Moodboard → shopping list, step 1: read a board image (product photos with
// "name – retailer" captions) and list every piece on it. Step 2 is
// aiFindProduct, called once per row by the client so each row reports back
// on its own instead of one long request timing out on a busy board.
exports.aiReadBoard = onRequest({ region: 'us-west1', timeoutSeconds: 180, memory: '256MiB', secrets: [anthropicApiKey] }, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    await requireStudioUser(req);
    const imageUrl = String((req.body || {}).imageUrl || '');
    if (!/^https:\/\//.test(imageUrl)) throw new HttpError(400, 'Choose the moodboard image first.');
    const result = await claudeJson({
      system: 'You read interior design moodboards for Cybelle Sampaio Studio. List every distinct product shown, using the caption next to it '
        + '(usually "product name – retailer"). For a piece with no caption, give a short descriptive name and leave retailer empty. '
        + 'Keep names as captioned, fixing only obvious typos (e.g. "Create-Barrel" is Crate & Barrel). '
        + 'type is one of: sofa, chair, table, storage, bed, lighting, rug, art, decor, textile, other.',
      content: [
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: 'List the products on this moodboard.' }
      ],
      schema: {
        type: 'object', additionalProperties: false, required: ['items'],
        properties: { items: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['name', 'retailer', 'type'],
          properties: { name: { type: 'string' }, retailer: { type: 'string' }, type: { type: 'string' } }
        } } }
      },
      effort: 'medium', maxTokens: 8000
    });
    return res.json({ items: (result && result.items) || [] });
  } catch (error) {
    logger.warn('aiReadBoard failed', { message: error && error.message });
    return sendError(res, error, 500);
  }
});

// Step 2: find one named product on its retailer's site and return the same
// fields a pasted product URL fills in, plus the URL it found.
exports.aiFindProduct = onRequest({ region: 'us-west1', timeoutSeconds: 300, memory: '256MiB', secrets: [anthropicApiKey] }, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    await requireStudioUser(req);
    const body = req.body || {};
    const name = String(body.name || '').slice(0, 200);
    const retailer = String(body.retailer || '').slice(0, 120);
    if (!name) throw new HttpError(400, 'Missing the product name.');
    const result = await claudeSearchJson({
      system: PRODUCT_SYSTEM,
      prompt: 'Find this product on the retailer\'s own US website (not a marketplace or reseller, unless the retailer is one): "'
        + name + '"' + (retailer ? ' sold by ' + retailer : '') + '.\n'
        + 'End your reply with one JSON object with these keys: ' + PRODUCT_JSON_KEYS
        + ', url (the product page URL; empty string if you could not find this exact product with confidence).'
    });
    const product = normalizeProduct(result);
    if (product) product.url = String((result && result.url) || '');
    return res.json({ product });
  } catch (error) {
    logger.warn('aiFindProduct failed', { message: error && error.message });
    return sendError(res, error, 500);
  }
});

// New furnished 2D plan, drawn by Claude as SVG: image 1 is the measured base
// plan (walls, openings, dimensions — kept), image 2 an optional example
// drawing whose graphic style the studio wants. Vector output means the
// furniture sizes are real coordinates on the plan's own scale rather than a
// painted impression, but it is still a proposal to check against the
// measured plan — the UI says so.
const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['svg', 'summary'],
  properties: { svg: { type: 'string' }, summary: { type: 'string' } }
};

exports.aiFloorPlan = onRequest({ region: 'us-west1', timeoutSeconds: 540, memory: '512MiB', secrets: [anthropicApiKey] }, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    await requireStudioUser(req);
    const body = req.body || {};
    if (!/^https:\/\//.test(String(body.baseUrl || ''))) throw new HttpError(400, 'Choose the floor plan with measurements first.');
    const example = /^https:\/\//.test(String(body.exampleUrl || '')) ? body.exampleUrl : '';
    const instructions = String(body.instructions || '').slice(0, 4000);
    const room = String(body.room || '').slice(0, 2000);
    const content = [
      { type: 'text', text: 'Image 1 — the measured floor plan:' },
      { type: 'image', source: { type: 'url', url: body.baseUrl } },
      ...(example ? [
        { type: 'text', text: 'Image 2 — an example of the studio\'s drawing style:' },
        { type: 'image', source: { type: 'url', url: example } }
      ] : []),
      { type: 'text', text: [
        'Draw a new furnished 2D floor plan for this space as a single SVG.',
        room ? 'Room brief: ' + room : '',
        instructions ? 'Designer instructions: ' + instructions : '',
        'In summary, describe the layout in 2–4 sentences, including anything in the plan you had to assume.'
      ].filter(Boolean).join('\n') }
    ];
    const result = await claudeJson({
      model: MODELS.plan,
      system: [
        'You are an interior architect at Cybelle Sampaio Studio drafting furnished 2D floor plans.',
        'Read the measured plan carefully: its dimension strings set the scale. Reproduce its walls, doors with swings, windows, openings and room names at that scale, then lay out furniture inside it.',
        'Furniture must be drawn at real sizes on that scale, labelled with name and size, with dimension lines for the key clearances and walkways of at least 36 in (91 cm).',
        'If a style example is given, match its graphic language: line weights, furniture symbols, fills, label typography and title block.',
        'SVG rules: a complete standalone <svg> with xmlns, a viewBox, width="2400" and a matching height; white background rect; only basic shapes, paths and text (no external images, fonts or scripts); font-family Arial, Helvetica, sans-serif; all text legible and correctly spelled.'
      ].join('\n'),
      content, schema: PLAN_SCHEMA, effort: 'high', maxTokens: 64000, stream: true
    });
    const svg = String((result && result.svg) || '').trim();
    if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) throw new Error('The AI did not return a complete drawing. Try again.');
    if (/<script|<foreignObject|\son\w+\s*=|href\s*=\s*["']\s*(?:https?:|javascript:)/i.test(svg)) throw new Error('The drawing contained content that is not allowed. Try again.');
    return res.json({ svg, summary: String((result && result.summary) || '') });
  } catch (error) {
    logger.warn('aiFloorPlan failed', { message: error && error.message });
    return sendError(res, error, 500);
  }
});
