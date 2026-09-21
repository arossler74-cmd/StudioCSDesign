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
//
// Within whatever a phase shows, the studio can hide individual sections per
// project (project.reportHidden, e.g. { palette: true }) — a section not
// ready to share yet, without deleting its content. See buildReport below.

const PHASES = [
  { key: 'discovery', n: 1, icon: 'assets/icon-discovery.png', title: 'Discovery', blurb: 'We start with the questionnaire and a conversation, then I visit and measure the space. This is where I learn how you live.' },
  { key: 'concept', n: 2, icon: 'assets/icon-concept.png', title: 'Concept', blurb: 'I present a design direction — moodboard, palette and materials — so we agree on the feeling before anything is chosen.' },
  { key: 'design', n: 3, icon: 'assets/icon-design.png', title: 'Design & sourcing', blurb: 'Floor plans, renderings and a curated sourcing list come together into one cohesive scheme, with a round of refinements.' },
  { key: 'styling', n: 4, icon: 'assets/icon-styling.png', title: 'Styling & reveal', blurb: 'Pieces arrive, everything is placed and styled, and your space is ready to be lived in — exactly as we imagined it.' },
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
    'I am an interior designer and decorator based in Orange County, California. My passion is creating warm, sophisticated homes built around the way you actually live — layered and tactile, quietly luxurious, combining creativity with a strong aesthetic sense.',
    'Having lived in Brazil, Missouri, New York and Florida, I bring a well-travelled eye to residential interiors, creating elegant and personalised spaces. My practice is dedicated to designing and decorating living spaces — not replacing your general contractor, and not renovating kitchens or bathrooms.',
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
 *  first so the caller can show real progress instead of a spinner. A section
 *  the studio has hidden for this export has its images skipped too — no
 *  point spending the embed budget on a picture nobody will see. */
function imageList(project, phaseKey, hidden) {
  hidden = hidden || {};
  const profile = project.studioProfile || STUDIO;
  const out = [STUDIO.logo];
  if (!hidden.studio) out.push(profile.portrait || STUDIO.portrait);
  if (!hidden.process) out.push(...PHASES.map((f) => f.icon));
  if (project.hero) out.push(project.hero);
  if (!hidden.materials) for (const m of project.materials || []) if (m.image) out.push(m.image);
  if (!hidden.plan) for (const f of project.floorPlans || []) if (f.image) out.push(f.image);
  for (const r of project.rooms || []) {
    if (r.cad && !hidden.plan) out.push(r.cad);
    if ((phaseKey === 'concept' || phaseKey === 'design') && !hidden.mood) for (const m of r.moodboard || []) out.push(m);
    if (phaseKey === 'concept' && !hidden.mood) for (const m of r.conceptMedia || []) if (m.url) out.push(m.url);
  }
  return [...new Set(out.filter(Boolean))];
}

const CSS = `
:root{--bg:#F4EDE4;--surface:#FBF7F1;--surface2:#F7F0E6;--ink:#3B342C;--soft:#6A6154;
--mute:#9A8C7C;--faint:#B3A695;--line:#E6DBCC;--line2:#DCCFBB;--accent:#A98A5F;--accent-dark:#8A6E45}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);
font-family:'Jost',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
font-size:clamp(15px,1.05vw,20px);line-height:1.65;-webkit-font-smoothing:antialiased}
h1,h2,h3,.disp{font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-weight:400;margin:0}
.wrap{width:100%;margin:0 auto;padding:0 clamp(34px,6vw,128px)}
section{min-height:100vh;padding:clamp(70px,8vh,130px) 0;border-top:1px solid var(--line);display:flex;align-items:center}
section:first-of-type{border-top:0}
.kicker{font-size:.7em;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
h2{font-size:clamp(48px,5vw,84px);line-height:1;color:var(--ink);margin-bottom:12px}
.lead{color:var(--soft);max-width:68ch;text-wrap:pretty}
.grid{display:grid;gap:22px}
.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:26px;padding:clamp(24px,2.5vw,48px)}
img{max-width:100%;display:block}
.cover{min-height:100vh;padding:clamp(70px,8vh,130px) 0}
.cover h1{font-size:clamp(66px,9vw,160px);line-height:.92;color:var(--accent-dark);margin:clamp(24px,4vh,54px) 0}
.heroimg{width:100%;aspect-ratio:16/7;object-fit:cover;border-radius:16px;margin-top:34px}
.meta{display:grid;grid-template-columns:minmax(280px,1.4fr) repeat(2,minmax(180px,.65fr));gap:clamp(28px,5vw,80px);margin-top:28px}
.meta .lbl{font-size:.68em;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
.meta .val{font-size:1.15em;margin-top:6px}
.studio-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.8fr);gap:clamp(50px,7vw,120px);align-items:end}
.studio-copy{padding-bottom:4px}.studio-portrait{justify-self:end;width:min(100%,560px);height:min(69vh,760px);object-fit:cover;object-position:center top;border-radius:24px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:32px}.stat{padding:18px 20px;border-radius:18px}
.process-list{margin-top:clamp(30px,5vh,70px)}
.process-step{display:grid;grid-template-columns:190px 1fr;gap:clamp(30px,5vw,88px);align-items:center;padding:clamp(28px,4vh,54px) 0;border-bottom:1px solid var(--line)}
.process-step:last-child{border-bottom:0}.process-icon{width:72px;height:72px;object-fit:contain;margin-bottom:14px}.process-label{font-size:.68em;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
.process-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(32px,3vw,54px);line-height:1.05}.process-copy{font-size:1.05em;color:var(--soft);max-width:900px;margin-top:10px}
.here{display:inline-block;margin-left:10px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;
background:var(--accent);color:#fff;border-radius:999px;padding:3px 10px;vertical-align:middle}
.goals-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(22px,3vw,42px);margin-top:clamp(38px,7vh,90px)}
.goal-card{min-height:390px;display:flex;flex-direction:column;justify-content:flex-start}.goal-number{width:44px;height:44px;border:1px solid var(--accent);border-radius:50%;display:grid;place-items:center;color:var(--accent);font-size:.78em;letter-spacing:.06em;margin-bottom:28px}.goal-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(28px,2.2vw,42px);line-height:1.18;margin-bottom:18px}
.concept-head{display:grid;grid-template-columns:.85fr 1.15fr;gap:clamp(50px,8vw,140px);align-items:start}.concept-grid{display:grid;grid-template-columns:repeat(3,1fr);margin-top:clamp(45px,7vh,90px);border:1px solid var(--line2);border-radius:22px;overflow:hidden}.concept-point{min-height:230px;padding:clamp(28px,3vw,52px);background:var(--surface);border-right:1px solid var(--line2);border-bottom:1px solid var(--line2)}.concept-point:nth-child(3n){border-right:0}.concept-point:nth-last-child(-n+3){border-bottom:0}.point-title{font-size:.72em;letter-spacing:.17em;text-transform:uppercase;color:var(--accent);margin-bottom:20px}
.palette-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:24px;margin-top:42px}.sw .chip{height:120px;border-radius:24px;border:1px solid var(--line)}.sw .n{font-size:.9em;margin-top:12px}.sw .h{font-size:.7em;color:var(--mute);letter-spacing:.08em;text-transform:uppercase;overflow-wrap:anywhere}
.materials-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-top:40px}.material-card{padding:16px;overflow:hidden;border-radius:20px}.material-card img{width:100%;height:168px;object-fit:cover;border-radius:14px}.material-copy{padding:14px 2px 0}.material-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.45em;line-height:1.2}
.room{margin-top:44px}
.room h3{font-size:clamp(34px,3vw,52px);color:var(--accent-dark)}
.room .code{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
.plan{width:100%;border:1px solid var(--line2);border-radius:14px;background:#fff;margin-top:14px}
.zoomable{cursor:zoom-in}
.carousel{margin-top:28px}.carousel-stage{position:relative;width:100%;aspect-ratio:16/10;max-height:1100px;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:clamp(18px,2.5vw,48px);overflow:hidden}.slide{display:none;width:100%;height:100%}.slide.active{display:flex;flex-direction:column;align-items:center;justify-content:center}.slide img{max-width:100%;max-height:calc(100% - 58px);width:auto;height:auto;object-fit:contain;background:#fff;border-radius:12px}.slide-meta{display:flex;justify-content:space-between;align-self:stretch;gap:20px;margin-top:14px}.slide-type{font-size:.7em;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}.carousel-arrow{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:1px solid var(--line2);background:rgba(251,247,241,.94);font-size:24px;color:var(--ink);cursor:pointer;z-index:2}.carousel-arrow.prev{left:14px}.carousel-arrow.next{right:14px}.carousel-tools{display:flex;align-items:center;justify-content:space-between;margin-top:16px}.carousel-thumbs{display:flex;gap:10px;overflow:auto;padding:2px}.carousel-thumb{width:74px;height:56px;padding:3px;border:1px solid var(--line2);border-radius:12px;background:var(--surface);cursor:pointer;flex:0 0 auto}.carousel-thumb.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}.carousel-thumb img{width:100%;height:100%;object-fit:cover;border-radius:9px}.carousel-count{font-size:.75em;letter-spacing:.13em;color:var(--mute)}
.lightbox{position:fixed;inset:0;display:none;place-items:center;background:rgba(30,25,20,.92);padding:30px;z-index:9999}.lightbox.open{display:grid}.lightbox img{max-width:96vw;max-height:92vh;object-fit:contain}.lightbox-close{position:fixed;right:24px;top:20px;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.2);color:#fff;border-radius:50%;width:52px;height:52px;font-size:28px;cursor:pointer}
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
  section{min-height:auto;break-inside:avoid;padding:34px 0}
  .cover{min-height:auto;padding:0 0 28px}
  .room,.card,table{break-inside:avoid}
  h2{font-size:30px}
  .carousel-arrow,.carousel-tools,.lightbox{display:none!important}.slide{display:none!important}.slide.active{display:block!important}
}
@media(max-width:1200px){.materials-grid{grid-template-columns:repeat(3,1fr)}.palette-grid{grid-template-columns:repeat(3,1fr)}.process-step{grid-template-columns:130px 1fr}}
@media(max-width:760px){section{min-height:auto}.g2,.g3,.g4,.studio-grid,.goals-grid,.concept-head,.concept-grid,.materials-grid,.meta{grid-template-columns:1fr}.wrap{padding:0 22px}.cover h1{font-size:58px}.studio-portrait{justify-self:start;height:auto;max-height:620px}.process-step{grid-template-columns:82px 1fr;gap:20px}.process-icon{width:54px;height:54px}.goal-card{min-height:auto}.concept-point,.concept-point:nth-child(3n),.concept-point:nth-last-child(-n+3){border-right:0;border-bottom:1px solid var(--line2)}.concept-point:last-child{border-bottom:0}.palette-grid{grid-template-columns:repeat(2,1fr);gap:14px}.stats{grid-template-columns:1fr}.carousel-arrow{width:44px;height:44px}.slide img{height:55vh}}
`;

function coverSection(p, phase, img) {
  const addr = [p.address, p.addressCity].filter(Boolean).join(', ');
  return `
<section class="cover"><div class="wrap">
  <div class="kicker">Interior Design Proposal · Step ${phase.n} of 4</div>
  <div style="color:var(--mute);font-size:.9em">${esc(longDate())}</div>
  <div style="margin-top:26px;font-size:15px;letter-spacing:.02em;color:var(--soft)">
    ${esc(p.name)}${p.location ? ' · ' + esc(p.location) : ''}</div>
  <h1>${esc(p.tagline || 'A home that lives the way you do')}</h1>
  <div class="meta">
    ${p.client ? `<div><div class="lbl">Prepared for</div><div class="val">${esc(p.client)}</div>
      ${addr ? `<div style="font-size:13.5px;color:var(--mute);margin-top:2px">${esc(addr)}</div>` : ''}</div>` : ''}
    ${p.scope ? `<div><div class="lbl">Scope</div><div class="val">${esc(p.scope)}</div>
      ${p.scopeNote ? `<div style="font-size:13.5px;color:var(--mute);margin-top:2px">${esc(p.scopeNote)}</div>` : ''}</div>` : ''}
    <div><div class="lbl">Stage</div><div class="val">${esc(p.stage || phase.title)}</div>
      ${p.stageNote ? `<div style="font-size:13.5px;color:var(--mute);margin-top:2px">${esc(p.stageNote)}</div>` : ''}</div>
  </div>
  ${p.intro ? `<p class="lead" style="font-size:17px;margin-top:30px">${esc(p.intro)}</p>` : ''}
  ${img[p.hero] || p.hero ? `<img class="heroimg zoomable" src="${esc(img[p.hero] || p.hero)}" alt="Project hero image">` : ''}
</div></section>`;
}

function studioSection(p, img) {
  const s = { ...STUDIO, ...(p.studioProfile || {}) };
  const stats = s.stats || STUDIO.stats;
  return `
<section><div class="wrap">
  <div class="kicker">Who I am</div>
  <div class="studio-grid">
    <div class="studio-copy">
      <h2>${esc(s.name)}</h2>
      <div style="color:var(--mute);font-size:.86em;margin-bottom:24px">${esc(s.role)} · ${esc(s.strap)}</div>
      ${(s.bio || []).map((b) => `<p class="lead">${esc(b)}</p>`).join('')}
      <div class="stats">
        ${stats.map((x) => `<div class="card stat">
          <div style="font-size:1.1em">${esc(x.title || x.k)}</div>
          <div style="font-size:.78em;color:var(--mute)">${esc(x.body || x.v)}</div></div>`).join('')}
      </div>
    </div>
    ${img[s.portrait] ? `<img class="studio-portrait zoomable" src="${esc(img[s.portrait])}" alt="${esc(s.name)}">` : ''}
  </div>
</div></section>`;
}

function processSection(phase, img) {
  return `
<section><div class="wrap">
  <div class="kicker">How we work together</div><h2>The process</h2>
  <div class="process-list">
    ${PHASES.map((f) => `<div class="process-step">
      <div>${img[f.icon] ? `<img class="process-icon" src="${esc(img[f.icon])}" alt="">` : ''}<div class="process-label">Step 0${f.n}</div></div>
      <div><div class="process-title">${esc(f.title)}${f.key === phase.key ? '<span class="here">We are here</span>' : ''}</div>
      <div class="process-copy">${esc(f.blurb)}</div></div>
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
  <div class="goals-grid">
    ${goals.map((g, i) => `<div class="card goal-card">
      <div class="goal-number">0${i + 1}</div>
      <div class="goal-title">${esc(g.title || '')}</div>
      <div class="lead">${esc(g.body || '')}</div></div>`).join('')}
  </div>
</div></section>`;
}

function directionSection(p, phaseData) {
  const text = phaseData.concept || phaseData.note || '';
  const points = (p.conceptPoints || []).filter((c) => c && (c.title || c.body));
  if (!text && !points.length) return '';
  return `
<section><div class="wrap">
  <div class="concept-head"><div><div class="kicker">Direction</div><h2>Design concept</h2></div>
  ${text ? `<p class="lead">${esc(text)}</p>` : '<div></div>'}</div>
  ${points.length ? `<div class="concept-grid">
    ${points.map((c) => `<div class="concept-point">
      <div class="point-title">${esc(c.title || '')}</div>
      <div class="lead">${esc(c.body || '')}</div></div>`).join('')}
  </div>` : ''}
</div></section>`;
}

/** Colour palette, on its own so it can be hidden independently of the
 *  concept text above it — a common ask when the palette isn't final but
 *  the direction is. */
function paletteSection(p) {
  const palette = (p.palette || []).filter((c) => c && (c.name || c.hex));
  if (!palette.length) return '';
  return `
<section><div class="wrap">
  <div class="kicker">Direction</div><h2>Colour palette</h2>
  <div class="palette-grid">
    ${palette.map((c) => `<div class="sw">
      <div class="chip" style="background:${esc(c.hex || '#EEE')}"></div>
      <div class="n">${esc(c.name || '')}</div>
      ${c.pantone || c.ref || c.hex ? `<div class="h">${esc([c.pantone || c.ref, c.hex].filter(Boolean).join(' · '))}</div>` : ''}</div>`).join('')}
  </div>
</div></section>`;
}

function materialsSection(p, img) {
  const materials = (p.materials || []).filter((m) => m && (m.name || m.note));
  if (!materials.length) return '';
  return `
<section><div class="wrap">
  <div class="kicker">The tactile palette</div><h2>Material selection</h2>
  <div class="materials-grid">
    ${materials.map((m) => `<div class="card material-card">
      ${m.image ? `<img class="zoomable" src="${esc(img[m.image] || m.image)}" alt="${esc(m.name || '')}">` : ''}
      <div class="material-copy"><div class="material-title">${esc(m.name || '')}</div>
      <div class="lead" style="font-size:.86em;margin-top:8px">${esc(m.note || '')}</div></div></div>`).join('')}
  </div>
</div></section>`;
}

function planSection(p, img) {
  const floors = (p.floorPlans || []).filter((f) => f.image);
  if (floors.length) return `
<section><div class="wrap">
  <div class="kicker">First &amp; second floor</div><h2>Space plan · 2D</h2>
  ${floors.map((f) => `<div class="room"><h3>${esc(f.title || 'Floor plan')}</h3>${f.comment ? `<p class="lead" style="font-size:13.5px;margin-top:8px">${esc(f.comment)}</p>` : ''}<img class="plan zoomable" src="${esc(img[f.image] || f.image)}" alt="${esc(f.title || 'Floor plan')}"></div>`).join('')}
</div></section>`;
  const rooms = (p.rooms || []).filter((r) => r.cad);
  if (!rooms.length) return '';
  return `
<section><div class="wrap">
  <div class="kicker">To scale</div><h2>Space plan · 2D</h2>
  ${rooms.map((r) => `<div class="room">
    <h3>${esc(r.name)}</h3>${r.code ? `<div class="code">${esc(r.code)}</div>` : ''}
    ${r.brief ? `<p class="lead" style="font-size:13.5px;margin-top:8px">${esc(r.brief)}</p>` : ''}
    <img class="plan zoomable" src="${esc(img[r.cad] || r.cad)}" alt="${esc(r.name)} plan">
  </div>`).join('')}
</div></section>`;
}

function moodSection(p, img) {
  const rooms = (p.rooms || []).filter((r) => ((r.conceptMedia || []).length || (r.moodboard || []).length));
  if (!rooms.length) return '';
  return `
<section><div class="wrap">
  <div class="kicker">The feeling</div><h2>Moodboards</h2>
  ${rooms.map((r, roomIndex) => {
    const media = (r.conceptMedia || []).length ? r.conceptMedia : (r.moodboard || []).map((url) => ({ url, title: '', type: 'moodboard' }));
    const typeName = { moodboard: 'Moodboard', floorplan: '2D Floor Plan', sketchup: 'SketchUp rendering', rendering: 'Ultra-realistic rendering' };
    return `<div class="room">
    <h3>${esc(r.name)}</h3>
    ${r.goal ? `<p class="lead" style="font-size:15px;margin-top:8px"><strong>Goal:</strong> ${esc(r.goal)}</p>` : ''}
    ${r.brief ? `<p class="lead" style="font-size:13.5px;margin-top:8px">${esc(r.brief)}</p>` : ''}
    ${r.moodNote ? `<p class="lead" style="font-size:13.5px;margin-top:8px">${esc(r.moodNote)}</p>` : ''}
    <div class="carousel" data-carousel="room-${roomIndex}"><div class="carousel-stage">
      ${media.map((m, i) => `<div class="slide${i === 0 ? ' active' : ''}" data-slide="${i}"><img class="zoomable" src="${esc(img[m.url] || m.url)}" alt="${esc(m.title || r.name)}"><div class="slide-meta"><div>${esc(m.title || r.name)}</div><div class="slide-type">${esc(typeName[m.type] || m.type || '')}</div></div></div>`).join('')}
      ${media.length > 1 ? '<button class="carousel-arrow prev" type="button" aria-label="Previous image">‹</button><button class="carousel-arrow next" type="button" aria-label="Next image">›</button>' : ''}
    </div><div class="carousel-tools"><div class="carousel-thumbs">${media.map((m, i) => `<button class="carousel-thumb${i === 0 ? ' active' : ''}" type="button" data-go="${i}" aria-label="Image ${i + 1}"><img src="${esc(img[m.url] || m.url)}" alt=""></button>`).join('')}</div><div class="carousel-count"><span>1</span> / ${media.length}</div></div></div>
  </div>`;
  }).join('')}
</div></section>`;
}

const INTERACTIONS = `
<div class="lightbox" id="image-lightbox" role="dialog" aria-modal="true" aria-label="Expanded image">
  <button class="lightbox-close" type="button" aria-label="Close">×</button><img alt="">
</div>
<script>
(function(){
  document.querySelectorAll('[data-carousel]').forEach(function(carousel){
    var slides = Array.from(carousel.querySelectorAll('.slide'));
    var thumbs = Array.from(carousel.querySelectorAll('.carousel-thumb'));
    var count = carousel.querySelector('.carousel-count span');
    var current = 0;
    function show(index){
      current = (index + slides.length) % slides.length;
      slides.forEach(function(el,i){el.classList.toggle('active',i === current)});
      thumbs.forEach(function(el,i){el.classList.toggle('active',i === current)});
      if(count) count.textContent = current + 1;
      if(thumbs[current]) thumbs[current].scrollIntoView({block:'nearest',inline:'nearest'});
    }
    var prev = carousel.querySelector('.prev'); var next = carousel.querySelector('.next');
    if(prev) prev.addEventListener('click',function(){show(current - 1)});
    if(next) next.addEventListener('click',function(){show(current + 1)});
    thumbs.forEach(function(el){el.addEventListener('click',function(){show(Number(el.dataset.go))})});
  });
  var box = document.getElementById('image-lightbox'); var full = box.querySelector('img');
  function close(){box.classList.remove('open');full.removeAttribute('src');document.body.style.overflow=''}
  document.addEventListener('click',function(e){var target=e.target.closest('.zoomable');if(!target)return;full.src=target.currentSrc||target.src;full.alt=target.alt||'';box.classList.add('open');document.body.style.overflow='hidden'});
  box.addEventListener('click',function(e){if(e.target===box||e.target.closest('.lightbox-close'))close()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});
})();
</script>`;

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
        <td>${img[c.image] || c.image ? `<img class="thumb zoomable" src="${esc(img[c.image] || c.image)}" alt="${esc(c.name || '')}">` : ''}</td>
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

  // Sections the studio has hidden for this export — 'unhide' just flips the
  // flag back and the next export/print includes it again, from the same
  // project data. Persisted on the project itself, so it applies to every
  // phase's report, not just the one currently open.
  const hidden = p.reportHidden || {};
  const urls = imageList(p, phase.key, hidden);
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
    hidden.studio ? '' : studioSection(p, img),
    hidden.process ? '' : processSection(phase, img),
    hidden.goals ? '' : goalsSection(p),
    // Concept agrees a direction; Design & sourcing commits to pieces. Showing
    // furniture in the concept report turns a conversation about feeling into
    // one about price, which is why the phases carry different sections.
    phase.key === 'concept' && !hidden.direction ? directionSection(p, (p.phases && p.phases.concept) || {}) : '',
    phase.key === 'concept' && !hidden.palette ? paletteSection(p) : '',
    phase.key === 'concept' && !hidden.materials ? materialsSection(p, img) : '',
    (phase.key === 'concept' || phase.key === 'design') && !hidden.plan ? planSection(p, img) : '',
    (phase.key === 'concept' || phase.key === 'design') && !hidden.mood ? moodSection(p, img) : '',
    phase.key === 'design' || phase.key === 'styling' ? sourcingSection(p, byId, img) : '',
    // Costs stay out of Concept: this phase is for direction, plans and imagery.
    phase.key === 'design' ? feesSection(p) : '',
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
</head><body>${body}${INTERACTIONS}</body></html>`;

  return { html, embedded: urls.length - kept, kept };
}

/** File name for the download: project and phase, safe on every platform. */
export function reportFileName(project, phaseKey) {
  const phase = PHASES.find((f) => f.key === phaseKey) || PHASES[1];
  const base = [(project && project.name) || 'project', phase.title]
    .join(' - ').replace(/[^A-Za-z0-9 .-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base + '.html';
}
