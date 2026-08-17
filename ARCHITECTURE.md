# Platform architecture

The studio platform. 86 Residence is the first project inside it.

## Files

```
Studio Platform.dc.html    the app: sign in, projects, project (3 phases + selection/feedback/sharing), catalog, team
platform-data.js           data layer — Firebase when configured, localStorage otherwise (same API)
firebase-config.js         your keys (gitignored)
firestore.rules            security rules
86 Residence - Simplified Proposal Generator.dc.html   → Concept phase deliverable
86 Residence Design Proposal.dc.html                   → Design/Sourcing deliverable
```

The two 86 Residence documents are not rewritten — each phase references its file and shows it inline. Furniture now lives in the shared catalog and each project references catalog pieces by id (live link: editing the catalog updates every project using the piece).

## Firestore

```
users/{uid}            email, name, role: 'admin'|'designer'|'client', status, createdAt
invites/{id}           email, role, name, status, createdAt        — role is inherited on first sign-in

catalog/{id}           name, type, room, retailer, url, image,
                       dimensions, finish, color, price (USD), notes, tags[], createdAt, updatedAt

projects/{id}
  name, client, location, cover, status, currency: 'USD'
  members: [uid], createdAt, updatedAt
  phases: { discovery|concept|design: { status, progress, doc, note } }
  answers: { [questionId]: string | string[] }
  rooms:   [{ id, name, selected: [{refId, qty}], alternatives: [{refId, qty}] }]
  reviews: [{ id, roomId, itemId, verdict: 'up'|'down', comment, by, at, resolved }]
  shares:  [{ token, clientName, phases: ['concept'|'design'], createdAt }]

settings/questionnaire  sections: [{ id, title, questions: [{ id, label, type, options? }] }]
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

`.gitignore` should carry `firebase-config.js`; commit `firebase-config.example.js` instead. Firebase web keys are not secrets, but the real protection is the rules — review them before making the repo public.

## Next

1. Point the two 86 Residence documents at the catalog so their tables read from Firestore instead of localStorage.
2. Per-piece approval history (who approved what, when) beyond the latest verdict.
3. PDF export per phase.
4. Moodboard uploads into Storage from the Concept tab.
