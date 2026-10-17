// Flipbook video export — a project's Concept or Design & sourcing phase as
// a single-page flipbook: every page fills the whole screen and turns over
// completely, like a tablet magazine. Cover, direction + palette, then each
// space (a chapter page, its moodboards, then its ultra-realistic
// renderings), then the studio's back cover.
//
// Everything on screen is a pure function of time. render(t) places the
// page turn, the Ken Burns zoom and the text fades exactly where they are at
// t seconds — no CSS animation, no timers — so the preview (driven by
// requestAnimationFrame) and the server render (stepping t frame by frame)
// show identical frames, and a captured frame is never between two states.

export const FORMATS = {
  '16x9': { w: 1920, h: 1080, label: 'Phone · 16:9' },
  '4x3': { w: 1440, h: 1080, label: 'iPad · 4:3' },
};

export const TIMING = {
  flip: 1.1,          // one page turn
  minHold: 2.5,       // time a page rests, clamped to this range…
  maxHold: 4,
  target: 75,         // …aiming at this total
  maxTotal: 90,       // above this the export warns before rendering
  coverExtra: 1,      // cover and back cover rest a second longer
  textIn: 0.6,        // fade + 8px rise for text and swatches, on entry only
  zoom: 0.05,         // Ken Burns: 1.00 → 1.05 over a page's rest
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

/** Project → the list of pages. Async because a rendering's orientation
 *  decides its layout (landscape fills the page, portraits pair up side by
 *  side), and that needs each image's size. */
export async function buildBook(project, opts = {}) {
  const p = project || {};
  const phase = opts.phase === 'design' ? 'design' : 'concept';
  const hidden = p.reportHidden || {};
  const contact = opts.contact || {};
  const resolve = opts.resolveUrl || ((u) => u);
  const ph = p.phases || {};
  const pages = [];
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
  pages.push({
    kind: 'cover', hold: 'cover',
    project: p.name || '', title: p.tagline || p.name || '', client: p.client || '', location: p.location || '',
    hero: hero ? await img({ url: hero }, 'photo') : null,
  });

  const headlineKey = phase === 'design' ? 'designDirection' : 'direction';
  const headline = hidden[headlineKey] ? '' : firstSentence((ph.concept && (ph.concept.concept || ph.concept.note)) || '');
  const palette = hidden.palette ? [] : (p.palette || []).filter((c) => c && c.hex).slice(0, 8);
  if (headline || palette.length) pages.push({ kind: 'concept', headline, palette });

  const moodKey = phase === 'design' ? 'designMood' : 'mood';
  if (!hidden[moodKey]) {
    let spaceNo = 0;
    for (const room of p.rooms || []) {
      const { boards, renders } = roomImages(room, phase);
      const bImgs = (await Promise.all(boards.map((m) => img(m, 'board')))).filter(Boolean);
      const rImgs = (await Promise.all(renders.map((m) => img(m, 'photo')))).filter(Boolean);
      if (!bImgs.length && !rImgs.length) continue;
      spaceNo++;
      const no = String(spaceNo).padStart(2, '0');
      pages.push({ kind: 'chapter', no, name: room.name || '', goal: room.goal || '' });
      for (const b of bImgs) pages.push({ kind: 'board', image: b, room: room.name || '' });
      const queue = rImgs.slice();
      while (queue.length) {
        const a = queue.shift();
        if (a.landscape) { pages.push({ kind: 'photo', image: a, room: room.name || '' }); continue; }
        if (queue.length && !queue[0].landscape) { pages.push({ kind: 'pair', left: a, right: queue.shift(), room: room.name || '' }); continue; }
        pages.push({ kind: 'solo', image: a, room: room.name || '' });
      }
    }
  }

  pages.push({ kind: 'back', hold: 'cover', contact });
  return { pages, phase, projectName: p.name || '', phaseLabel: phase === 'design' ? 'Design & sourcing' : 'Concept' };
}

/** Rest time per page so the whole film lands near TIMING.target, within the
 *  min/max hold. `over` is set when even the minimum runs past maxTotal. */
export function timeline(book) {
  const n = book.pages.length;
  const T = TIMING;
  const flips = Math.max(0, n - 1) * T.flip;
  const extras = book.pages.filter((s) => s.hold === 'cover').length * T.coverExtra;
  const base = clamp((T.target - flips - extras) / n, T.minHold, T.maxHold);
  const holds = book.pages.map((s) => base + (s.hold === 'cover' ? T.coverExtra : 0));
  const starts = [];
  let t = 0;
  holds.forEach((h, i) => { starts.push(t); t += h + (i < n - 1 ? T.flip : 0); });
  const minTotal = n * T.minHold + extras + flips;
  return { holds, starts, total: t, base, pages: n, over: minTotal > T.maxTotal ? minTotal : 0 };
}

/* ---------------------------------------------------------------- markup */

const CSS = `
.fb-stage{position:absolute;inset:0;overflow:hidden;background:#FBF7F1;font-family:'Jost',sans-serif;color:#3B342C;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.fb-page{position:absolute;left:0;top:0;overflow:hidden;background:#FBF7F1;display:none}
.fb-paper{position:absolute;inset:0;background-image:var(--fb-paper);opacity:.5;mix-blend-mode:multiply;pointer-events:none}
.fb-fx{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;z-index:6;display:none}
.fb-flap{position:absolute;left:0;top:0;display:none;pointer-events:none}
.fb-flap-in{position:absolute;inset:0;background:#F4EEE4;overflow:hidden}
.fb-flap-in::before{content:'';position:absolute;inset:0;background-image:var(--fb-paper);opacity:.55;mix-blend-mode:multiply}
.fb-photo{position:absolute;overflow:hidden}
.fb-kb{position:absolute;inset:0;transform-origin:50% 50%}
.fb-photo .fb-kb img{width:100%;height:100%;object-fit:cover;display:block}
.fb-board{position:absolute;display:flex;align-items:center;justify-content:center}
.fb-board .fb-kb{display:flex;align-items:center;justify-content:center;mix-blend-mode:multiply}
.fb-board img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}
.fb-in{will-change:opacity}
.fb-kicker{font-weight:500;text-transform:uppercase;letter-spacing:.32em;color:#A98A5F;font-size:calc(var(--u)*1.55)}
.fb-serif{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;color:#3B342C}
.fb-folio{position:absolute;bottom:calc(var(--u)*4.2);font-size:calc(var(--u)*1.3);letter-spacing:.3em;text-transform:uppercase;color:#B3A695;font-weight:400}
`;

const NOISE = (freq, alpha) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' stitchTiles='stitch' seed='7'/><feColorMatrix values='0 0 0 0 0.42  0 0 0 0 0.36  0 0 0 0 0.29  0 0 0 ${alpha} 0'/></filter><rect width='300' height='300' filter='url(#n)'/></svg>`)}")`;

// A page's HTML, written in the frame's own coordinates. Sizes use --u (1%
// of the frame height), so 16:9 and 4:3 share one layout; widths that must
// follow the frame use %.
function pageHtml(s, book) {
  const M = 'calc(var(--u)*8)';
  const folios = `<div class="fb-folio" style="left:${M}">Cybelle Sampaio Studio</div><div class="fb-folio" style="right:${M}">${esc(book.projectName)} · ${esc(book.phaseLabel)}</div>`;
  const kb = (im, kind) => `<div class="fb-kb" data-kb="${kind}" data-dx="${kind === 'board' ? 0 : im.drift[0]}" data-dy="${kind === 'board' ? 0 : im.drift[1]}"><img src="${esc(im.url)}" alt="" decoding="sync"></div>`;
  const photo = (im, box) => `<div class="fb-photo" style="${box}">${kb(im, 'photo')}</div>`;
  const board = (im, box) => `<div class="fb-board" style="${box}">${kb(im, 'board')}</div>`;
  const caption = (text) => `<div class="fb-in fb-kicker" style="position:absolute;left:${M};bottom:calc(var(--u)*3.6);font-size:calc(var(--u)*1.35);color:#9A8C7C">${esc(text)}</div>`;

  switch (s.kind) {
    case 'cover': {
      const split = s.hero ? '42%' : '100%';
      return `
        <div style="position:absolute;left:0;top:0;bottom:0;width:${split}">
          <div class="fb-in fb-kicker" style="position:absolute;left:${M};top:calc(var(--u)*9)">${esc(s.project)}</div>
          <div style="position:absolute;left:${M};right:calc(var(--u)*6);bottom:calc(var(--u)*27)">
            <div class="fb-in fb-serif" style="font-size:calc(var(--u)*7.6);line-height:1.02;letter-spacing:-.01em">${esc(s.title)}</div>
            <div class="fb-in" style="width:calc(var(--u)*7);height:1px;background:#A98A5F;margin:calc(var(--u)*4.4) 0 calc(var(--u)*3.4)"></div>
            ${s.client ? `<div class="fb-in" style="font-weight:300;font-size:calc(var(--u)*2.3);color:#6A6154">Prepared for ${esc(s.client)}</div>` : ''}
            ${s.location ? `<div class="fb-in fb-kicker" style="margin-top:calc(var(--u)*1.4);font-size:calc(var(--u)*1.3);color:#9A8C7C;letter-spacing:.28em">${esc(s.location)}</div>` : ''}
          </div>
          <img class="fb-in" src="${LOGO}" alt="" style="position:absolute;left:calc(var(--u)*6.3);bottom:calc(var(--u)*6);height:calc(var(--u)*13)">
        </div>
        ${s.hero ? photo(s.hero, 'left:42%;top:0;right:0;bottom:0') : ''}`;
    }

    case 'concept': {
      const n = s.palette.length;
      const cols = n <= 3 ? n : (n <= 4 ? 2 : (n <= 6 ? 3 : 4));
      return `
        <div style="position:absolute;left:0;top:0;bottom:0;width:${n ? '46%' : '100%'}">
          <div class="fb-in fb-kicker" style="position:absolute;left:${M};top:calc(var(--u)*9)">The direction</div>
          <div class="fb-in fb-serif" style="position:absolute;left:${M};right:calc(var(--u)*7);top:50%;transform:translateY(-50%);font-size:calc(var(--u)*4.7);line-height:1.2">${esc(s.headline)}</div>
        </div>
        ${n ? `<div style="position:absolute;left:46%;top:0;bottom:0;right:0">
          <div class="fb-in fb-kicker" style="position:absolute;left:calc(var(--u)*2);top:calc(var(--u)*9)">Palette</div>
          <div style="position:absolute;left:calc(var(--u)*2);right:${M};top:calc(var(--u)*18);bottom:calc(var(--u)*13);display:grid;grid-template-columns:repeat(${cols},1fr);grid-auto-rows:1fr;column-gap:calc(var(--u)*2.6);row-gap:calc(var(--u)*3)">
            ${s.palette.map((c) => `<div class="fb-in" style="display:flex;flex-direction:column;min-height:0">
              <div style="flex:1;min-height:0;background:${esc(c.hex)};box-shadow:inset 0 0 0 1px rgba(59,52,44,.07)"></div>
              <div class="fb-serif" style="font-weight:400;font-size:calc(var(--u)*2.5);margin-top:calc(var(--u)*1.3);line-height:1.1">${esc(c.name || '')}</div>
              <div style="font-size:calc(var(--u)*1.2);letter-spacing:.2em;color:#9A8C7C;margin-top:calc(var(--u)*.5);text-transform:uppercase">${esc(c.hex)}</div>
            </div>`).join('')}
          </div>
        </div>` : ''}
        ${folios}`;
    }

    case 'chapter':
      return `
        <div class="fb-in fb-serif" style="position:absolute;right:calc(var(--u)*7);top:50%;transform:translateY(-54%);font-size:calc(var(--u)*40);line-height:1;color:#EFE6D8;font-weight:300">${esc(s.no)}</div>
        <div class="fb-in fb-kicker" style="position:absolute;left:${M};top:calc(var(--u)*9)">Space ${esc(s.no)}</div>
        <div style="position:absolute;left:${M};right:40%;bottom:calc(var(--u)*24)">
          <div class="fb-in fb-serif" style="font-size:calc(var(--u)*11);line-height:.98;letter-spacing:-.01em">${esc(s.name)}</div>
          ${s.goal ? `<div class="fb-in" style="font-weight:300;font-size:calc(var(--u)*2.5);line-height:1.55;color:#6A6154;margin-top:calc(var(--u)*3.6);max-width:calc(var(--u)*72)">${esc(s.goal)}</div>` : ''}
        </div>
        ${folios}`;

    case 'board':
      return `${board(s.image, 'left:calc(var(--u)*4);right:calc(var(--u)*4);top:calc(var(--u)*4);bottom:calc(var(--u)*7)')}${caption(s.room + ' · Moodboard')}`;

    case 'photo':
      return photo(s.image, 'inset:0');

    case 'pair':
      return `${photo(s.left, 'left:0;top:0;bottom:0;width:calc(50% - var(--u)*0.4)')}${photo(s.right, 'right:0;top:0;bottom:0;width:calc(50% - var(--u)*0.4)')}`;

    case 'solo':
      return `
        <div style="position:absolute;left:${M};right:55%;bottom:calc(var(--u)*24)">
          <div class="fb-in fb-kicker">${esc(s.room)}</div>
          ${s.image.title ? `<div class="fb-in fb-serif" style="font-size:calc(var(--u)*4.4);line-height:1.15;margin-top:calc(var(--u)*2.2)">${esc(s.image.title)}</div>` : ''}
        </div>
        ${photo(s.image, `top:0;bottom:0;right:0;width:calc(var(--u)*${(100 * s.image.w / s.image.h).toFixed(2)});max-width:52%`)}`;

    case 'back': {
      const c = s.contact || {};
      const v = (x) => String(x || '').trim();
      const rows = [
        ['Website', v(c.website)], ['Email', v(c.email)], ['Phone', v(c.phone)],
        ['Instagram', v(c.instagram)], ['TikTok', v(c.tiktok)], ['Pinterest', v(c.pinterest)],
        ['Houzz', v(c.houzz)], ['Facebook', v(c.facebook)], ['LinkedIn', v(c.linkedin)],
      ].filter((r) => r[1]);
      return `
        <img class="fb-in" src="${LOGO}" alt="" style="position:absolute;left:25%;top:50%;width:min(36%,calc(var(--u)*62));transform:translate(-50%,-50%)">
        <div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:linear-gradient(transparent 22%,#E6DBCC 22%,#E6DBCC 78%,transparent 78%)"></div>
        <div style="position:absolute;left:56%;right:${M};top:50%;transform:translateY(-50%)">
          <div class="fb-in fb-serif" style="font-size:calc(var(--u)*5.6);line-height:1.05">Contact</div>
          <div class="fb-in" style="width:calc(var(--u)*7);height:1px;background:#A98A5F;margin:calc(var(--u)*3.6) 0 calc(var(--u)*3.8)"></div>
          ${rows.map((r) => `<div class="fb-in" style="display:flex;gap:calc(var(--u)*2.4);align-items:baseline;margin-bottom:calc(var(--u)*1.7)">
            <div class="fb-kicker" style="width:calc(var(--u)*14);font-size:calc(var(--u)*1.3);flex:none">${esc(r[0])}</div>
            <div style="font-weight:300;font-size:calc(var(--u)*2.5);color:#3B342C">${esc(r[1])}</div></div>`).join('')}
        </div>`;
    }
  }
  return '';
}

/* ---------------------------------------------------------------- geometry */

// The turning page folds along a straight line. Its bottom-right corner
// travels from (W,H) to (-W,H), lifting on the way; the fold line is the
// perpendicular bisector between where the corner started and where it is
// now. The part past the line has turned over: reflected across it, its
// paper back shows, and by the end the whole page has left the screen to
// the left, uncovering the next one. Coordinates: frame pixels, y down.
function foldAt(p, W, H) {
  const lift = 0.10 * H * Math.sin(Math.PI * p);
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

// A soft band of shade starting on the fold line and running along (dx,dy).
function band(el, ox, oy, dx, dy, length, H, gradient, opacity) {
  el.style.display = 'block';
  el.style.width = length + 'px';
  el.style.height = (H * 6) + 'px';
  el.style.transform = `translate(${ox}px,${oy}px) rotate(${Math.atan2(dy, dx)}rad) translate(0,${-3 * H}px)`;
  el.style.background = gradient;
  el.style.opacity = opacity;
}

/* ---------------------------------------------------------------- player */

/** Builds the book in `root` and returns { duration, render(t), ready }.
 *  render(t) is the only thing that moves anything. */
export function createFlipbook(root, book, formatKey = '16x9') {
  const F = FORMATS[formatKey] || FORMATS['16x9'];
  const W = F.w, H = F.h;
  const T = TIMING;
  const tl = timeline(book);

  root.innerHTML = '';
  root.style.width = W + 'px';
  root.style.height = H + 'px';
  root.style.position = 'relative';
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  const stage = document.createElement('div');
  stage.className = 'fb-stage';
  stage.style.setProperty('--fb-paper', NOISE(0.85, 0.10));
  stage.style.setProperty('--u', (H / 100) + 'px');
  root.appendChild(stage);

  const pages = book.pages.map((s) => {
    const page = document.createElement('div');
    page.className = 'fb-page';
    page.style.width = W + 'px';
    page.style.height = H + 'px';
    page.innerHTML = '<div class="fb-paper"></div>' + pageHtml(s, book) + '<div class="fb-fx"></div>';
    stage.appendChild(page);
    return {
      page, fx: page.querySelector('.fb-fx'),
      kbs: Array.from(page.querySelectorAll('.fb-kb')),
      ins: Array.from(page.querySelectorAll('.fb-in')),
    };
  });
  // The turning page's paper back: plain paper, clipped to the folded-over
  // part, with its own shading and a drop shadow onto what lies beneath.
  const flap = document.createElement('div');
  flap.className = 'fb-flap';
  flap.style.width = W + 'px';
  flap.style.height = H + 'px';
  flap.style.zIndex = 3;
  flap.innerHTML = '<div class="fb-flap-in"><div class="fb-fx"></div></div>';
  stage.appendChild(flap);
  const flapIn = flap.firstChild, flapFx = flapIn.querySelector('.fb-fx');

  const imgs = Array.from(root.querySelectorAll('img'));
  const ready = Promise.all([
    document.fonts ? document.fonts.ready : null,
    ...imgs.map((im) => (im.complete ? (im.decode ? im.decode().catch(() => {}) : null) : new Promise((r) => { im.onload = im.onerror = () => r(); }).then(() => im.decode && im.decode().catch(() => {})))),
  ]);

  // Text on the first page fades in just after the video's own fade-in;
  // afterwards, from the middle of the turn that uncovers it.
  const textStart = tl.starts.map((s, i) => (i === 0 ? 0.35 : s - 0.55));

  let shown = new Set();
  const show = (pg, z, clip, fx) => {
    shown.add(pg);
    pg.page.style.display = 'block';
    pg.page.style.zIndex = z;
    pg.page.style.clipPath = clip || 'none';
    if (!fx) pg.fx.style.display = 'none';
  };
  const zoomPage = (i, z) => {
    for (const el of pages[i].kbs) {
      const isBoard = el.dataset.kb === 'board';
      const s = 1 + (isBoard ? T.boardZoom : T.zoom) * z;
      const dx = Number(el.dataset.dx) * T.drift * z, dy = Number(el.dataset.dy) * T.drift * z;
      el.style.transform = `translate3d(${dx.toFixed(4)}%,${dy.toFixed(4)}%,0) scale(${s.toFixed(5)})`;
    }
  };
  const textPage = (i, t) => {
    pages[i].ins.forEach((el, k) => {
      const q = easeOut(clamp((t - textStart[i] - 0.07 * k) / T.textIn, 0, 1));
      el.style.opacity = q.toFixed(4);
      el.style.translate = `0 ${((1 - q) * 8).toFixed(3)}px`;
    });
  };

  function render(t) {
    t = clamp(t, 0, tl.total);
    const prev = shown;
    shown = new Set();
    const n = book.pages.length;
    let i = 0;
    while (i < n - 1 && t >= tl.starts[i + 1]) i++;
    const restEnd = tl.starts[i] + tl.holds[i];
    const zoomOf = (k) => clamp((t - tl.starts[k]) / tl.holds[k], 0, 1);

    if (t <= restEnd || i === n - 1) {
      show(pages[i], 1);
      zoomPage(i, zoomOf(i));
      textPage(i, t);
      flap.style.display = 'none';
    } else {
      // Turning page i over to reveal page i+1. The outgoing page keeps its
      // final zoom; the incoming one waits at 1.00 until it is uncovered.
      const p = easeFlip(clamp((t - restEnd) / T.flip, 0, 1));
      const cur = pages[i], next = pages[i + 1];
      zoomPage(i, 1);
      zoomPage(i + 1, 0);
      textPage(i, t);
      textPage(i + 1, t);
      const { mx, my, nx, ny } = foldAt(Math.max(p, 1e-4), W, H);
      const f = (q) => (q[0] - mx) * nx + (q[1] - my) * ny;
      const rect = [[0, 0], [W, 0], [W, H], [0, H]];
      const flat = clipHalf(rect, (q) => -f(q));
      // The turned part doesn't lie flat: it rolls, so its back shows as a
      // strip ROLL times as wide as the part already turned, leaning over the
      // page rather than covering it.
      const ROLL = 0.32;
      const raw = clipHalf(rect, f);
      const depth = raw.reduce((m, q) => Math.max(m, f(q)), 0);
      const turned = raw.map((q) => { const d = (1 + ROLL) * f(q); return [q[0] - d * nx, q[1] - d * ny]; });
      // Shadows swell mid-turn and are exactly zero as the page leaves and
      // lands, so nothing pops when the turn hands over to the resting page.
      const lift = Math.sin(Math.PI * p);

      show(next, 1, null, true);
      band(next.fx, mx, my, nx, ny, W * 0.16, H,
        'linear-gradient(to right,rgba(40,28,16,.36),rgba(40,28,16,.12) 30%,rgba(40,28,16,0))', lift.toFixed(3));
      show(cur, 2, polyCss(flat));

      flap.style.display = 'block';
      flap.style.filter = `drop-shadow(${(-W * 0.004 * lift).toFixed(2)}px ${(H * 0.004 * lift).toFixed(2)}px ${(H * 0.022 * lift + 0.5).toFixed(2)}px rgba(40,28,16,${(0.34 * lift).toFixed(3)}))`;
      flapIn.style.clipPath = polyCss(turned);
      // Shading across the roll: dark in the crease, a soft highlight where
      // it faces the light, darker again towards its far edge.
      band(flapFx, mx, my, -nx, -ny, Math.max(1, ROLL * depth), H,
        'linear-gradient(to right,rgba(40,28,16,.26),rgba(40,28,16,.06) 18%,rgba(255,253,248,.22) 42%,rgba(255,253,248,.05) 62%,rgba(40,28,16,.12) 92%,rgba(40,28,16,.2))', Math.min(1, 0.4 + lift).toFixed(3));
    }
    for (const pg of prev) if (!shown.has(pg)) pg.page.style.display = 'none';
  }

  render(0);
  return { duration: tl.total, timeline: tl, render, ready, format: F };
}
