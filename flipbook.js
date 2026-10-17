// Flipbook video export — a project's Concept or Design & sourcing phase as
// an open book that turns its own pages: cover, direction + palette, then
// each space (moodboards first, then ultra-realistic renderings), then the
// studio's back cover.
//
// Everything on screen is a pure function of time. render(t) places the
// page flip, the Ken Burns zoom and the text fades exactly where they are at
// t seconds — there is no CSS animation or timer anywhere — so the preview
// (driven by requestAnimationFrame) and the server render (stepping t one
// frame at a time) show identical frames, and a captured frame can never be
// caught between two states.

export const FORMATS = {
  '16x9': { w: 1920, h: 1080, pageW: 700, pageH: 900 },
  '1x1': { w: 1080, h: 1080, pageW: 480, pageH: 690 },
};

export const TIMING = {
  flip: 1.1,          // one page turn
  minHold: 2.5,       // time a spread rests, clamped to this range…
  maxHold: 4,
  target: 75,         // …aiming at this total
  maxTotal: 90,       // above this the export warns before rendering
  coverExtra: 1,      // cover and back cover rest a second longer
  textIn: 0.6,        // fade + 8px rise for text and swatches, on entry only
  zoom: 0.05,         // Ken Burns: 1.00 → 1.05 over a spread's rest
  boardZoom: 0.025,   // moodboards sit on the paper, so they breathe less
  drift: 1.5,         // Ken Burns drift, % of the image
};

const LOGO = 'assets/cybelle-logo-hires.png';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeFlip = (x) => 0.5 - Math.cos(Math.PI * x) / 2;
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

/* ---------------------------------------------------------------- content */

function firstSentence(text) {
  const s = String(text || '').trim();
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim();
}

function loadSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Which images a space contributes, in carousel order: its moodboards, then
 *  its ultra-realistic renderings. Floor plans, SketchUp views, 2D layouts and
 *  video never appear. Design falls back to Concept's moodboards when it has
 *  none of its own. */
function roomImages(room, phase) {
  const concept = room.conceptMedia || (room.moodboard || []).map((url) => ({ type: 'moodboard', url, title: '' }));
  const own = phase === 'design' ? (room.designMedia || []) : concept;
  let boards = own.filter((m) => m.type === 'moodboard' && m.url);
  if (phase === 'design' && !boards.length) boards = concept.filter((m) => m.type === 'moodboard' && m.url);
  const renders = own.filter((m) => m.type === 'rendering' && m.url);
  return { boards, renders };
}

/** Project → the list of spreads the book will show. Async because a
 *  rendering's orientation decides its layout (landscape fills the spread,
 *  portraits pair up one per page), and that needs each image's size. */
export async function buildBook(project, opts = {}) {
  const p = project || {};
  const phase = opts.phase === 'design' ? 'design' : 'concept';
  const hidden = p.reportHidden || {};
  const contact = opts.contact || {};
  const resolve = opts.resolveUrl || ((u) => u);
  const ph = p.phases || {};
  const spreads = [];
  let imageCount = 0;
  const DRIFT = [[1, 0.6], [-1, -0.4], [0.5, -1], [-0.6, 1]];
  const img = async (m, kind) => {
    const url = resolve(m.url);
    const size = await loadSize(url);
    if (!size) return null;
    const d = DRIFT[imageCount++ % DRIFT.length];
    return { url, w: size.w, h: size.h, kind, title: m.title || '', drift: d, landscape: size.w >= size.h };
  };

  const hero = p.hero || p.cover || '';
  spreads.push({
    kind: 'cover', hold: 'cover',
    project: p.name || '', title: p.tagline || p.name || '', client: p.client || '', location: p.location || '',
    hero: hero ? await img({ url: hero }, 'photo') : null,
  });

  const headlineKey = phase === 'design' ? 'designDirection' : 'direction';
  const headline = hidden[headlineKey] ? '' : firstSentence((ph.concept && (ph.concept.concept || ph.concept.note)) || '');
  const palette = hidden.palette ? [] : (p.palette || []).filter((c) => c && c.hex).slice(0, 8);
  if (headline || palette.length) spreads.push({ kind: 'concept', headline, palette });

  const moodKey = phase === 'design' ? 'designMood' : 'mood';
  if (!hidden[moodKey]) {
    let spaceNo = 0;
    for (const room of p.rooms || []) {
      const { boards, renders } = roomImages(room, phase);
      if (!boards.length && !renders.length) continue;
      const bImgs = (await Promise.all(boards.map((m) => img(m, 'board')))).filter(Boolean);
      const rImgs = (await Promise.all(renders.map((m) => img(m, 'photo')))).filter(Boolean);
      if (!bImgs.length && !rImgs.length) continue;
      spaceNo++;
      const queue = [...bImgs, ...rImgs];
      // The opening spread carries the first moodboard; with none, the first
      // rendering takes its place as a plate on the right-hand page.
      const lead = queue.shift();
      spreads.push({ kind: 'opener', no: String(spaceNo).padStart(2, '0'), name: room.name || '', goal: room.goal || '', image: lead });
      while (queue.length) {
        const a = queue.shift();
        if (a.landscape) { spreads.push({ kind: 'full', image: a, room: room.name }); continue; }
        if (queue.length && !queue[0].landscape) { spreads.push({ kind: 'pair', left: a, right: queue.shift(), room: room.name }); continue; }
        spreads.push({ kind: 'solo', image: a, room: room.name });
      }
    }
  }

  spreads.push({ kind: 'back', hold: 'cover', contact });
  return { spreads, phase, projectName: p.name || '', phaseLabel: phase === 'design' ? 'Design & sourcing' : 'Concept' };
}

/** Rest time per spread so the whole film lands near TIMING.target, within
 *  the min/max hold. `over` is set when even the minimum runs past maxTotal. */
export function timeline(book) {
  const n = book.spreads.length;
  const T = TIMING;
  const flips = Math.max(0, n - 1) * T.flip;
  const extras = book.spreads.filter((s) => s.hold === 'cover').length * T.coverExtra;
  const base = clamp((T.target - flips - extras) / n, T.minHold, T.maxHold);
  const holds = book.spreads.map((s) => base + (s.hold === 'cover' ? T.coverExtra : 0));
  const starts = [];
  let t = 0;
  holds.forEach((h, i) => { starts.push(t); t += h + (i < n - 1 ? T.flip : 0); });
  const minTotal = n * T.minHold + extras + flips;
  return { holds, starts, total: t, base, pages: n, over: minTotal > T.maxTotal ? minTotal : 0 };
}

/* ---------------------------------------------------------------- markup */

const CSS = `
.fb-stage{position:absolute;inset:0;overflow:hidden;background-color:#E8E0D3;font-family:'Jost',sans-serif;color:#3B342C;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.fb-stage::before{content:'';position:absolute;inset:0;background-image:var(--fb-linen);opacity:.55;mix-blend-mode:multiply}
.fb-stage::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,rgba(255,252,246,.55) 0%,rgba(255,252,246,0) 55%,rgba(70,52,34,.10) 100%)}
.fb-book{position:absolute;width:0;z-index:1}
.fb-under{position:absolute;top:0;border-radius:2px}
.fb-under.l{box-shadow:0 2px 0 #E9DFCF,0 4px 0 #E2D7C5,0 5px 0 #D9CCB8}
.fb-under.r{box-shadow:0 2px 0 #E9DFCF,0 4px 0 #E2D7C5,0 5px 0 #D9CCB8}
.fb-shadow{position:absolute;top:0;pointer-events:none}
.fb-holder{position:absolute;left:0;top:0;transform-origin:0 0;display:none}
.fb-page{position:absolute;left:0;top:0;overflow:hidden;background:#FBF7F1}
.fb-page::before{content:'';position:absolute;inset:0;background-image:var(--fb-paper);opacity:.5;mix-blend-mode:multiply;pointer-events:none}
.fb-crease{position:absolute;inset:0;pointer-events:none;z-index:5}
.fb-page.l .fb-crease{background:linear-gradient(to left,rgba(58,42,26,.20) 0,rgba(58,42,26,.07) 2.2%,rgba(58,42,26,0) 8%),linear-gradient(to right,rgba(58,42,26,.05) 0,rgba(58,42,26,0) 3%)}
.fb-page.r .fb-crease{background:linear-gradient(to right,rgba(58,42,26,.22) 0,rgba(58,42,26,.08) 2.2%,rgba(255,255,255,.06) 5%,rgba(58,42,26,0) 9%),linear-gradient(to left,rgba(58,42,26,.05) 0,rgba(58,42,26,0) 3%)}
.fb-fx{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;z-index:6;display:none}
.fb-photo{position:absolute;top:0;height:100%;overflow:hidden}
.fb-kb{position:absolute;inset:0;transform-origin:50% 50%}
.fb-kb img{width:100%;height:100%;object-fit:cover;display:block}
.fb-board{position:absolute;display:flex;align-items:center;justify-content:center}
.fb-board .fb-kb{display:flex;align-items:center;justify-content:center;mix-blend-mode:multiply}
.fb-board img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}
.fb-in{will-change:opacity,transform}
.fb-kicker{font-weight:500;text-transform:uppercase;letter-spacing:.32em;color:#A98A5F}
.fb-serif{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;color:#3B342C}
.fb-folio{position:absolute;bottom:calc(var(--u)*6.4);font-size:calc(var(--u)*1.5);letter-spacing:.3em;text-transform:uppercase;color:#B3A695;font-weight:400}
`;

const NOISE = (freq, alpha) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' stitchTiles='stitch' seed='7'/><feColorMatrix values='0 0 0 0 0.42  0 0 0 0 0.36  0 0 0 0 0.29  0 0 0 ${alpha} 0'/></filter><rect width='300' height='300' filter='url(#n)'/></svg>`)}")`;
const LINEN = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='a'><feTurbulence type='fractalNoise' baseFrequency='0.9 0.035' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 0.40  0 0 0 0 0.33  0 0 0 0 0.25  0 0 0 0.35 0'/></filter><filter id='b'><feTurbulence type='fractalNoise' baseFrequency='0.035 0.9' numOctaves='2' seed='5'/><feColorMatrix values='0 0 0 0 0.40  0 0 0 0 0.33  0 0 0 0 0.25  0 0 0 0.30 0'/></filter><rect width='240' height='240' filter='url(#a)'/><rect width='240' height='240' filter='url(#b)'/></svg>`)}")`;

// Each spread is two pages. A page's HTML is written in its own W×H box;
// sizes use --u (1% of page width), so 16:9 and 1:1 share one layout.
function pageHtml(spread, side, book) {
  const s = spread;
  const folioL = '<div class="fb-folio" style="left:calc(var(--u)*11)">Cybelle Sampaio Studio</div>';
  const folioR = `<div class="fb-folio" style="right:calc(var(--u)*11)">${esc(book.projectName)} · ${esc(book.phaseLabel)}</div>`;
  const pad = 'position:absolute;left:calc(var(--u)*11);right:calc(var(--u)*11)';
  const photo = (im) => `<div class="fb-photo" style="left:0;width:100%"><div class="fb-kb" data-kb="photo" data-dx="${im.drift[0]}" data-dy="${im.drift[1]}"><img src="${esc(im.url)}" alt="" decoding="sync"></div></div>`;
  const fullPhoto = (im) => `<div class="fb-photo" style="left:${side === 'l' ? '0' : '-100%'};width:200%"><div class="fb-kb" data-kb="photo" data-dx="${im.drift[0]}" data-dy="${im.drift[1]}"><img src="${esc(im.url)}" alt="" decoding="sync"></div></div>`;
  const board = (im, box) => `<div class="fb-board" style="${box}"><div class="fb-kb" data-kb="board" data-dx="0" data-dy="0"><img src="${esc(im.url)}" alt="" decoding="sync"></div></div>`;
  const plate = (im) => im.kind === 'board' || im.landscape
    ? board(im, 'left:calc(var(--u)*9);right:calc(var(--u)*9);top:calc(var(--u)*20);bottom:calc(var(--u)*20)')
    : photo(im);

  switch (s.kind) {
    case 'cover':
      if (side === 'l') return `
        <div class="fb-in fb-kicker" style="${pad};top:calc(var(--u)*12);font-size:calc(var(--u)*1.75)">${esc(s.project)}</div>
        <div style="${pad};bottom:calc(var(--u)*30)">
          <div class="fb-in fb-serif" style="font-size:calc(var(--u)*8.4);line-height:1.02;letter-spacing:-.01em">${esc(s.title)}</div>
          <div class="fb-in" style="width:calc(var(--u)*9);height:1px;background:#A98A5F;margin:calc(var(--u)*5.5) 0 calc(var(--u)*4.4)"></div>
          ${s.client ? `<div class="fb-in" style="font-weight:300;font-size:calc(var(--u)*2.7);color:#6A6154">Prepared for ${esc(s.client)}</div>` : ''}
          ${s.location ? `<div class="fb-in fb-kicker" style="margin-top:calc(var(--u)*1.6);font-size:calc(var(--u)*1.5);color:#9A8C7C;letter-spacing:.28em">${esc(s.location)}</div>` : ''}
        </div>
        <img class="fb-in" src="${LOGO}" alt="" style="position:absolute;left:calc(var(--u)*9.4);bottom:calc(var(--u)*8);width:calc(var(--u)*30)">`;
      return s.hero ? photo(s.hero) : `<img class="fb-in" src="${LOGO}" alt="" style="position:absolute;left:22%;top:38%;width:56%">`;

    case 'concept':
      if (side === 'l') return `
        <div class="fb-in fb-kicker" style="${pad};top:calc(var(--u)*12);font-size:calc(var(--u)*1.75)">The direction</div>
        <div class="fb-in fb-serif" style="${pad};top:50%;transform:translateY(-50%);font-size:calc(var(--u)*5.6);line-height:1.18;font-weight:300">${esc(s.headline)}</div>
        ${folioL}`;
      if (!s.palette.length) return folioR;
      {
        const cols = s.palette.length <= 4 ? 2 : (s.palette.length <= 6 ? 3 : 4);
        return `
        <div class="fb-in fb-kicker" style="${pad};top:calc(var(--u)*12);font-size:calc(var(--u)*1.75)">Palette</div>
        <div style="${pad};top:50%;transform:translateY(-46%);display:grid;grid-template-columns:repeat(${cols},1fr);column-gap:calc(var(--u)*3.4);row-gap:calc(var(--u)*5)">
          ${s.palette.map((c) => `<div class="fb-in">
            <div style="aspect-ratio:3/4;background:${esc(c.hex)};box-shadow:inset 0 0 0 1px rgba(59,52,44,.07)"></div>
            <div class="fb-serif" style="font-weight:400;font-size:calc(var(--u)*2.7);margin-top:calc(var(--u)*1.8);line-height:1.1">${esc(c.name || '')}</div>
            <div style="font-size:calc(var(--u)*1.4);letter-spacing:.2em;color:#9A8C7C;margin-top:calc(var(--u)*.8);text-transform:uppercase">${esc(c.hex)}</div>
          </div>`).join('')}
        </div>
        ${folioR}`;
      }

    case 'opener':
      if (side === 'l') return `
        <div class="fb-in fb-kicker" style="${pad};top:calc(var(--u)*12);font-size:calc(var(--u)*1.75)">Space ${esc(s.no)}</div>
        <div style="${pad};bottom:calc(var(--u)*26)">
          <div class="fb-in fb-serif" style="font-size:calc(var(--u)*9.6);line-height:.98;letter-spacing:-.01em">${esc(s.name)}</div>
          ${s.goal ? `<div class="fb-in" style="font-weight:300;font-size:calc(var(--u)*2.7);line-height:1.55;color:#6A6154;margin-top:calc(var(--u)*4.4);max-width:calc(var(--u)*64)">${esc(s.goal)}</div>` : ''}
        </div>
        ${folioL}`;
      return `${s.image.kind === 'board' ? `<div class="fb-in fb-kicker" style="${pad};top:calc(var(--u)*12);font-size:calc(var(--u)*1.75)">Moodboard</div>` : ''}${plate(s.image)}${folioR}`;

    case 'full':
      return s.image.kind === 'board'
        ? board(s.image, side === 'l' ? 'left:calc(var(--u)*9);width:calc(var(--u)*182);top:calc(var(--u)*10);bottom:calc(var(--u)*12)' : 'left:calc(var(--u)*-91);width:calc(var(--u)*182);top:calc(var(--u)*10);bottom:calc(var(--u)*12)')
        : fullPhoto(s.image);

    case 'pair':
      return plate(side === 'l' ? s.left : s.right);

    case 'solo':
      if (side === 'l') return `
        <div style="${pad};bottom:calc(var(--u)*26)">
          <div class="fb-in fb-kicker" style="font-size:calc(var(--u)*1.75)">${esc(s.room)}</div>
          ${s.image.title ? `<div class="fb-in fb-serif" style="font-size:calc(var(--u)*4.2);line-height:1.15;margin-top:calc(var(--u)*2.6)">${esc(s.image.title)}</div>` : ''}
        </div>
        ${folioL}`;
      return plate(s.image);

    case 'back': {
      const c = s.contact || {};
      if (side === 'l') return `<img class="fb-in" src="${LOGO}" alt="" style="position:absolute;left:18%;top:50%;width:64%;transform:translateY(-50%)">`;
      const handle = (x) => String(x || '').trim();
      const rows = [
        ['Website', handle(c.website)], ['Email', handle(c.email)], ['Phone', handle(c.phone)],
        ['Instagram', handle(c.instagram)], ['TikTok', handle(c.tiktok)], ['Pinterest', handle(c.pinterest)],
        ['Houzz', handle(c.houzz)], ['Facebook', handle(c.facebook)], ['LinkedIn', handle(c.linkedin)],
      ].filter((r) => r[1]);
      return `
        <div style="${pad};top:50%;transform:translateY(-50%)">
          <div class="fb-in fb-serif" style="font-size:calc(var(--u)*6.2);line-height:1.05">Contact</div>
          <div class="fb-in" style="width:calc(var(--u)*9);height:1px;background:#A98A5F;margin:calc(var(--u)*5) 0 calc(var(--u)*5)"></div>
          ${rows.map((r) => `<div class="fb-in" style="display:flex;gap:calc(var(--u)*3);align-items:baseline;margin-bottom:calc(var(--u)*2.2)">
            <div class="fb-kicker" style="width:calc(var(--u)*19);font-size:calc(var(--u)*1.45);flex:none">${esc(r[0])}</div>
            <div style="font-weight:300;font-size:calc(var(--u)*2.8);color:#3B342C">${esc(r[1])}</div></div>`).join('')}
        </div>`;
    }
  }
  return '';
}

/* ---------------------------------------------------------------- geometry */

// The turning page is the right-hand page folding over along a straight
// line. Its bottom-outer corner travels from (W,H) to (-W,H), lifting on the
// way; the fold line is the perpendicular bisector between where the corner
// started and where it is now. Everything past the line is the part already
// turned: reflected across it, it shows the page's back (the next spread's
// left page). Coordinates are right-page space: x from the spine, y down.
function foldAt(p, W, H) {
  const lift = 0.085 * H * Math.sin(Math.PI * p);
  const cx = W - 2 * W * p, cy = H - lift;
  let nx = W - cx, ny = H - cy;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len; ny /= len;
  return { mx: (W + cx) / 2, my: (H + cy) / 2, nx, ny };
}

function clipHalf(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const k = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
  }
  return out;
}
const polyCss = (pts) => pts.length < 3 ? 'polygon(0 0,0 0,0 0)' : 'polygon(' + pts.map((q) => q[0].toFixed(2) + 'px ' + q[1].toFixed(2) + 'px').join(',') + ')';

// A soft band of shadow starting on line (ox,oy) and running along (dx,dy),
// in some page's local coordinates.
function band(el, ox, oy, dx, dy, length, H, gradient, opacity) {
  el.style.display = 'block';
  el.style.width = length + 'px';
  el.style.height = (H * 4) + 'px';
  el.style.transform = `translate(${ox}px,${oy}px) rotate(${Math.atan2(dy, dx)}rad) translate(0,${-2 * H}px)`;
  el.style.background = gradient;
  el.style.opacity = opacity;
}

/* ---------------------------------------------------------------- player */

/** Builds the book in `root` and returns { duration, render(t), ready }.
 *  render(t) is the only thing that moves anything. */
export function createFlipbook(root, book, formatKey = '16x9') {
  const F = FORMATS[formatKey] || FORMATS['16x9'];
  const W = F.pageW, H = F.pageH;
  const T = TIMING;
  const tl = timeline(book);

  root.innerHTML = '';
  root.style.width = F.w + 'px';
  root.style.height = F.h + 'px';
  root.style.position = 'relative';
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  const stage = document.createElement('div');
  stage.className = 'fb-stage';
  stage.style.setProperty('--fb-linen', LINEN);
  stage.style.setProperty('--fb-paper', NOISE(0.85, 0.10));
  stage.style.setProperty('--u', (W / 100) + 'px');
  root.appendChild(stage);

  const bookEl = document.createElement('div');
  bookEl.className = 'fb-book';
  bookEl.style.left = (F.w / 2) + 'px';
  bookEl.style.top = Math.round((F.h - H) / 2 - H * 0.012) + 'px';
  stage.appendChild(bookEl);
  // Page block thickness and the book's own soft shadow, under everything.
  bookEl.insertAdjacentHTML('beforeend', `
    <div class="fb-shadow" style="left:${-W}px;width:${2 * W}px;height:${H}px;box-shadow:0 ${H * 0.045}px ${H * 0.07}px ${-H * 0.012}px rgba(62,44,26,.30),0 ${H * 0.012}px ${H * 0.02}px rgba(62,44,26,.16),0 ${H * 0.10}px ${H * 0.16}px ${-H * 0.04}px rgba(62,44,26,.20)"></div>
    <div class="fb-under l" style="left:${-W - 3}px;width:${W + 3}px;height:${H + 1}px;background:#F1E9DC"></div>
    <div class="fb-under r" style="left:0;width:${W + 3}px;height:${H + 1}px;background:#F1E9DC"></div>`);

  const pages = book.spreads.map((s) => ['l', 'r'].map((side) => {
    const holder = document.createElement('div');
    holder.className = 'fb-holder';
    const page = document.createElement('div');
    page.className = 'fb-page ' + side;
    page.style.width = W + 'px';
    page.style.height = H + 'px';
    page.innerHTML = pageHtml(s, side, book) + '<div class="fb-crease"></div><div class="fb-fx"></div>';
    holder.appendChild(page);
    bookEl.appendChild(holder);
    return {
      holder, page, side, fx: page.querySelector('.fb-fx'),
      kbs: Array.from(page.querySelectorAll('.fb-kb')),
      ins: Array.from(page.querySelectorAll('.fb-in')),
    };
  }));

  const imgs = Array.from(root.querySelectorAll('img'));
  const ready = Promise.all([
    document.fonts ? document.fonts.ready : null,
    ...imgs.map((im) => (im.complete ? (im.decode ? im.decode().catch(() => {}) : null) : new Promise((r) => { im.onload = im.onerror = () => r(); }).then(() => im.decode && im.decode().catch(() => {})))),
  ]);

  // When does each spread's text start fading in? On the first spread, just
  // after the video's own fade-in; afterwards, as the page turning onto it
  // is about to land.
  const textStart = tl.starts.map((s, i) => (i === 0 ? 0.35 : s - 0.3));

  let shown = new Set();
  const place = (pg, role, z, extra) => {
    shown.add(pg);
    const h = pg.holder;
    h.style.display = 'block';
    h.style.zIndex = z;
    h.style.filter = (extra && extra.filter) || 'none';
    h.style.transform = role === 'left' ? `translate(${-W}px,0)` : role === 'right' ? 'translate(0,0)' : extra.matrix;
    pg.page.style.clipPath = (extra && extra.clip) || 'none';
    if (!(extra && extra.fx)) pg.fx.style.display = 'none';
  };

  const zoomSpread = (i, z) => {
    for (const pg of pages[i]) for (const el of pg.kbs) {
      const isBoard = el.dataset.kb === 'board';
      const s = 1 + (isBoard ? T.boardZoom : T.zoom) * z;
      const dx = Number(el.dataset.dx) * T.drift * z, dy = Number(el.dataset.dy) * T.drift * z;
      el.style.transform = `translate3d(${dx.toFixed(4)}%,${dy.toFixed(4)}%,0) scale(${s.toFixed(5)})`;
    }
  };
  const textSpread = (i, t) => {
    let k = 0;
    for (const pg of pages[i]) for (const el of pg.ins) {
      const q = easeOut(clamp((t - textStart[i] - 0.07 * k++) / T.textIn, 0, 1));
      el.style.opacity = q.toFixed(4);
      el.style.translate = `0 ${((1 - q) * 8).toFixed(3)}px`;
    }
  };

  function render(t) {
    t = clamp(t, 0, tl.total);
    const prev = shown;
    shown = new Set();
    const n = book.spreads.length;
    let i = 0;
    while (i < n - 1 && t >= tl.starts[i + 1]) i++;
    const restEnd = tl.starts[i] + tl.holds[i];
    const zoomOf = (k) => clamp((t - tl.starts[k]) / tl.holds[k], 0, 1);

    if (t <= restEnd || i === n - 1) {
      // Resting on spread i.
      place(pages[i][0], 'left', 1);
      place(pages[i][1], 'right', 1);
      zoomSpread(i, zoomOf(i));
      textSpread(i, t);
    } else {
      // Turning from spread i to i+1. The outgoing spread keeps its final
      // zoom; the incoming one waits at 1.00 until it lands.
      const p = easeFlip(clamp((t - restEnd) / T.flip, 0, 1));
      const cur = pages[i], next = pages[i + 1];
      zoomSpread(i, 1);
      zoomSpread(i + 1, 0);
      textSpread(i, t);
      textSpread(i + 1, t);
      const { mx, my, nx, ny } = foldAt(Math.max(p, 1e-4), W, H);
      const f = (q) => (q[0] - mx) * nx + (q[1] - my) * ny;
      const rect = [[0, 0], [W, 0], [W, H], [0, H]];
      const turned = clipHalf(rect, f);
      const flat = clipHalf(rect, (q) => -f(q));
      // Shadows swell mid-turn and are exactly zero as the page leaves and
      // lands, so nothing pops when the flip hands over to the resting spread.
      const lift = Math.sin(Math.PI * p);

      place(cur[0], 'left', 1);
      place(next[1], 'right', 1, { fx: true });
      // Shadow the lifted page throws onto the page it uncovers.
      band(next[1].fx, mx, my, nx, ny, W * 0.22, H,
        'linear-gradient(to right,rgba(40,28,16,.34),rgba(40,28,16,.12) 30%,rgba(40,28,16,0))', lift.toFixed(3));
      place(cur[1], 'right', 2, { clip: polyCss(flat) });

      // The back: map its own (u,v) to right-page space — mirror u, then
      // reflect across the fold. Two reflections make a plain rotation.
      const r00 = 1 - 2 * nx * nx, r01 = -2 * nx * ny, r11 = 1 - 2 * ny * ny;
      const dot = mx * nx + my * ny;
      const e = r00 * W + 2 * dot * nx, fy = r01 * W + 2 * dot * ny;
      const matrix = `matrix(${(-r00).toFixed(6)},${(-r01).toFixed(6)},${r01.toFixed(6)},${r11.toFixed(6)},${e.toFixed(3)},${fy.toFixed(3)})`;
      const backClip = turned.map((q) => [W - q[0], q[1]]);
      place(next[0], 'back', 3, {
        matrix, clip: polyCss(backClip), fx: true,
        filter: `drop-shadow(0 ${(H * 0.006 * lift).toFixed(2)}px ${(H * 0.02 * lift + 1).toFixed(2)}px rgba(40,28,16,${(0.32 * lift).toFixed(3)}))`,
      });
      // Shading across the back as it curves away from the fold.
      band(next[0].fx, W - mx, my, -nx, ny, W * 0.55, H,
        'linear-gradient(to right,rgba(40,28,16,.16),rgba(255,253,248,.10) 14%,rgba(40,28,16,.03) 45%,rgba(40,28,16,0))', lift.toFixed(3));
    }
    for (const pg of prev) if (!shown.has(pg)) pg.holder.style.display = 'none';
  }

  render(0);
  return { duration: tl.total, timeline: tl, render, ready, format: F };
}
