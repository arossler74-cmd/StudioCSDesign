// Studio platform data layer.
// Firebase (Auth + Firestore + Storage) when firebase-config.js has real keys; localStorage otherwise.
// Same API either way, so the app never branches.

const ADMIN_BOOTSTRAP = ['arossler74@gmail.com'];
const LS = 'cs-platform-v5';
const SEED_VERSION = 5;
const R = 'refs/';

let mode = 'local';
let fb = null;

export const isFirebase = () => mode === 'firebase';
export const bootstrapAdmins = ADMIN_BOOTSTRAP;

export const ROOM_TYPES = ['Living room', 'Family room', 'Dining room', 'Breakfast area', 'Kitchen', 'Primary bedroom', 'Bedroom', 'Home office', 'Entry / hallway', 'Bathroom', 'Outdoor / terrace', 'Any room'];
export const ITEM_TYPES = ['Sofa', 'Sectional', 'Armchair', 'Dining chair', 'Stool', 'Bed', 'Nightstand', 'Coffee table', 'Side table', 'Dining table', 'Console', 'Desk', 'Storage', 'Rug', 'Lighting', 'Mirror', 'Art', 'Drapery', 'Outdoor', 'Decor'];

const nowISO = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------------- seeds ---------------- */

function seedCatalog() {
  const c = (o) => ({ createdAt: nowISO(), updatedAt: nowISO(), price: null, notes: '', tags: [], ...o });
  return [
    c({ id: 'c-eden', name: 'Eden Sectional Sofa', type: 'Sectional', room: 'Family room', retailer: 'Modani', image: R + 'canva-p1-01.png', dimensions: '165⅜" w × 41¾" d · chaise 57⅞" d · seat 16⅞" h', finish: 'Fabric', color: 'Beige', url: 'https://www.modani.com/', tags: ['86 residence'] }),
    c({ id: 'c-vaughn', name: 'Vaughn Performance Wool-Blend Handwoven Ivory Area Rug 10′×14′', type: 'Rug', room: 'Family room', retailer: 'Crate & Barrel', image: R + 'canva-p1-00.png', dimensions: '120" × 168"', finish: '63% polyester, 35% wool', color: 'Ivory', tags: ['86 residence'] }),
    c({ id: 'c-herman', name: 'Herman Coffee Table', type: 'Coffee table', room: 'Family room', retailer: 'Natuzzi Italia', image: R + 'canva-p1-06.png', dimensions: '39" w × 39" d × 11" h', finish: 'Pewter/bronze frame, bronze mirror top', color: 'Bronze', url: 'https://www.natuzzi.com/', tags: ['86 residence'] }),
    c({ id: 'c-dualite', name: 'Dualité Travertine and Burl Wood 53" Coffee Table', type: 'Coffee table', room: 'Living room', retailer: 'Crate & Barrel', dimensions: '53" w × 27" d × 14" h', finish: 'Travertine + mappa burl', color: 'Travertine', url: 'https://www.crateandbarrel.com/', tags: ['86 residence'] }),
    c({ id: 'c-linton', name: 'Linton Genuine Leather Club Chair', type: 'Armchair', room: 'Family room', retailer: 'AllModern', image: R + 'canva-p1-05.png', dimensions: '34.75" w × 33.75" d × 29" h', finish: 'Top-grain leather', color: 'Maestro Cigar', url: 'https://www.allmodern.com/', tags: ['86 residence'] }),
    c({ id: 'c-brooklyn', name: 'Brooklyn End Table', type: 'Side table', room: 'Family room', retailer: 'AllModern', image: R + 'canva-p1-02.png', dimensions: '20" dia × 22" h', finish: 'Solid + manufactured wood', color: 'Medium oak', url: 'https://www.allmodern.com/', tags: ['86 residence'] }),
    c({ id: 'c-turn', name: 'Turn Tall Side Table', type: 'Side table', room: 'Any room', retailer: 'Blu Dot', image: R + 'canva-p1-12.png', dimensions: '18.1" dia × 20" h', finish: 'Solid turned acacia', color: 'Natural', url: 'https://www.bludot.com/products/turn-tall-side-table', tags: ['86 residence'] }),
    c({ id: 'c-armengol', name: 'Armengol Accent End Table', type: 'Side table', room: 'Any room', retailer: 'AllModern', dimensions: '12" dia × 24" h', finish: 'Aged brass + walnut top', color: 'Brass', tags: ['86 residence'] }),
    c({ id: 'c-altan', name: 'Altan Accent Stool', type: 'Stool', room: 'Family room', retailer: 'AllModern', image: R + 'canva-p1-03.png', dimensions: '17" dia × 17" h', finish: 'Bouclé', color: 'Chocolate', tags: ['86 residence'] }),
    c({ id: 'c-ashford', name: 'Ashford Tufted Ottoman', type: 'Stool', room: 'Family room', retailer: 'AllModern', image: R + 'canva-p1-10.png', dimensions: '28" w × 20" d × 17" h', finish: 'Bouclé', color: 'Sage green', tags: ['86 residence'] }),
    c({ id: 'c-drift', name: 'Drift 5-Piece L-Shaped Power Reclining Sectional', type: 'Sectional', room: 'Family room', retailer: 'Crate & Barrel', dimensions: 'L-shape, 5 pieces', finish: 'Fabric', color: 'Sorrel', url: 'https://www.crateandbarrel.com/', tags: ['86 residence', 'alternative'] }),
    c({ id: 'c-styling', name: 'Styling package — books, vessels, stems', type: 'Decor', room: 'Any room', retailer: 'Studio sourced', dimensions: 'Assorted', finish: 'Mixed', color: 'Sage, brass, glass', tags: ['86 residence'] }),
  ];
}

export function DEFAULT_QUESTIONNAIRE() {
  return [
    { id: 's1', title: 'Project overview', questions: [
      { id: 'q_scope', label: 'What kind of project is this?', type: 'choice', options: ['Renovation', 'Decorating only', 'Not sure — guide me'] },
      { id: 'q_spaces', label: 'Spaces included', type: 'multi', options: ['Living room', 'Dining room', 'Primary bedroom', 'Home office', 'Family room', 'Entry / hallway', 'Outdoor / patio', 'Open-concept', 'Guest room', 'Kids room'] },
    ] },
    { id: 's2', title: 'Your style', questions: [
      { id: 'q_style', label: 'Your style — pick up to 3', type: 'multi', options: ['Minimalist', 'Modern', 'Classic', 'Bohemian', 'Coastal', 'Cozy / warm', 'Eclectic', 'Help me define it'] },
      { id: 'q_feel', label: 'How it should feel', type: 'multi', options: ['Calm', 'Cozy', 'Sophisticated', 'Bright', 'Luxurious', 'Natural'] },
    ] },
    { id: 's3', title: 'Color', questions: [
      { id: 'q_love', label: 'Colors you love', type: 'long' },
      { id: 'q_avoid', label: 'Colors to avoid', type: 'long' },
    ] },
    { id: 's4', title: 'Budget, timeline & involvement', questions: [
      { id: 'q_budget', label: 'Furnishings budget', type: 'choice', options: ['$15k–$30k', '$30k–$60k', '$60k+', 'Guide me'] },
      { id: 'q_timeline', label: 'Timeline', type: 'choice', options: ['Start soon', 'Flexible'] },
      { id: 'q_involve', label: 'How involved do you want to be?', type: 'choice', options: ['Decide for me', 'Part of everything'] },
    ] },
    { id: 's5', title: 'Practical notes', questions: [
      { id: 'q_allergies', label: 'Allergies or materials to avoid', type: 'long' },
    ] },
    { id: 's6', title: 'In one sentence', questions: [
      { id: 'q_sentence', label: 'How do you want to feel here?', type: 'long' },
    ] },
  ];
}

function seed() {
  return {
    seedVersion: SEED_VERSION,
    users: [
      { id: 'u-admin', email: 'arossler74@gmail.com', name: 'Andre Rossler', role: 'admin', status: 'active', createdAt: nowISO() },
      { id: 'u-cybelle', email: 'cybelle@cybellesampaio.com', name: 'Cybelle Sampaio', role: 'admin', status: 'invited', createdAt: nowISO() },
    ],
    catalog: seedCatalog(),
    projects: [
      {
        id: '86-residence',
        name: '86 Residence', client: 'The 86 Residence family', location: 'Miami, FL',
        cover: 'assets/floor-plan.png', status: 'in progress', currency: 'USD',
        members: ['u-admin', 'u-cybelle'],
        createdAt: '2026-05-04T12:00:00.000Z', updatedAt: '2026-08-14T18:22:00.000Z',
        phases: {
          discovery: { status: 'not-started', progress: 0, doc: null, note: 'Questionnaire was never run with this client.' },
          concept: { status: 'in-progress', progress: 62, doc: '86 Residence - Simplified Proposal Generator.dc.html', note: 'Plans, moodboard and the first furniture selection.' },
          design: { status: 'in-progress', progress: 78, doc: '86 Residence Design Proposal.dc.html', note: 'SketchUp elevations, full specification and investment.' },
          styling: { status: 'not-started', progress: 0, doc: null, note: 'Delivery, placement and final styling — after the sourcing list is approved.' },
        },
        answers: {},
        plan: 'assets/floor-plan.png',
        materials: [
          { name: 'Textile', note: 'Performance weave on everything the sun and the family land on — cleanable, and it does not read like performance fabric.' },
          { name: 'Wood', note: 'Rift-cut oak with a natural oil finish, plus one turned or carved piece per room.' },
          { name: 'Stone', note: 'Honed travertine for table tops — warm, matte, forgiving of water rings.' },
          { name: 'Metal', note: 'Aged brass and bronze only. No chrome and no black hardware anywhere on this floor.' },
        ],
        palette: [
          { name: 'Ivory', hex: '#F6F2EA' }, { name: 'Plaster', hex: '#EDE7DA' },
          { name: 'Travertine', hex: '#D8C9B0' }, { name: 'Sage', hex: '#7A8A5E' },
          { name: 'Bronze', hex: '#8A6E45' }, { name: 'Chestnut', hex: '#7A4A32' },
        ],
        rooms: [
          { id: 'r-family', name: 'Family Room', code: 'Room 104', cad: 'assets/floor-plan.png',
            brief: 'The centre of the ground floor — open to kitchen, breakfast and the terrace. It sets the palette the other four spaces answer to.',
            moodboard: ['refs/canva-p1-01.png', 'refs/canva-p1-00.png', 'refs/canva-p1-06.png', 'refs/canva-p1-05.png'],
            selected: [
            { refId: 'c-eden', qty: 1 }, { refId: 'c-vaughn', qty: 1 }, { refId: 'c-herman', qty: 1 },
            { refId: 'c-linton', qty: 2 }, { refId: 'c-brooklyn', qty: 2 }, { refId: 'c-ashford', qty: 2 },
            { refId: 'c-altan', qty: 1 }, { refId: 'c-turn', qty: 1 }, { refId: 'c-styling', qty: 1 },
          ], alternatives: [ { refId: 'c-drift', qty: 1 }, { refId: 'c-dualite', qty: 1 }, { refId: 'c-armengol', qty: 1 } ] },
          { id: 'r-dining', name: 'Dining Room', code: 'Room 103', cad: 'assets/floor-plan.png',
            brief: 'Formal dining off the grand foyer. One long table, ten chairs, a single sculptural fixture above and full-height linen drapery.',
            moodboard: [], selected: [], alternatives: [] },
          { id: 'r-breakfast', name: 'Breakfast Area', code: 'Room 113', cad: 'assets/floor-plan.png',
            brief: 'Morning room beside the kitchen with the terrace on one side. A round table so circulation stays easy, four to six chairs, one warm pendant.',
            moodboard: [], selected: [], alternatives: [] },
          { id: 'r-terrace', name: 'Terrace', code: 'Room 115 · outdoor', cad: 'assets/floor-plan.png',
            brief: 'Covered terrace off the family room, running to the pool. Furniture rated for Miami sun and rain — deep seating, a dining set for six, planters.',
            moodboard: [], selected: [], alternatives: [] },
          { id: 'r-primary', name: 'Primary Bedroom', code: '1st floor', cad: '',
            brief: 'Bed, upholstered headboard, nightstands, a seating corner by the window, layered lighting and blackout drapery behind linen sheers.',
            moodboard: [], selected: [], alternatives: [] },
        ],
        reviews: [], shares: [],
      },
    ],
    questionnaire: DEFAULT_QUESTIONNAIRE(),
  };
}

function readLS() {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.seedVersion === SEED_VERSION) return s;
      const fresh = seed();
      // keep anything the user actually created; refresh the seeded demo data
      if (s && Array.isArray(s.projects)) {
        const extra = s.projects.filter((p) => p.id !== '86-residence');
        fresh.projects = [...fresh.projects, ...extra];
      }
      if (s && Array.isArray(s.catalog)) {
        const seeded = new Set(fresh.catalog.map((c) => c.id));
        fresh.catalog = [...fresh.catalog, ...s.catalog.filter((c) => c.id && !c.id.startsWith('c-') || (c.id && !seeded.has(c.id) && !/^c-[a-z0-9]{8}$/.test(c.id)))];
      }
      if (s && s.session) fresh.session = s.session;
      if (s && Array.isArray(s.users)) {
        const emails = new Set(fresh.users.map((x) => x.email.toLowerCase()));
        fresh.users = [...fresh.users, ...s.users.filter((x) => !emails.has(String(x.email).toLowerCase()))];
      }
      writeLS(fresh);
      return fresh;
    }
  } catch (e) {}
  const s = seed(); writeLS(s); return s;
}
function writeLS(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {} }

/* ---------------- init ---------------- */

export async function init() {
  let cfg = null;
  try { cfg = (await import('./firebase-config.js')).firebaseConfig; } catch (e) {}
  if (!cfg || !cfg.apiKey || String(cfg.apiKey).startsWith('PASTE_') || String(cfg.apiKey).startsWith('COLE_')) { mode = 'local'; return mode; }
  try {
    const [app, auth, db, st] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js'),
    ]);
    const a = app.initializeApp(cfg);
    fb = { app: a, auth: auth.getAuth(a), db: db.getFirestore(a), storage: st.getStorage(a), A: auth, D: db, S: st };
    mode = 'firebase';
  } catch (e) { console.warn('Firebase unavailable, running local:', e); mode = 'local'; }
  return mode;
}

/* ---------------- auth ---------------- */

export function onAuth(cb) {
  if (mode === 'firebase') {
    return fb.A.onAuthStateChanged(fb.auth, async (u) => cb(u ? await ensureUserDoc(u) : null));
  }
  const s = readLS();
  cb(s.session ? s.users.find((u) => u.id === s.session) || null : null);
  return () => {};
}

async function ensureUserDoc(u) {
  const { doc, getDoc, setDoc, collection, getDocs, query, where } = fb.D;
  const ref = doc(fb.db, 'users', u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: u.uid, ...snap.data() };
  let role = ADMIN_BOOTSTRAP.includes((u.email || '').toLowerCase()) ? 'admin' : 'client';
  try {
    const inv = await getDocs(query(collection(fb.db, 'invites'), where('email', '==', u.email)));
    if (!inv.empty) role = inv.docs[0].data().role || role;
  } catch (e) {}
  const data = { email: u.email, name: u.displayName || u.email, role, status: 'active', createdAt: nowISO() };
  await setDoc(ref, data);
  return { id: u.uid, ...data };
}

export async function signInGoogle() {
  if (mode !== 'firebase') return localSignIn('arossler74@gmail.com');
  await fb.A.signInWithPopup(fb.auth, new fb.A.GoogleAuthProvider());
}
export async function signInEmail(email, password) {
  if (mode !== 'firebase') return localSignIn(email);
  await fb.A.signInWithEmailAndPassword(fb.auth, email, password);
}
export async function signUpEmail(email, password, name) {
  if (mode !== 'firebase') return localSignIn(email, name);
  const cred = await fb.A.createUserWithEmailAndPassword(fb.auth, email, password);
  if (name) await fb.A.updateProfile(cred.user, { displayName: name });
  await ensureUserDoc(cred.user);
}
export async function resetPassword(email) {
  if (mode !== 'firebase') return;
  await fb.A.sendPasswordResetEmail(fb.auth, email);
}
function localSignIn(email, name) {
  const s = readLS();
  let u = s.users.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
  if (!u) {
    u = { id: 'u-' + uid(), email, name: name || email.split('@')[0], role: ADMIN_BOOTSTRAP.includes(String(email).toLowerCase()) ? 'admin' : 'designer', status: 'active', createdAt: nowISO() };
    s.users.push(u);
  }
  u.status = 'active'; s.session = u.id; writeLS(s);
  return u;
}
export async function signOut() {
  if (mode === 'firebase') return fb.A.signOut(fb.auth);
  const s = readLS(); delete s.session; writeLS(s);
}

/* ---------------- projects ---------------- */

export async function listProjects(user) {
  let all;
  if (mode === 'firebase') {
    const { collection, getDocs, query, where } = fb.D;
    // rules reject an unfiltered list for non-admins, so scope the query itself
    const ref = collection(fb.db, 'projects');
    const snap = user && user.role === 'admin'
      ? await getDocs(ref)
      : await getDocs(query(ref, where('members', 'array-contains', user.id)));
    all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return all;
  }
  all = [...readLS().projects];
  all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return user && user.role === 'admin' ? all : all.filter((p) => (p.members || []).includes(user.id));
}

export async function getProject(id) {
  if (mode === 'firebase') {
    const { doc, getDoc } = fb.D;
    const s = await getDoc(doc(fb.db, 'projects', id));
    return s.exists() ? { id, ...s.data() } : null;
  }
  return readLS().projects.find((p) => p.id === id) || null;
}

export async function saveProject(p) {
  p.updatedAt = nowISO();
  if (mode === 'firebase') {
    const { doc, setDoc } = fb.D;
    await setDoc(doc(fb.db, 'projects', p.id), p, { merge: true });
    return p;
  }
  const s = readLS();
  const i = s.projects.findIndex((x) => x.id === p.id);
  if (i < 0) s.projects.push(p); else s.projects[i] = p;
  writeLS(s);
  return p;
}

export async function createProject(name, client, user) {
  const p = {
    id: (name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + uid().slice(0, 4),
    name: name || 'New project', client: client || '', location: '', cover: '', status: 'draft', currency: 'USD',
    members: [user.id], createdAt: nowISO(), updatedAt: nowISO(),
    phases: {
      discovery: { status: 'not-started', progress: 0, doc: null, note: '' },
      concept: { status: 'not-started', progress: 0, doc: null, note: '' },
      design: { status: 'not-started', progress: 0, doc: null, note: '' },
      styling: { status: 'not-started', progress: 0, doc: null, note: '' },
    },
    answers: {}, rooms: [], reviews: [], shares: [],
  };
  return saveProject(p);
}

export async function deleteProject(id) {
  if (mode === 'firebase') { const { doc, deleteDoc } = fb.D; return deleteDoc(doc(fb.db, 'projects', id)); }
  const s = readLS(); s.projects = s.projects.filter((p) => p.id !== id); writeLS(s);
}

/* ---------------- catalog (global, live-linked) ---------------- */

export async function listCatalog() {
  if (mode === 'firebase') {
    const { collection, getDocs } = fb.D;
    const snap = await getDocs(collection(fb.db, 'catalog'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return readLS().catalog || [];
}

export async function saveCatalogItem(item) {
  const rec = { ...item, updatedAt: nowISO() };
  if (mode === 'firebase') {
    const { doc, setDoc, collection, addDoc } = fb.D;
    if (rec.id) { await setDoc(doc(fb.db, 'catalog', rec.id), rec, { merge: true }); return rec; }
    rec.createdAt = nowISO();
    const r = await addDoc(collection(fb.db, 'catalog'), rec);
    return { ...rec, id: r.id };
  }
  const s = readLS();
  s.catalog = s.catalog || [];
  if (!rec.id) { rec.id = 'c-' + uid(); rec.createdAt = nowISO(); s.catalog.push(rec); }
  else { const i = s.catalog.findIndex((x) => x.id === rec.id); if (i < 0) s.catalog.push(rec); else s.catalog[i] = rec; }
  writeLS(s);
  return rec;
}

export async function deleteCatalogItem(id) {
  if (mode === 'firebase') { const { doc, deleteDoc } = fb.D; return deleteDoc(doc(fb.db, 'catalog', id)); }
  const s = readLS(); s.catalog = (s.catalog || []).filter((x) => x.id !== id); writeLS(s);
}

/* ---------------- questionnaire ---------------- */

export async function getQuestionnaire() {
  if (mode === 'firebase') {
    const { doc, getDoc, setDoc } = fb.D;
    const ref = doc(fb.db, 'settings', 'questionnaire');
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data().sections;
    const sections = DEFAULT_QUESTIONNAIRE();
    await setDoc(ref, { sections });
    return sections;
  }
  const s = readLS();
  if (!s.questionnaire) { s.questionnaire = DEFAULT_QUESTIONNAIRE(); writeLS(s); }
  return s.questionnaire;
}

export async function saveQuestionnaire(sections) {
  if (mode === 'firebase') { const { doc, setDoc } = fb.D; return setDoc(doc(fb.db, 'settings', 'questionnaire'), { sections }); }
  const s = readLS(); s.questionnaire = sections; writeLS(s);
}

/* ---------------- team ---------------- */

export async function listUsers() {
  if (mode === 'firebase') {
    const { collection, getDocs } = fb.D;
    const [us, inv] = await Promise.all([getDocs(collection(fb.db, 'users')), getDocs(collection(fb.db, 'invites'))]);
    return [
      ...us.docs.map((d) => ({ id: d.id, ...d.data() })),
      ...inv.docs.map((d) => ({ id: d.id, invite: true, status: 'invited', ...d.data() })),
    ];
  }
  return readLS().users;
}

export async function inviteUser(email, role, name) {
  const rec = { email, role: role || 'designer', name: name || email.split('@')[0], status: 'invited', createdAt: nowISO() };
  if (mode === 'firebase') {
    const { collection, addDoc } = fb.D;
    const r = await addDoc(collection(fb.db, 'invites'), rec);
    return { id: r.id, ...rec };
  }
  const s = readLS(); const u = { id: 'u-' + uid(), ...rec }; s.users.push(u); writeLS(s); return u;
}

export async function setUserRole(id, role) {
  if (mode === 'firebase') { const { doc, setDoc } = fb.D; return setDoc(doc(fb.db, 'users', id), { role }, { merge: true }); }
  const s = readLS(); const u = s.users.find((x) => x.id === id); if (u) u.role = role; writeLS(s);
}

export async function removeUser(id) {
  if (mode === 'firebase') { const { doc, deleteDoc } = fb.D; return deleteDoc(doc(fb.db, 'users', id)); }
  const s = readLS(); s.users = s.users.filter((x) => x.id !== id); writeLS(s);
}

/* ---------------- client share links ---------------- */

export function shareUrl(token) {
  const base = location.href.split('#')[0];
  return base + '#share=' + token;
}

export async function createShare(project, clientName, phases) {
  const share = { token: uid() + uid(), clientName, phases: phases || ['concept'], createdAt: nowISO(), views: 0 };
  const p = { ...project, shares: [...(project.shares || []), share] };
  await saveProject(p);
  if (mode === 'firebase') await publishShare(p, share);
  return { project: p, share };
}

// public, token-scoped mirror so an unauthenticated client can read it
async function publishShare(project, share) {
  const { doc, setDoc } = fb.D;
  const cat = await listCatalog();
  const find = (id) => cat.find((c) => c.id === id) || {};
  const showDesign = share.phases.includes('design');
  const payload = {
    token: share.token, projectId: project.id, projectName: project.name,
    clientName: share.clientName, phases: share.phases,
    doc: showDesign ? (project.phases.design || {}).doc || null : (project.phases.concept || {}).doc || null,
    rooms: (project.rooms || []).map((r) => ({
      id: r.id, name: r.name,
      items: (r.selected || []).map((e) => {
        const c = find(e.refId);
        return { id: e.refId, name: c.name || '', image: c.image || '', retailer: c.retailer || '', dimensions: c.dimensions || '' };
      }),
    })),
    updatedAt: nowISO(),
  };
  await setDoc(doc(fb.db, 'shares', share.token), payload);
}

export async function refreshShares(project) {
  if (mode !== 'firebase') return;
  for (const s of project.shares || []) await publishShare(project, s);
}

export async function revokeShare(project, token) {
  const p = { ...project, shares: (project.shares || []).filter((s) => s.token !== token) };
  await saveProject(p);
  if (mode === 'firebase') {
    const { doc, deleteDoc } = fb.D;
    try { await deleteDoc(doc(fb.db, 'shares', token)); } catch (e) {}
  }
  return p;
}

export async function findByShare(token) {
  if (mode === 'firebase') {
    const { doc, getDoc } = fb.D;
    const snap = await getDoc(doc(fb.db, 'shares', token));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      public: true,
      share: { token, clientName: d.clientName, phases: d.phases || ['concept'] },
      project: { id: d.projectId, name: d.projectName, rooms: d.rooms || [], phases: {} },
      doc: d.doc || null,
    };
  }
  for (const p of readLS().projects) {
    const sh = (p.shares || []).find((s) => s.token === token);
    if (sh) return { project: p, share: sh, doc: (sh.phases.includes('design') ? p.phases.design : p.phases.concept || {}).doc || null };
  }
  return null;
}

/* ---------------- client feedback ---------------- */

export async function addReview(project, entry) {
  const rec = { id: 'r-' + uid(), at: nowISO(), resolved: false, ...entry };
  if (mode === 'firebase' && entry.viaShare) {
    // unauthenticated client feedback lands in the public share's inbox
    const { doc, setDoc } = fb.D;
    await setDoc(doc(fb.db, 'shares', entry.viaShare, 'reviews', rec.id), rec);
    return project;
  }
  const reviews = [...(project.reviews || []).filter((r) => !(r.itemId === rec.itemId && r.by === rec.by && r.verdict)), rec];
  const p = { ...project, reviews };
  await saveProject(p);
  return p;
}

// designer side: pull whatever clients posted through their links
export async function shareReviews(project) {
  if (mode !== 'firebase') return [];
  const { collection, getDocs } = fb.D;
  const out = [];
  for (const s of project.shares || []) {
    try {
      const snap = await getDocs(collection(fb.db, 'shares', s.token, 'reviews'));
      snap.docs.forEach((d) => out.push({ ...d.data(), id: d.id, token: s.token }));
    } catch (e) {}
  }
  return out;
}

export async function resolveReview(project, id) {
  const p = { ...project, reviews: (project.reviews || []).map((r) => r.id === id ? { ...r, resolved: true } : r) };
  await saveProject(p);
  return p;
}

/* ---------------- one-time seed into Firestore ---------------- */

// A Storage upload that cannot succeed still costs real time: the SDK retries
// internally for up to maxUploadRetryTime (two minutes by default) before it
// rejects, so an unprovisioned bucket or a blocking Storage rule turns the seed
// into a ten-minute silent stall. The repo path is a perfectly good fallback --
// Pages serves assets/ and refs/ -- so cap the wait and move on.
const UPLOAD_TIMEOUT_MS = 20000;
const withTimeout = (p, ms, what) => Promise.race([
  p,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timed out after ' + (ms / 1000) + 's: ' + what)), ms)),
]);

export async function seedFirestore(user, onProgress) {
  if (mode !== 'firebase') throw new Error('Not connected to Firebase.');
  const { doc, setDoc, collection, getDocs } = fb.D;
  const s = seed();
  const report = { catalog: 0, projects: 0, questionnaire: false, users: 0, images: 0, skipped: 0 };

  // Every write below is one step, so the caller can show real progress rather
  // than an indeterminate spinner that cannot distinguish work from a stall.
  const invitees = s.users.filter((u) => !ADMIN_BOOTSTRAP.includes(u.email.toLowerCase()));
  const total = s.catalog.length + s.projects.length + 1 + invitees.length;
  let done = 0;
  let current = '';
  // say() names the work in flight, bump() marks it finished. Reporting only on
  // success made a failure blame the previous item, which had actually written
  // fine -- the one that threw was never named.
  const say = (label) => { current = label; if (onProgress) onProgress({ done, total, label }); };
  const bump = () => { done++; if (onProgress) onProgress({ done, total, label: current }); };

  // Firestore rejects a field whose value is undefined with invalid-argument,
  // and the seed legitimately omits optional fields: four catalog rows carry no
  // image, and at least one room no cad. Those omissions reached setDoc as
  // explicit undefined via host(), so the write was refused outright. Strip
  // them instead of writing them.
  const clean = (v) => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const out = {};
      for (const k of Object.keys(v)) if (v[k] !== undefined) out[k] = clean(v[k]);
      return out;
    }
    return v;
  };

  // move every repo-relative image into Storage so the data stops depending on where the HTML lives
  const cache = {};
  const host = async (path) => {
    if (!path) return '';   // never undefined: Firestore refuses it
    if (/^(https?:|data:)/.test(path)) return path;
    if (cache[path]) return cache[path];
    const name = path.split('/').pop();
    try {
      say('uploading ' + name);
      const res = await fetch(path);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const { ref, uploadBytes, getDownloadURL } = fb.S;
      const r = ref(fb.storage, 'library/' + name);
      await withTimeout(uploadBytes(r, blob), UPLOAD_TIMEOUT_MS, name);
      const url = await withTimeout(getDownloadURL(r), UPLOAD_TIMEOUT_MS, name);
      cache[path] = url;
      report.images++;
      return url;
    } catch (e) {
      console.warn('seed: keeping repo path for ' + path, e);
      report.skipped++;
      cache[path] = path; // fall back to the repo path
      return path;
    }
  };

  const existing = await getDocs(collection(fb.db, 'catalog'));
  const have = new Set(existing.docs.map((d) => d.id));
  for (const c of s.catalog) {
    if (have.has(c.id)) { say('catalog: ' + (c.name || c.id) + ' (already there)'); bump(); continue; }
    const { id, ...data } = c;
    say('catalog: ' + (data.name || id));
    data.image = await host(data.image);
    await setDoc(doc(fb.db, 'catalog', id), clean(data));
    report.catalog++;
    bump();
  }

  for (const p of s.projects) {
    const { id, ...data } = p;
    say('project: ' + (data.name || id));
    data.members = [user.id];
    data.cover = await host(data.cover);
    data.plan = await host(data.plan);
    data.rooms = [];
    for (const r of p.rooms || []) {
      const board = [];
      for (const m of r.moodboard || []) board.push(await host(m));
      data.rooms.push({ ...r, cad: await host(r.cad), moodboard: board });
    }
    await setDoc(doc(fb.db, 'projects', id), clean(data), { merge: true });
    report.projects++;
    bump();
  }

  say('questionnaire');
  await setDoc(doc(fb.db, 'settings', 'questionnaire'), clean({ sections: DEFAULT_QUESTIONNAIRE() }));
  report.questionnaire = true;
  bump();

  for (const u of invitees) {
    say('invite: ' + u.email);
    await setDoc(doc(fb.db, 'invites', u.email.replace(/[^a-z0-9]/gi, '-')), clean({ email: u.email, name: u.name, role: u.role, status: 'invited', createdAt: nowISO() }));
    report.users++;
    bump();
  }
  return report;
}

/* ---------------- upload ---------------- */

export async function uploadFile(projectId, file) {
  if (mode === 'firebase') {
    const { ref, uploadBytes, getDownloadURL } = fb.S;
    const r = ref(fb.storage, `${projectId || 'catalog'}/${Date.now()}-${file.name}`);
    await uploadBytes(r, file);
    return getDownloadURL(r);
  }
  return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
}
