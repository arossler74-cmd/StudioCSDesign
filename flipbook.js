// Interactive flipbook — a project's Concept or Design & sourcing phase as a
// book the client turns themselves: click or tap a side, use the arrow keys,
// or drag a page. Landscape screens get an open book of iPad-shaped pages
// (moodboards and renderings across the whole spread; cover and back cover
// closed on their own, like Flipsnack); portrait phones get one full-screen
// page at a time that curls away.
//
// Content: cover, direction + palette, then each space (a chapter opening,
// its moodboards, then its ultra-realistic renderings), then the studio's
// contact page. Floor plans, SketchUp, 2D layouts, prices and tables never
// appear.
//
// Drawing is a pure function of (spread, corner position): draw() can put
// the turning page anywhere in its turn, so clicks, drags and the hover peel
// all go through the same geometry. (flipbook-video.js is the timed,
// render(t) version of the same book, for exporting an MP4.)

const LOGO = 'assets/cybelle-logo-hires.png';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (x) => 0.5 - Math.cos(Math.PI * x) / 2;
const FLIP_MS = 850;
const BAR = 52;

/* ---------------------------------------------------------------- content */

function firstSentence(text) {
  const s = String(text || '').trim();
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim();
}

function loadSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Which images a space contributes, in carousel order: its moodboards, then
 *  its ultra-realistic renderings. Design falls back to Concept's moodboards
 *  when it has none of its own. */
function roomImages(room, phase) {
  const concept = room.conceptMedia || (room.moodboard || []).map((url) => ({ type: 'moodboard', url, title: '' }));
  const own = phase === 'design' ? (room.designMedia || []) : concept;
  let boards = own.filter((m) => m.type === 'moodboard' && m.url);
  if (phase === 'design' && !boards.length) boards = concept.filter((m) => m.type === 'moodboard' && m.url);
  const renders = own.filter((m) => m.type === 'rendering' && m.url);
  return { boards, renders };
}

/** Project → the ordered content units. Async because each image's shape
 *  decides its layout (landscape across a spread, portrait on one page). */
export async function buildBook(project, opts = {}) {
  const p = project || {};
  const phase = opts.phase === 'design' ? 'design' : 'concept';
  const hidden = p.reportHidden || {};
  const ph = p.phases || {};
  const units = [];
  const img = async (m, kind) => {
    const size = await loadSize(m.url);
    return size ? { url: m.url, w: size.w, h: size.h, kind, title: m.title || '', landscape: size.w >= size.h } : null;
  };

  const hero = p.hero || p.cover || '';
  units.push({ kind: 'cover', project: p.name || '', title: p.tagline || p.name || '', client: p.client || '', location: p.location || '', hero: hero ? await img({ url: hero }, 'photo') : null });

  const headline = hidden[phase === 'design' ? 'designDirection' : 'direction'] ? '' : firstSentence((ph.concept && (ph.concept.concept || ph.concept.note)) || '');
  const palette = hidden.palette ? [] : (p.palette || []).filter((c) => c && c.hex).slice(0, 8);
  if (headline) units.push({ kind: 'direction', headline });
  if (palette.length) units.push({ kind: 'palette', palette });

  if (!hidden[phase === 'design' ? 'designMood' : 'mood']) {
    let no = 0;
    for (const room of p.rooms || []) {
      const { boards, renders } = roomImages(room, phase);
      const b = (await Promise.all(boards.map((m) => img(m, 'board')))).filter(Boolean);
      const r = (await Promise.all(renders.map((m) => img(m, 'photo')))).filter(Boolean);
      if (!b.length && !r.length) continue;
      const name = room.name || '';
      units.push({ kind: 'chapter', name, no: String(++no).padStart(2, '0'), goal: room.goal || '' });
      for (const x of b) units.push({ kind: 'board', image: x, room: name });
      for (const x of r) units.push({ kind: x.landscape ? 'photo' : 'vertical', image: x, room: name });
    }
  }
  units.push({ kind: 'back', contact: opts.contact || {} });
  return { units, projectName: p.name || '', phaseLabel: phase === 'design' ? 'Design & sourcing' : 'Concept' };
}

/** Units → pages for a layout. 'spread': the cover alone on the right, then
 *  left/right pairs, every landscape image across a whole spread, and the
 *  back cover alone on the left. 'single': one page per unit. */
export function paginate(book, mode) {
  const pages = [];
  const add = (kind, u, ui, extra) => pages.push({ kind, u, ui, ...extra });
  const units = book.units;
  if (mode === 'single') {
    units.forEach((u, ui) => add(u.kind === 'board' || u.kind === 'photo' ? 'plate' : u.kind, u, ui));
    return pages;
  }
  // pages[0] is the cover (a right page); pages[2k-1] / pages[2k] are the
  // left / right of spread k. Two-page items always start on a left page.
  const toLeft = (u, i) => { if (pages.length % 2 === 0) add('blank', u, i); };
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    switch (u.kind) {
      case 'cover': add('cover', u, i); break;
      case 'direction':
        toLeft(u, i);
        add('direction', u, i);
        if (units[i + 1] && units[i + 1].kind === 'palette') { add('palette', units[i + 1], i + 1); i++; } else add('blank', u, i);
        break;
      case 'palette': toLeft(u, i); add('blank', u, i); add('palette', u, i); break;
      case 'chapter': toLeft(u, i); add('chapter', u, i); add('numeral', u, i); break;
      case 'board': case 'photo': toLeft(u, i); add('spread', u, i, { half: 'l' }); add('spread', u, i, { half: 'r' }); break;
      case 'vertical':
        toLeft(u, i);
        if (units[i + 1] && units[i + 1].kind === 'vertical') { add('vertical', u, i); add('vertical', units[i + 1], i + 1); i++; }
        else { add('caption', u, i); add('vertical', u, i); }
        break;
      case 'back': toLeft(u, i); add('back', u, i); break;
    }
  }
  return pages;
}

/* ---------------------------------------------------------------- markup */

const CSS = `
.fb{position:absolute;inset:0;overflow:hidden;background-color:#E8E0D3;font-family:'Jost',sans-serif;color:#3B342C;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none;touch-action:none;cursor:default}
.fb::before{content:'';position:absolute;inset:0;background-image:var(--fb-linen);opacity:.55;mix-blend-mode:multiply;pointer-events:none}
.fb::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,rgba(255,252,246,.5) 0%,rgba(255,252,246,0) 55%,rgba(70,52,34,.12) 100%);pointer-events:none}
.fb-book{position:absolute;z-index:1;width:0;height:0}
.fb-under{position:absolute;top:0;pointer-events:none;background:#F1E9DC}
.fb-holder{position:absolute;left:0;top:0;transform-origin:0 0;display:none}
.fb-page{position:absolute;left:0;top:0;overflow:hidden;background:#FBF7F1;cursor:pointer}
.fb-paper{position:absolute;inset:0;background-image:var(--fb-paper);opacity:.5;mix-blend-mode:multiply;pointer-events:none}
.fb-crease{position:absolute;inset:0;pointer-events:none;z-index:5}
.fb-page.l .fb-crease{background:linear-gradient(to left,rgba(58,42,26,.20) 0,rgba(58,42,26,.07) 2.2%,rgba(58,42,26,0) 8%),linear-gradient(to right,rgba(58,42,26,.05) 0,rgba(58,42,26,0) 3%)}
.fb-page.r .fb-crease{background:linear-gradient(to right,rgba(58,42,26,.22) 0,rgba(58,42,26,.08) 2.2%,rgba(255,255,255,.06) 5%,rgba(58,42,26,0) 9%),linear-gradient(to left,rgba(58,42,26,.05) 0,rgba(58,42,26,0) 3%)}
.fb-fx{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;z-index:6;display:none}
.fb-flap{position:absolute;left:0;top:0;display:none;pointer-events:none;z-index:3}
.fb-flap-in{position:absolute;inset:0;background:#F4EEE4;overflow:hidden}
.fb-flap-in::before{content:'';position:absolute;inset:0;background-image:var(--fb-paper);opacity:.55;mix-blend-mode:multiply}
.fb-photo{position:absolute;overflow:hidden}
.fb-photo img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.fb-board{position:absolute;display:flex;align-items:center;justify-content:center;mix-blend-mode:multiply}
.fb-board img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;pointer-events:none}
.fb-kicker{font-weight:500;text-transform:uppercase;letter-spacing:.3em;color:#A98A5F;font-size:max(calc(var(--u)*1.5),10.5px)}
.fb-serif{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;color:#3B342C}
.fb-body{font-weight:300;color:#6A6154;font-size:max(calc(var(--u)*2.1),13px);line-height:1.6}
.fb-folio{position:absolute;bottom:calc(var(--u)*4.4);font-size:max(calc(var(--u)*1.15),9px);letter-spacing:.28em;text-transform:uppercase;color:#B3A695}
.fb-ui{position:absolute;inset:0;pointer-events:none;z-index:10}
.fb-arrow{position:absolute;top:calc(50% - ${BAR / 2}px);transform:translateY(-50%);width:56px;height:100px;border:0;background:none;color:#6A6154;cursor:pointer;pointer-events:auto;opacity:.75;transition:opacity .2s}
.fb-arrow:hover{opacity:1}.fb-arrow[disabled]{opacity:0;pointer-events:none}
.fb-arrow svg{width:24px;height:44px}
.fb-bar{position:absolute;left:0;right:0;bottom:0;height:${BAR}px;display:flex;align-items:center;gap:18px;padding:0 22px;pointer-events:auto;color:#6A6154;font:400 12.5px/1 'Jost',sans-serif;letter-spacing:.08em}
.fb-bar input[type=range]{flex:1;min-width:60px;-webkit-appearance:none;appearance:none;height:22px;background:transparent;cursor:pointer}
.fb-bar input[type=range]::-webkit-slider-runnable-track{height:2px;background:#CDBFAA;border-radius:2px}
.fb-bar input[type=range]::-moz-range-track{height:2px;background:#CDBFAA;border-radius:2px}
.fb-bar input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;margin-top:-5.5px;border-radius:50%;background:#A98A5F;border:2px solid #FBF7F1;box-shadow:0 1px 3px rgba(62,44,26,.3)}
.fb-bar input[type=range]::-moz-range-thumb{width:11px;height:11px;border-radius:50%;background:#A98A5F;border:2px solid #FBF7F1}
.fb-bar button{border:1px solid rgba(106,97,84,.3);background:rgba(251,247,241,.7);color:#3B342C;border-radius:999px;padding:7px 14px;font:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:7px;flex:none}
.fb-count{min-width:76px;font-variant-numeric:tabular-nums;flex:none}
.fb.single .fb-arrow{display:none}
`;

const NOISE = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch' seed='7'/><feColorMatrix values='0 0 0 0 0.42  0 0 0 0 0.36  0 0 0 0 0.29  0 0 0 0.10 0'/></filter><rect width='300' height='300' filter='url(#n)'/></svg>`)}")`;
const LINEN = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='a'><feTurbulence type='fractalNoise' baseFrequency='0.9 0.035' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 0.40  0 0 0 0 0.33  0 0 0 0 0.25  0 0 0 0.35 0'/></filter><filter id='b'><feTurbulence type='fractalNoise' baseFrequency='0.035 0.9' numOctaves='2' seed='5'/><feColorMatrix values='0 0 0 0 0.40  0 0 0 0 0.33  0 0 0 0 0.25  0 0 0 0.30 0'/></filter><rect width='240' height='240' filter='url(#a)'/><rect width='240' height='240' filter='url(#b)'/></svg>`)}")`;

// One page's HTML in its own W×H box. --u is 1% of the page height (on
// narrow phones, of the width × 1.45), so every layout scales with the page.
function pageHtml(pg, book, W, single) {
  const u = pg.u;
  const M = 'calc(var(--u)*8)';
  const pad = `position:absolute;left:${M};right:${M}`;
  const folio = (side) => side === 'l'
    ? `<div class="fb-folio" style="left:${M}">Cybelle Sampaio Studio</div>`
    : `<div class="fb-folio" style="right:${M}">${esc(book.projectName)} · ${esc(book.phaseLabel)}</div>`;
  const pic = (im, box, cls = 'fb-photo') => `<div class="${cls}" style="${box}"><img src="${esc(im.url)}" alt="" draggable="false"></div>`;

  switch (pg.kind) {
    case 'cover':
      return u.hero ? `
        ${pic(u.hero, 'left:0;top:0;right:0;height:57%')}
        <div class="fb-kicker" style="${pad};top:61.5%">${esc(u.project)}</div>
        <div class="fb-serif" style="${pad};top:65.5%;font-size:calc(var(--u)*5.6);line-height:1.04">${esc(u.title)}</div>
        <div style="position:absolute;left:${M};bottom:calc(var(--u)*7.4)">
          ${u.client ? `<div class="fb-body">Prepared for ${esc(u.client)}</div>` : ''}
          ${u.location ? `<div class="fb-kicker" style="margin-top:calc(var(--u)*.9);color:#9A8C7C;font-size:max(calc(var(--u)*1.2),9.5px)">${esc(u.location)}</div>` : ''}
        </div>
        <img src="${LOGO}" alt="" draggable="false" style="position:absolute;right:calc(var(--u)*6);bottom:calc(var(--u)*5.6);height:calc(var(--u)*9.5)">` : `
        <img src="${LOGO}" alt="" draggable="false" style="position:absolute;left:18%;top:20%;width:64%">
        <div style="${pad};bottom:calc(var(--u)*14);text-align:center">
          <div class="fb-kicker">${esc(u.project)}</div>
          <div class="fb-serif" style="font-size:calc(var(--u)*5.6);line-height:1.04;margin-top:calc(var(--u)*2.4)">${esc(u.title)}</div>
          ${u.client ? `<div class="fb-body" style="margin-top:calc(var(--u)*2.4)">Prepared for ${esc(u.client)}</div>` : ''}
        </div>`;

    case 'direction':
      return `<div class="fb-kicker" style="${pad};top:calc(var(--u)*9)">The direction</div>
        <div class="fb-serif" style="${pad};top:50%;transform:translateY(-50%);font-size:calc(var(--u)*4.6);line-height:1.2">${esc(u.headline)}</div>${folio('l')}`;

    case 'palette':
      return `<div class="fb-kicker" style="${pad};top:calc(var(--u)*9)">Palette</div>
        <div style="${pad};top:calc(var(--u)*16);bottom:calc(var(--u)*12);display:grid;grid-template-columns:repeat(2,1fr);grid-auto-rows:1fr;column-gap:calc(var(--u)*3);row-gap:calc(var(--u)*2.6)">
          ${u.palette.map((c) => `<div style="display:flex;flex-direction:column;min-height:0">
            <div style="flex:1;min-height:0;background:${esc(c.hex)};box-shadow:inset 0 0 0 1px rgba(59,52,44,.07)"></div>
            <div class="fb-serif" style="font-weight:400;font-size:max(calc(var(--u)*2.3),15px);margin-top:calc(var(--u)*1.1);line-height:1.1">${esc(c.name || '')}</div>
            <div style="font-size:max(calc(var(--u)*1.1),9px);letter-spacing:.2em;color:#9A8C7C;margin-top:calc(var(--u)*.4);text-transform:uppercase">${esc(c.hex)}</div>
          </div>`).join('')}
        </div>${folio('r')}`;

    case 'chapter':
      return `${single ? `<div class="fb-serif" style="position:absolute;right:calc(var(--u)*5);top:calc(var(--u)*5);font-size:calc(var(--u)*24);line-height:1;color:#EFE6D8">${esc(u.no)}</div>` : ''}
        <div class="fb-kicker" style="${pad};top:calc(var(--u)*9)">Space ${esc(u.no)}</div>
        <div style="${pad};bottom:calc(var(--u)*22)">
          <div class="fb-serif" style="font-size:calc(var(--u)*8.4);line-height:1;letter-spacing:-.01em">${esc(u.name)}</div>
          ${u.goal ? `<div class="fb-body" style="margin-top:calc(var(--u)*3.2)">${esc(u.goal)}</div>` : ''}
        </div>${folio('l')}`;

    case 'numeral':
      return `<div class="fb-serif" style="position:absolute;left:0;right:0;top:50%;transform:translateY(-52%);text-align:center;font-size:calc(var(--u)*44);line-height:1;color:#EFE6D8">${esc(u.no)}</div>${folio('r')}`;

    case 'spread': {
      // A landscape image across both pages: each half draws the same
      // spread-wide picture, shifted, so the gutter splits it cleanly.
      const left = pg.half === 'l' ? 0 : -W;
      if (u.kind === 'photo') return pic(u.image, `left:${left}px;top:0;width:${2 * W}px;height:100%`);
      return `${pic(u.image, `left:calc(${left}px + var(--u)*4);top:calc(var(--u)*5);width:calc(${2 * W}px - var(--u)*8);bottom:calc(var(--u)*8.5)`, 'fb-board')}
        ${pg.half === 'l' ? `<div class="fb-kicker" style="position:absolute;left:${M};bottom:calc(var(--u)*3.8);color:#9A8C7C;font-size:max(calc(var(--u)*1.25),9.5px)">${esc(u.room)} · Moodboard</div>` : ''}`;
    }

    case 'plate':
      // Single-page layout of a landscape image: page-wide, on the paper,
      // its space named above. (Turn the phone sideways for the full spread.)
      return `<div class="fb-kicker" style="${pad};top:calc(var(--u)*9)">${esc(u.room)}${u.kind === 'board' ? ' · Moodboard' : ''}</div>
        ${pic(u.image, 'left:calc(var(--u)*2.5);right:calc(var(--u)*2.5);top:calc(var(--u)*14);bottom:calc(var(--u)*14)', 'fb-board')}${folio('r')}`;

    case 'vertical':
      return pic(u.image, 'inset:0');

    case 'caption':
      return `<div style="${pad};bottom:calc(var(--u)*22)">
          <div class="fb-kicker">${esc(u.room)}</div>
          ${u.image.title ? `<div class="fb-serif" style="font-size:calc(var(--u)*4.2);line-height:1.15;margin-top:calc(var(--u)*2)">${esc(u.image.title)}</div>` : ''}
        </div>${folio('l')}`;

    case 'back': {
      const c = u.contact || {};
      const v = (x) => String(x || '').trim();
      const rows = [['Website', v(c.website)], ['Email', v(c.email)], ['Phone', v(c.phone)], ['Instagram', v(c.instagram)], ['TikTok', v(c.tiktok)],
        ['Pinterest', v(c.pinterest)], ['Houzz', v(c.houzz)], ['Facebook', v(c.facebook)], ['LinkedIn', v(c.linkedin)]].filter((r) => r[1]);
      return `<img src="${LOGO}" alt="" draggable="false" style="position:absolute;left:50%;top:calc(var(--u)*13);width:min(64%,calc(var(--u)*52));transform:translateX(-50%)">
        <div style="${pad};top:calc(var(--u)*52)">
          <div style="width:calc(var(--u)*6);height:1px;background:#A98A5F;margin:0 auto calc(var(--u)*4.4)"></div>
          ${rows.map((r) => `<div style="text-align:center;margin-bottom:calc(var(--u)*2.2)">
            <div class="fb-kicker" style="font-size:max(calc(var(--u)*1.15),9px)">${esc(r[0])}</div>
            <div style="font-weight:300;font-size:max(calc(var(--u)*2.2),14px);color:#3B342C;margin-top:calc(var(--u)*.6)">${esc(r[1])}</div></div>`).join('')}
        </div>`;
    }
  }
  return '';
}

/* ---------------------------------------------------------------- geometry */

// A turning page folds along a straight line: the perpendicular bisector
// between its bottom-outer corner's resting place (W,H) and where the corner
// is now. Everything past the line has turned over. Coordinates are
// right-page space: x from the spine, y down.
const foldFrom = (W, H, cx, cy) => {
  let nx = W - cx, ny = H - cy;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len; ny /= len;
  return { mx: (W + cx) / 2, my: (H + cy) / 2, nx, ny };
};
// Where an automatic turn puts the corner at progress p: across to (-W,H),
// lifting on the way.
const cornerAt = (W, H, p) => [W - 2 * W * p, H - 0.09 * H * Math.sin(Math.PI * p)];
// A real page stays attached at the spine: its corner can't get further from
// the spine's foot than the page is wide, nor sink below the page.
function clampCorner(W, H, x, y) {
  y = Math.min(y, H);
  const dy = y - H, d = Math.hypot(x, dy);
  if (d > W) { x = x * W / d; y = H + dy * W / d; }
  return [x, y];
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
  el.style.width = Math.max(1, length) + 'px';
  el.style.height = (H * 6) + 'px';
  el.style.transform = `translate(${ox}px,${oy}px) rotate(${Math.atan2(dy, dx)}rad) translate(0,${-3 * H}px)`;
  el.style.background = gradient;
  el.style.opacity = opacity;
}

/* ---------------------------------------------------------------- viewer */

/** Mounts the interactive book in `root` (which it fills) and returns
 *  { next, prev, go, destroy }. */
export function createViewer(root, book) {
  root.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  const stage = document.createElement('div');
  stage.className = 'fb';
  stage.style.setProperty('--fb-linen', LINEN);
  stage.style.setProperty('--fb-paper', NOISE);
  root.appendChild(stage);
  const ui = document.createElement('div');
  ui.className = 'fb-ui';
  const chevron = (d) => `<svg viewBox="0 0 24 44" fill="none" stroke="currentColor" stroke-width="1.3"><path d="${d}"/></svg>`;
  ui.innerHTML = `
    <button type="button" class="fb-arrow" data-go="prev" aria-label="Previous page" style="left:8px">${chevron('M19 3 4 22l15 19')}</button>
    <button type="button" class="fb-arrow" data-go="next" aria-label="Next page" style="right:8px">${chevron('M5 3l15 19L5 41')}</button>
    <div class="fb-bar">
      <span class="fb-count"></span>
      <input type="range" min="0" max="0" value="0" aria-label="Go to page">
      <button type="button" data-go="full"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg>Fullscreen</button>
    </div>`;
  stage.appendChild(ui);
  const $ = (q) => ui.querySelector(q);
  const count = $('.fb-count'), range = $('input[type=range]'), btnPrev = $('[data-go=prev]'), btnNext = $('[data-go=next]');

  let mode, pages, W, H, bookEl, els, flap, flapIn, flapFx, unders, nSpreads, s = 0, anim = null, drag = null, hovering = false;

  function layout(keepUnit) {
    const vw = stage.clientWidth, vh = stage.clientHeight - BAR;
    mode = vw < vh * 0.95 ? 'single' : 'spread';
    stage.classList.toggle('single', mode === 'single');
    pages = paginate(book, mode);
    if (mode === 'single') { W = vw; H = vh; }
    else { H = Math.floor(Math.min(vh * 0.92, (vw - 136) / 1.5)); W = Math.floor(H * 0.75); }
    nSpreads = mode === 'single' ? pages.length : Math.floor(pages.length / 2) + 1;

    if (bookEl) bookEl.remove();
    bookEl = document.createElement('div');
    bookEl.className = 'fb-book';
    bookEl.style.setProperty('--u', (Math.min(H, mode === 'single' ? W * 1.45 : H) / 100) + 'px');
    bookEl.style.top = (mode === 'single' ? 0 : Math.round((vh - H) / 2)) + 'px';
    stage.insertBefore(bookEl, ui);
    unders = [-W, 0].map((left) => {
      const d = document.createElement('div');
      d.className = 'fb-under';
      d.style.cssText = `left:${left}px;width:${W}px;height:${H}px;opacity:0;box-shadow:0 ${H * .03}px ${H * .06}px ${-H * .01}px rgba(62,44,26,.32),0 ${H * .01}px ${H * .016}px rgba(62,44,26,.14),0 2px 0 #E9DFCF,0 4px 0 #E2D7C5`;
      bookEl.appendChild(d);
      return d;
    });
    els = pages.map((pg, i) => {
      const side = mode === 'single' ? 'r' : (i % 2 === 1 ? 'l' : 'r');
      const holder = document.createElement('div');
      holder.className = 'fb-holder';
      const page = document.createElement('div');
      page.className = 'fb-page ' + side;
      page.style.width = W + 'px';
      page.style.height = H + 'px';
      page.innerHTML = '<div class="fb-paper"></div>' + pageHtml(pg, book, W, mode === 'single') + (mode === 'spread' ? '<div class="fb-crease"></div>' : '') + '<div class="fb-fx"></div>';
      holder.appendChild(page);
      bookEl.appendChild(holder);
      return { holder, page, fx: page.querySelector('.fb-fx') };
    });
    flap = document.createElement('div');
    flap.className = 'fb-flap';
    flap.style.width = W + 'px';
    flap.style.height = H + 'px';
    flap.innerHTML = '<div class="fb-flap-in"><div class="fb-fx"></div></div>';
    bookEl.appendChild(flap);
    flapIn = flap.firstChild; flapFx = flapIn.querySelector('.fb-fx');
    range.max = String(nSpreads - 1);

    if (keepUnit != null) {
      const idx = Math.max(0, pages.findIndex((pg) => pg.ui >= keepUnit));
      s = mode === 'single' ? idx : Math.ceil(idx / 2);
    }
    s = clamp(s, 0, nSpreads - 1);
    shown = new Set();
    draw(s, null);
  }

  // Page indexes on each side of spread k (-1 when that side is empty).
  const leftOf = (k) => (mode === 'single' ? -1 : (2 * k - 1 >= 0 && 2 * k - 1 < pages.length ? 2 * k - 1 : -1));
  const rightOf = (k) => (mode === 'single' ? (k < pages.length ? k : -1) : (2 * k < pages.length ? 2 * k : -1));
  const canNext = (k) => rightOf(k) >= 0 && k < nSpreads - 1;
  // A lone right page (cover) or lone left page (back cover) sits centred
  // like a closed book; single pages fill the screen from its left edge.
  const offsetOf = (k) => (mode === 'single' ? -W / 2 : (leftOf(k) < 0 ? -W / 2 : rightOf(k) < 0 ? W / 2 : 0));

  let shown = new Set();
  const place = (i, role, z, opt = {}) => {
    if (i < 0) return;
    const e = els[i];
    shown.add(e);
    e.holder.style.display = 'block';
    e.holder.style.zIndex = z;
    e.holder.style.filter = opt.filter || 'none';
    e.holder.style.transform = role === 'left' ? `translate(${-W}px,0)` : role === 'right' ? 'none' : opt.matrix;
    e.page.style.clipPath = opt.clip || 'none';
    if (!opt.fx) e.fx.style.display = 'none';
  };

  /** Spread k at rest (corner null), or turning from k to k+1 with the
   *  turning page's bottom corner at `corner` (right-page coordinates). */
  function draw(k, corner) {
    const prev = shown;
    shown = new Set();
    let p = 0;
    if (!corner) {
      place(leftOf(k), 'left', 1);
      place(rightOf(k), 'right', 1);
      flap.style.display = 'none';
    } else {
      const [cx, cy] = corner;
      p = clamp((W - cx) / (2 * W), 0, 1);
      const { mx, my, nx, ny } = foldFrom(W, H, cx, cy);
      const f = (q) => (q[0] - mx) * nx + (q[1] - my) * ny;
      const rect = [[0, 0], [W, 0], [W, H], [0, H]];
      const lift = Math.sin(Math.PI * p);
      place(leftOf(k), 'left', 1);
      const under = rightOf(k + 1);
      place(under, 'right', 1, { fx: true });
      if (under >= 0) band(els[under].fx, mx, my, nx, ny, W * 0.2, H, 'linear-gradient(to right,rgba(40,28,16,.34),rgba(40,28,16,.1) 32%,rgba(40,28,16,0))', lift.toFixed(3));
      place(rightOf(k), 'right', 2, { clip: polyCss(clipHalf(rect, (q) => -f(q))) });
      const shadow = `drop-shadow(0 ${(H * .005 * lift).toFixed(2)}px ${(H * .02 * lift + .5).toFixed(2)}px rgba(40,28,16,${(.3 * lift).toFixed(3)}))`;
      const back = leftOf(k + 1);
      if (back >= 0) {
        // Book: the back of the turning page is the next left page, laid
        // over by mirroring it and reflecting it across the fold — two
        // reflections, so a plain rotation.
        const r00 = 1 - 2 * nx * nx, r01 = -2 * nx * ny, r11 = 1 - 2 * ny * ny;
        const dot = mx * nx + my * ny;
        const matrix = `matrix(${-r00},${-r01},${r01},${r11},${r00 * W + 2 * dot * nx},${r01 * W + 2 * dot * ny})`;
        const turned = clipHalf(rect, f).map((q) => [W - q[0], q[1]]);
        place(back, 'back', 3, { matrix, clip: polyCss(turned), fx: true, filter: shadow });
        band(els[back].fx, W - mx, my, -nx, ny, W * 0.5, H, 'linear-gradient(to right,rgba(40,28,16,.16),rgba(255,253,248,.1) 14%,rgba(40,28,16,.03) 45%,rgba(40,28,16,0))', lift.toFixed(3));
        flap.style.display = 'none';
      } else {
        // No facing page (a phone, or the back cover leaving): the back is
        // plain paper and it rolls rather than lying flat — a narrow curl.
        const ROLL = mode === 'single' ? 0.32 : 1;
        const raw = clipHalf(rect, f);
        const depth = raw.reduce((m, q) => Math.max(m, f(q)), 0);
        flap.style.display = 'block';
        flap.style.filter = shadow;
        flapIn.style.clipPath = polyCss(raw.map((q) => { const d = (1 + ROLL) * f(q); return [q[0] - d * nx, q[1] - d * ny]; }));
        band(flapFx, mx, my, -nx, -ny, ROLL * depth, H, 'linear-gradient(to right,rgba(40,28,16,.26),rgba(40,28,16,.06) 18%,rgba(255,253,248,.22) 42%,rgba(255,253,248,.05) 62%,rgba(40,28,16,.12) 92%,rgba(40,28,16,.2))', Math.min(1, .4 + lift).toFixed(3));
      }
    }
    for (const e of prev) if (!shown.has(e)) e.holder.style.display = 'none';

    // The book's position and the page blocks under each side follow the
    // turn, so the closed cover slides to centre as the book opens.
    const off = corner ? offsetOf(k) + (offsetOf(k + 1) - offsetOf(k)) * ease(p) : offsetOf(k);
    bookEl.style.left = (stage.clientWidth / 2 + off) + 'px';
    const has = (side, kk) => (mode === 'spread' && (side ? rightOf(kk) : leftOf(kk)) >= 0 ? 1 : 0);
    // A side gaining pages fills in only as the turning page lands on it; a
    // side losing its last page empties as soon as that page lifts.
    unders.forEach((d, side) => {
      const a = has(side, k), b = corner ? has(side, k + 1) : a;
      d.style.opacity = b > a ? Math.pow(p, 4) : b < a ? 0 : a;
    });
    syncUi(k);
  }

  function syncUi(k) {
    btnPrev.disabled = k <= 0;
    btnNext.disabled = !canNext(k);
    range.value = String(k);
    const n = pages.length;
    let label;
    if (mode === 'single') label = `${k + 1}`;
    else if (leftOf(k) >= 0 && rightOf(k) >= 0) label = `${2 * k}–${2 * k + 1}`;
    else label = `${leftOf(k) >= 0 ? 2 * k : 2 * k + 1}`;
    count.textContent = `${label} / ${n}`;
  }

  // Animate spread k's turning page from corner `from` to progress `toP`
  // (0 = back at rest on k, 1 = landed on k+1), easing out of wherever a
  // drag left it.
  function run(k, from, toP, done) {
    if (anim) { cancelAnimationFrame(anim.raf); anim = null; }
    const p0 = clamp((W - from[0]) / (2 * W), 0, 1);
    const path0 = cornerAt(W, H, p0);
    const dur = FLIP_MS * Math.max(0.4, Math.abs(toP - p0));
    const t0 = performance.now();
    const finish = () => { anim = null; done(); };
    const step = (now) => {
      const q = clamp((now - t0) / dur, 0, 1), e = ease(q);
      const c = cornerAt(W, H, p0 + (toP - p0) * e);
      draw(k, [c[0] + (from[0] - path0[0]) * (1 - e), c[1] + (from[1] - path0[1]) * (1 - e)]);
      if (q < 1) anim.raf = requestAnimationFrame(step); else finish();
    };
    anim = { raf: requestAnimationFrame(step), finish: () => { cancelAnimationFrame(anim.raf); finish(); } };
  }
  const settle = () => { if (anim) anim.finish(); };

  function next() {
    settle();
    if (!canNext(s)) return;
    const k = s;
    run(k, [W, H], 1, () => { s = k + 1; draw(s, null); });
  }
  function prev() {
    settle();
    if (s <= 0) return;
    const k = s - 1;
    run(k, cornerAt(W, H, 1), 0, () => { s = k; draw(s, null); });
  }
  function go(k) { settle(); s = clamp(k, 0, nSpreads - 1); draw(s, null); }

  // Pointer: tap a side to turn, drag a page across, and with a mouse a
  // small corner lift when hovering by the outer corner.
  const local = (e) => { const r = bookEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('.fb-bar,.fb-arrow')) return;
    settle();
    const [x] = local(e);
    const forward = mode === 'single' ? x > W * 0.3 : x > 0;
    if (forward ? !canNext(s) : s <= 0) return;
    hovering = false;
    drag = { forward, x0: e.clientX, y0: e.clientY, lx0: x, moved: false, k: forward ? s : s - 1 };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
      drag.moved = true;
      // The corner follows the pointer; a page grabbed anywhere moves as if
      // held at its edge, so a short swipe still turns it.
      const start = drag.forward ? W : -W;
      const cx = start + (x - drag.lx0) * (mode === 'single' ? 2.2 : 1.15);
      drag.c = clampCorner(W, H, cx, clamp(y, H * 0.6, H));
      draw(drag.k, drag.c);
      return;
    }
    if (e.pointerType !== 'mouse' || anim || mode !== 'spread') return;
    const near = canNext(s) && x > W * 0.84 && x <= W && y > H * 0.82 && y <= H;
    if (near) { hovering = true; draw(s, clampCorner(W, H, Math.min(x - W * 0.1, W * 0.9), Math.min(y - H * 0.06, H * 0.95))); }
    else if (hovering) { hovering = false; draw(s, null); }
  });
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) { if (d.forward) next(); else prev(); return; }
    const p = clamp((W - d.c[0]) / (2 * W), 0, 1);
    const th = mode === 'single' ? 0.08 : 0.18;
    const toP = d.forward ? (p > th ? 1 : 0) : (p < 1 - th ? 0 : 1);
    run(d.k, d.c, toP, () => { s = d.k + toP; draw(s, null); });
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('pointerleave', () => { if (hovering && !drag) { hovering = false; draw(s, null); } });

  btnPrev.addEventListener('click', prev);
  btnNext.addEventListener('click', next);
  range.addEventListener('input', () => go(Number(range.value)));
  $('[data-go=full]').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.requestFullscreen) root.requestFullscreen();
    else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
  });
  const onKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(nSpreads - 1);
  };
  addEventListener('keydown', onKey);
  let rt = 0;
  const onResize = () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      settle();
      const cur = pages[mode === 'single' ? s : Math.max(0, 2 * s - 1)];
      layout(cur ? cur.ui : 0);
    }, 120);
  };
  addEventListener('resize', onResize);

  layout(0);
  return {
    next, prev, go,
    get spread() { return s; }, get spreads() { return nSpreads; }, get mode() { return mode; },
    peek(k, p) { s = k; draw(k, p == null ? null : cornerAt(W, H, p)); },
    destroy() { removeEventListener('keydown', onKey); removeEventListener('resize', onResize); root.innerHTML = ''; },
  };
}
