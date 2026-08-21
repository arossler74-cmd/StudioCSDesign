// Client report generator.
//
// Turns a project plus one phase into a standalone HTML file the client can be
// sent directly. The platform is where the work happens; this is the thing that
// leaves it, so the output has no dependency on the app: styles are inline and
// images are embedded, which means it survives being emailed, saved to a
// desktop, or opened years later with the studio's site long gone.
//
// What a phase shows differs by design, and follows how the studio actually
// presents work:
//   concept  — direction, palette, materials, 2D plans and moodboards. No
//              furniture: at this stage the client is agreeing to a feeling,
//              and naming pieces invites a debate about pieces instead.
//   design   — the sourcing list per room, with dimensions, prices, a total
//              and any alternatives. The decisions concept deliberately
//              deferred.
//   discovery / styling — the brief and the closing summary respectively.

const PHASES = [
  { key: 'discovery', n: 1, title: 'Discovery', blurb: 'We start with the questionnaire and a conversation, then I visit and measure the space.' },
  { key: 'concept', n: 2, title: 'Concept', blurb: 'I present a design direction — moodboard, palette and materials — so we agree on the feeling before anything is bought.' },
  { key: 'design', n: 3, title: 'Design & sourcing', blurb: 'Floor plans, renderings and a curated sourcing list come together into one cohesive scheme.' },
  { key: 'styling', n: 4, title: 'Styling & reveal', blurb: 'Pieces arrive, everything is placed and styled, and your space is ready to be lived in.' },
];

// The studio's own copy. Identical on every report and changed rarely, so it
// lives here rather than in each project's data.
export const STUDIO = {
  name: 'Cybelle Sampaio',
  role: 'Founder & lead designer',
  studio: 'Cybelle Sampaio Studio',
  strap: 'Design & Decoration · Orange County, CA',
  portrait: 'assets/cybelle-portrait.png',
  logo: 'assets/cybelle-logo.png',
  bio: [
    'I am an interior designer and decorator based in Orange County, California. My passion is creating warm, liveable homes that feel collected rather than decorated.',
    'Having lived in Brazil, Missouri, New York and Florida, I bring a well-travelled eye to residential interiors — and a preference for materials that age well.',
  ],
  stats: [
    { k: 'Decor', v: '& design' },
    { k: 'LA & OC', v: 'Online everywhere' },
    { k: '1:1', v: 'Personal service' },
  ],
};

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (n, cur) => (n == null || n === '' || isNaN(Number(n)))
  ? ''
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(Number(n));

const longDate = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return isNaN(d.getTime())
    ? new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

/** Fetch an image and return it as a data: URI so the report carries it.
 *  Anything that fails keeps its original URL: a report with one image that
 *  only loads online beats no report at all, which is what throwing here
 *  would produce. */
async function embed(url, cache, timeoutMs) {
  if (!url || /^data:/.test(url)) return url || '';
  if (cache[url]) return cache[url];
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 20000) : null;
    const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (timer) clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const data = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('unreadable'));
      fr.readAsDataURL(blob);
    });
    cache[url] = data;
    return data;
  } catch (e) {
    console.warn('report: keeping remote URL for ' + url, e);
    cache[url] = url;
    return url;
  }
}

/** Every image the report will reference, in the order it appears. Collected
 *  first so the caller can show real progress instead of a spinner. */
function imageList(project, phaseKey) {
  const out = [STUDIO.portrait, STUDIO.logo];
  if (project.hero) out.push(project.hero);
  for (const r of project.rooms || []) {
    if (r.cad) out.push(r.cad);
    if (phaseKey === 'concept' || phaseKey === 'design') for (const m of r.moodboard || []) out.push(m);
  }
  return [...new Set(out.filter(Boolean))];
}

const CSS = `
:root{--bg:#F4EDE4;--surface:#FBF7F1;--surface2:#F7F0E6;--ink:#3B342C;--soft:#6A6154;
--mute:#9A8C7C;--faint:#B3A695;--line:#E6DBCC;--line2:#DCCFBB;--accent:#A98A5F;--accent-dark:#8A6E45}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font-family:'Jost',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2,h3,.disp{font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-weight:400;margin:0}
.wrap{max-width:1000px;margin:0 auto;padding:0 32px}
section{padding:72px 0;border-top:1px solid var(--line)}
section:first-of-type{border-top:0}
.kicker{font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);margin-bottom:10px}
h2{font-size:40px;line-height:1.1;color:var(--accent-dark);margin-bottom:8px}
.lead{color:var(--soft);max-width:68ch;text-wrap:pretty}
.grid{display:grid;gap:22px}
.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px 24px}
img{max-width:100%;display:block}
.cover{min-height:88vh;display:flex;flex-direction:column;justify-content:center;padding:80px 0}
.cover h1{font-size:clamp(44px,7vw,86px);line-height:1.02;color:var(--accent-dark);margin:18px 0 28px}
.heroimg{width:100%;aspect-ratio:16/7;object-fit:cover;border-radius:16px;margin-top:34px}
.meta{display:flex;flex-wrap:wrap;gap:44px;margin-top:20px}
.meta .lbl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--mute)}
.meta .val{font-size:17px;margin-top:4px}
.step{display:flex;gap:16px;padding:18px 0;border-bottom:1px solid var(--line)}
.step:last-child{border-bottom:0}
.step .n{font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;color:var(--faint);min-width:44px}
.here{display:inline-block;margin-left:10px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;
background:var(--accent);color:#fff;border-radius:999px;padding:3px 10px;vertical-align:middle}
.sw{border-radius:12px;overflow:hidden;border:1px solid var(--line2)}
.sw .chip{height:78px}
.sw .n{padding:9px 12px;font-size:13px;background:var(--surface)}
.sw .h{padding:0 12px 10px;font-size:11.5px;color:var(--mute);background:var(--surface);font-family:ui-monospace,monospace}
.room{margin-top:44px}
.room h3{font-size:28px;color:var(--accent-dark)}
.room .code{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
.plan{width:100%;border:1px solid var(--line2);border-radius:14px;background:#fff;margin-top:14px}
.mood{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin-top:14px}
.mood img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;border:1px solid var(--line2)}
table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13.5px}
th{text-align:left;font-weight:500;font-size:11px;letter-spacing:.14em;text-transform:uppercase;
color:var(--mute);border-bottom:1px solid var(--line2);padding:9px 10px}
td{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:top}
td.num,th.num{text-align:right;white-space:nowrap}
tfoot td{font-weight:600;border-top:2px solid var(--line2);border-bottom:0}
.thumb{width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid var(--line2)}
footer{padding:56px 0 72px;color:var(--mute);font-size:13px;text-align:center}
footer img{height:52px;margin:0 auto 14px;opacity:.85}
@media print{
  @page{margin:14mm}
  body{background:#fff}
  section{break-inside:avoid;padding:34px 0}
  .cover{min-height:auto;padding:0 0 28px}
  .room,.card,table,.mood img{break-inside:avoid}
  h2{font-size:30px}
}
@media(max-width:760px){.g2,.g3,.g4{grid-template-columns:1fr}.wrap{padding:0 20px}}
`;

function coverSection(p, phase, img) {
  const addr = [p.address, p.addressCity].filter(Boolean).join(', ');
  return `
<section class="cover"><div class="wrap">
  <div class="kicker">Interior Design Proposal · Step ${phase.n} of 4</div>
  <div style="color:var(--mute);font-size:13.5px">${esc(longDate(p.startDate))}</div>
  <div style="margin-top:26px;font-size:15px;letter-spacing:.02em;color:var(--soft)">
    ${esc(p.name)}${p.location ? ' · ' + esc(p.location) : ''}</div>
  <h1>${esc(p.tagline || 'A home that lives the way you do')}</h1>
  <div class="meta">
    ${p.client ? `<div><div class="lbl">Prepared for</div><div class="val">${esc(p.client)}</div>
      ${addr ? `<div style="font-size:13.5px;color:var(--mute);margin-top:2px">${esc(addr)}</div>` : ''}</div>` : ''}
    ${p.scope ? `<div><div class="lbl">Scope</div><div class="val">${esc(p.scope)}</div>
      ${p.scopeNote ? `<div style="font-size:13.5px;color:var(--mute);margin-top:2px">${esc(p.scopeNote)}</div>` : ''}</div>` : ''}
    <div><div class="lbl">Stage</div><div class="val">${esc(phase.title)}</div></div>
  </div>
  ${img[p.hero] || p.hero ? `<img class="heroimg" src="${esc(img[p.hero] || p.hero)}" alt="">` : ''}
</div></section>`;
}

function studioSection(img) {
  return `
<section><div class="wrap">
  <div class="kicker">Who I am</div>
  <div class="grid g2" style="align-items:center;gap:38px">
    <div>
      <h2>${esc(STUDIO.name)}</h2>
      <div style="color:var(--mute);font-size:13.5px;margin-bottom:16px">${esc(STUDIO.role)}</div>
      ${STUDIO.bio.map((b) => `<p class="lead">${esc(b)}</p>`).join('')}
      <div class="grid g3" style="margin-top:24px;gap:14px">
        ${STUDIO.stats.map((s) => `<div class="card" style="padding:14px 16px">
          <div style="font-size:17px">${esc(s.k)}</div>
          <div style="font-size:12.5px;color:var(--mute)">${esc(s.v)}</div></div>`).join('')}
      </div>
    </div>
    ${img[STUDIO.portrait] ? `<img src="${esc(img[STUDIO.portrait])}" alt="${esc(STUDIO.name)}"
      style="border-radius:16px;width:100%;object-fit:cover">` : ''}
  </div>
</div></section>`;
}

function processSection(phase) {
  return `
<section><div class="wrap">
  <div class="kicker">How we work together</div><h2>The process</h2>
  <div style="margin-top:22px">
    ${PHASES.map((f) => `<div class="step">
      <div class="n">0${f.n}</div>
      <div><div style="font-size:17px">${esc(f.title)}${f.key === phase.key ? '<span class="here">We are here</span>' : ''}</div>
      <div class="lead" style="font-size:13.5px">${esc(f.blurb)}</div></div>
    </div>`).join('')}
  </div>
</div></section>`;
}

function goalsSection(p) {
  const goals = (p.goals || []).filter((g) => g && (g.title || g.body));
  if (!goals.length) return '';
  return `
<section><div class="wrap">
  <div class="kicker">What we're solving</div><h2>Your goals</h2>
  <div class="grid g3" style="margin-top:24px">
    ${goals.map((g, i) => `<div class="card">
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;color:var(--faint)">0${i + 1}</div>
      <div style="font-size:16px;margin:6px 0 6px">${esc(g.title || '')}</div>
      <div class="lead" style="font-size:13.5px">${esc(g.body || '')}</div></div>`).join('')}
  </div>
</div></section>`;
}

function conceptSection(p, phaseData) {
  const text = phaseData.concept || phaseData.note || '';
  const points = (p.conceptPoints || []).filter((c) => c && (c.title || c.body));
  const palette = (p.palette || []).filter((c) => c && (c.name || c.hex));
  if (!text && !points.length && !palette.length) return '';
  return `
<section><div class="wrap">
  <div class="kicker">Direction</div><h2>Design concept</h2>
  ${text ? `<p class="lead" style="margin-top:12px">${esc(text)}</p>` : ''}
  ${points.length ? `<div class="grid g2" style="margin-top:26px">
    ${points.map((c) => `<div class="card">
      <div style="font-size:16px;margin-bottom:6px">${esc(c.title || '')}</div>
      <div class="lead" style="font-size:13.5px">${esc(c.body || '')}</div></div>`).join('')}
  </div>` : ''}
  ${palette.length ? `<div class="grid g4" style="margin-top:26px">
    ${palette.map((c) => `<div class="sw">
      <div class="chip" style="background:${esc(c.hex || '#EEE')}"></div>
      <div class="n">${esc(c.name || '')}</div>
      ${c.ref || c.hex ? `<div class="h">${esc(c.ref || c.hex)}</div>` : ''}</div>`).join('')}
  </div>` : ''}
</div></section>`;
}

function planSection(p, img) {
  const rooms = (p.rooms || []).filter((r) => r.cad);
  if (!rooms.length) return '';
  return `
<section><div class="wrap">
  <div class="kicker">To scale</div><h2>Space plan · 2D</h2>
  ${rooms.map((r) => `<div class="room">
    <h3>${esc(r.name)}</h3>${r.code ? `<div class="code">${esc(r.code)}</div>` : ''}
    ${r.brief ? `<p class="lead" style="font-size:13.5px;margin-top:8px">${esc(r.brief)}</p>` : ''}
    <img class="plan" src="${esc(img[r.cad] || r.cad)}" alt="${esc(r.name)} plan">
  </div>`).join('')}
</div></section>`;
}

function moodSection(p, img) {
  const rooms = (p.rooms || []).filter((r) => (r.moodboard || []).length);
  if (!rooms.length) return '';
  return `
<section><div class="wrap">
  <div class="kicker">The feeling</div><h2>Moodboards</h2>
  ${rooms.map((r) => `<div class="room">
    <h3>${esc(r.name)}</h3>
    ${r.moodNote ? `<p class="lead" style="font-size:13.5px;margin-top:8px">${esc(r.moodNote)}</p>` : ''}
    <div class="mood">${(r.moodboard || []).map((m) => `<img src="${esc(img[m] || m)}" alt="">`).join('')}</div>
  </div>`).join('')}
</div></section>`;
}

/** Design & sourcing: the per-room list with prices and a total. Concept
 *  deliberately omits this — see the note at the top of the file. */
function sourcingSection(p, byId, img) {
  const rooms = (p.rooms || []).filter((r) => (r.selected || []).length);
  if (!rooms.length) return '';
  let grand = 0;
  const blocks = rooms.map((r) => {
    let sub = 0;
    const rows = (r.selected || []).map((sel) => {
      const c = byId[sel.refId];
      if (!c) return '';
      const qty = Number(sel.qty || 1);
      const line = c.price == null ? null : Number(c.price) * qty;
      if (line != null && !isNaN(line)) sub += line;
      return `<tr>
        <td>${img[c.image] || c.image ? `<img class="thumb" src="${esc(img[c.image] || c.image)}" alt="">` : ''}</td>
        <td><div style="font-weight:500">${esc(c.name || '')}</div>
          <div style="color:var(--mute);font-size:12.5px">${esc([c.retailer, c.finish, c.color].filter(Boolean).join(' · '))}</div>
          ${c.dimensions ? `<div style="color:var(--faint);font-size:12px">${esc(c.dimensions)}</div>` : ''}</td>
        <td class="num">${qty}</td>
        <td class="num">${esc(money(c.price, p.currency))}</td>
        <td class="num">${esc(line == null ? '' : money(line, p.currency))}</td>
      </tr>`;
    }).join('');
    grand += sub;
    return `<div class="room">
      <h3>${esc(r.name)}</h3>
      <table><thead><tr><th style="width:64px"></th><th>Piece</th>
        <th class="num">Qty</th><th class="num">Each</th><th class="num">Total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4" class="num">${esc(r.name)} subtotal</td>
          <td class="num">${esc(money(sub, p.currency))}</td></tr></tfoot>
      </table></div>`;
  }).join('');
  return `
<section><div class="wrap">
  <div class="kicker">Curated for you</div><h2>Sourcing &amp; investment</h2>
  ${blocks}
  <div class="card" style="margin-top:30px;display:flex;justify-content:space-between;align-items:baseline">
    <div style="font-size:17px">Total investment</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;color:var(--accent-dark)">${esc(money(grand, p.currency))}</div>
  </div>
</div></section>`;
}

/** The design fee, per space. Shown as agreed, never as the rate card: the
 *  client is reading what was negotiated, and a struck-through list price
 *  invites a conversation about the discount rather than the work. */
function feesSection(p) {
  const q = p.fees;
  const lines = (q && q.lines) || [];
  if (!lines.length) return '';
  const sub = lines.reduce((t, l) => t + (Number(l.fee) || 0), 0);
  const pct = Math.max(0, Math.min(100, Number(q.discountPct) || 0));
  const disc = sub * (pct / 100);
  return `
<section><div class="wrap">
  <div class="kicker">Working together</div><h2>Design fee</h2>
  ${q.note ? `<p class="lead" style="margin-top:12px">${esc(q.note)}</p>` : ''}
  <table><thead><tr><th>Space</th><th class="num">Fee</th></tr></thead>
    <tbody>${lines.map((l) => `<tr><td>${esc(l.name || '')}</td>
      <td class="num">${esc(money(l.fee, p.currency))}</td></tr>`).join('')}</tbody>
    ${pct > 0 ? `<tfoot>
      <tr><td class="num">Subtotal</td><td class="num">${esc(money(sub, p.currency))}</td></tr>
      <tr><td class="num">${esc('Discount ' + pct + '%' + (q.discountNote ? ' — ' + q.discountNote : ''))}</td>
        <td class="num">−${esc(money(disc, p.currency))}</td></tr>
    </tfoot>` : ''}
  </table>
  <div class="card" style="margin-top:24px;display:flex;justify-content:space-between;align-items:baseline">
    <div style="font-size:17px">Total design fee</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;color:var(--accent-dark)">${esc(money(sub - disc, p.currency))}</div>
  </div>
  <p class="lead" style="font-size:12.5px;margin-top:14px;color:var(--mute)">
    The design fee covers the studio's work. Furnishings are quoted separately.</p>
</div></section>`;
}

function footerSection(img) {
  return `
<footer><div class="wrap">
  ${img[STUDIO.logo] ? `<img src="${esc(img[STUDIO.logo])}" alt="${esc(STUDIO.studio)}">` : `<div>${esc(STUDIO.studio)}</div>`}
  <div>${esc(STUDIO.strap)}</div>
</div></footer>`;
}

/**
 * Build the report.
 *
 * @param project  the project record
 * @param phaseKey discovery | concept | design | styling
 * @param catalog  catalog items, for the sourcing table
 * @param onProgress optional ({done,total,label}) while images are embedded
 * @returns {Promise<{html:string, embedded:number, kept:number}>}
 */
export async function buildReport(project, phaseKey, catalog, onProgress) {
  const p = project || {};
  const phase = PHASES.find((f) => f.key === phaseKey) || PHASES[1];
  const byId = {};
  for (const c of catalog || []) byId[c.id] = c;

  const urls = imageList(p, phase.key);
  const cache = {};
  const img = {};
  let done = 0, kept = 0;
  for (const u of urls) {
    if (onProgress) onProgress({ done, total: urls.length, label: String(u).split('/').pop() });
    const v = await embed(u, cache, 20000);
    if (v === u && !/^data:/.test(v)) kept++;
    img[u] = v;
    done++;
  }
  if (onProgress) onProgress({ done, total: urls.length, label: 'writing the document' });

  const body = [
    coverSection(p, phase, img),
    studioSection(img),
    processSection(phase),
    goalsSection(p),
    // Concept agrees a direction; Design & sourcing commits to pieces. Showing
    // furniture in the concept report turns a conversation about feeling into
    // one about price, which is why the phases carry different sections.
    phase.key === 'concept' ? conceptSection(p, (p.phases && p.phases.concept) || {}) : '',
    phase.key === 'concept' || phase.key === 'design' ? planSection(p, img) : '',
    phase.key === 'concept' || phase.key === 'design' ? moodSection(p, img) : '',
    phase.key === 'design' || phase.key === 'styling' ? sourcingSection(p, byId, img) : '',
    // The fee belongs where the engagement is being agreed — the concept
    // proposal — and again alongside the furnishings total, so the client can
    // see the studio's fee and the pieces as two separate numbers.
    phase.key === 'concept' || phase.key === 'design' ? feesSection(p) : '',
    footerSection(img),
  ].join('');

  const title = [p.name, phase.title].filter(Boolean).join(' — ');
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head><body>${body}</body></html>`;

  return { html, embedded: urls.length - kept, kept };
}

/** File name for the download: project and phase, safe on every platform. */
export function reportFileName(project, phaseKey) {
  const phase = PHASES.find((f) => f.key === phaseKey) || PHASES[1];
  const base = [(project && project.name) || 'project', phase.title]
    .join(' - ').replace(/[^A-Za-z0-9 .-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base + '.html';
}
