# Platform architecture

The studio platform. 86 Residence is the first project inside it.

## Files

```
Studio Platform.dc.html    the app: sign in, projects, project (3 phases + selection/feedback/sharing), catalog, studio settings, trade programs, team
platform-data.js           data layer — Firebase when configured, localStorage otherwise (same API)
firebase-config.js         your keys (gitignored)
firestore.rules            security rules
86 Residence - Simplified Proposal Generator.dc.html   → Concept phase deliverable
86 Residence Design Proposal.dc.html                   → Design/Sourcing deliverable
```

Concept is edited natively in the project workspace and exported as a standalone client document; it is not an embedded HTML file. Furniture lives in the shared catalog and each project references catalog pieces by id (live link: editing the catalog updates every project using the piece).

## Versioning

`APP_VERSION` and `CHANGELOG` (near the top of the `Studio Platform.dc.html` script) are the
only deploy signal this static site has — no build step, no CI badge. The version shows as a
badge in the top bar and at Studio → Changelog (admin only). Every change bumps the version and
adds a changelog entry in the same commit; see CLAUDE.md.

## Firestore

```
users/{uid}            email, name, role: 'admin'|'designer'|'client', status, createdAt
invites/{id}           email, role, name, status, createdAt        — role is inherited on first sign-in

catalog/{id}           name, type, room, retailer, url, image,
                       dimensions, finish, color, price (USD), notes, tags[], createdAt, updatedAt

projects/{id}
  name, client, location, cover, status, currency: 'USD'
  tagline, intro, hero, scope, scopeNote, stage, stageNote
  studioProfile: { name, role, strap, portrait, bio[], stats[], services[] }
  members: [uid], createdAt, updatedAt
  phases: { discovery|concept|design: { status, progress, doc, note, concept? } }
  goals: [{ title, body }]
  conceptPoints: [{ title, body }]            — Concept direction points
  palette: [{ name, hex, pantone? }]
  materials: [{ name, note, image }]          — Concept materials
  floorPlans: [{ title, image, comment }]     — Concept floor plans
  designPoints: [{ title, body }]             — Design & Sourcing's own direction points
  designMaterials: [{ name, note, image }]    — Design & Sourcing's own materials
  designFloorPlans: [{ title, image, comment }] — Design & Sourcing's own floor plans
  answers: { [questionId]: string | string[] }
  reportHidden: { [sectionKey]: bool }  — sections hidden from exported HTML/PDF reports; toggled
                       from a "Hide from export" button on the section itself (Concept: studio,
                       process, goals, direction, palette, materials, plan, mood — studio/process/
                       goals apply to every phase's report, the rest are Concept-only. Design &
                       Sourcing: designDirection, designMaterials, designPlan, designMood, sourcing)
  rooms:   [{ id, name, goal, brief,
              conceptMedia: [{ id, type: 'moodboard'|'floorplan'|'sketchup'|'rendering', title, url }],
              designMedia:  [{ id, type: 'rendering'|'sketchup'|'floorplan'|'video', title, url }],
              selected: [{refId, qty}], alternatives: [{refId, qty}] }]
              — designPoints/designMaterials/designFloorPlans/designMedia start as a one-time "Copy
              from Concept" in the Design & Sourcing tab, then diverge freely; never live-linked
  reviews: [{ id, roomId, itemId, verdict: 'up'|'down', comment, by, at, resolved }]
  shares:  [{ token, clientName, phases: ['concept'|'design'], createdAt }]

settings/questionnaire  sections: [{ id, title, questions: [{ id, label, type, options? }] }]
settings/trade-programs admin-maintained vendor directory: accounts, contacts, access URLs,
                        commercial terms, renewal dates, notes and image references
```

Question types: `long` (textarea), `short`, `choice` (pick one), `multi` (pick many). The default set is the studio's own questionnaire — project scope, spaces, style, feel, colors, budget, timeline, involvement.

Storage: `catalog/{ts}-{file}` and `{projectId}/{ts}-{file}`.

## Roles

| Role | Can |
| --- | --- |
| Admin | everything: projects, people, catalog, prices |
| Designer | edit projects they belong to; read catalog |
| Client | normally uses a share link instead of an account |

`arossler74@gmail.com` is the bootstrap admin — granted on first sign-in, cannot be demoted or removed in the UI.

## Client links

Sharing tab → enter the client's name → a link `#share=<token>` stamped with that name. No login. The client sees the selected pieces per room, gives thumbs up/down and a note; everything lands signed in that project's **Feedback** queue. A thumbs-down changes nothing automatically — the designer decides. Links show Concept only by default; the Design scope also exposes the sourcing document. Revoke any time.

Prices: hidden on Concept-scope links; visible to admins and designers everywhere.

## Deploy — GitHub Pages

The app is static; no build step.

1. Push the project to `arossler74-cmd/StudioCSDesign`.
2. Settings → Pages → Deploy from branch → `main` / root.
3. In Firebase → Authentication → Settings → Authorized domains, add `arossler74-cmd.github.io`.
4. Publish rules: `firebase deploy --only firestore:rules`.

`firebase-config.js` is committed on purpose, not gitignored: Pages serves the app directly from
the repo, so the deployed site can only reach Firebase if the config ships with it.
`firebase-config.example.js` is kept alongside it as the template for a fresh Firebase project.

The repository is public. That is fine for the config — Firebase web API keys are public
identifiers, not secrets — but it means `firestore.rules` is world-readable and is the only thing
actually guarding the data. Two consequences worth keeping in mind:

- Review `firestore.rules` whenever roles or collections change, and deploy it immediately; an
  unpublished fix protects nothing. A role check that compares against a value no user ever holds
  silently passes for everyone — that exact bug shipped once already.
- Keep the Authentication authorized-domains list tight, so the keys are only usable from the
  studio's own origins.

## Next

1. Point the two 86 Residence documents at the catalog so their tables read from Firestore instead of localStorage.
2. Per-piece approval history (who approved what, when) beyond the latest verdict.
3. PDF export per phase.
4. Client annotations directly on Concept floor plans and visual carousels.
5. Design & Sourcing tab, phase 2: drag-and-drop from the catalog (filterable by `ITEM_TYPES`)
   into a room's furniture list, with reordering — generalizing the pointer-drag-to-reorder already
   built for the catalog admin list (`startCardDrag`/`_onDragMove`/`_onDragEnd`) — plus a live
   investment-table preview in the tab.
6. Design & Sourcing tab, phase 3: the client's review link exposes substitutes (`room.alternatives`)
   alongside the current furniture, with a live-recalculating total; what the client tries stays
   local to their browser and is submitted as feedback, never a direct write to `room.selected` —
   the designer still decides.
