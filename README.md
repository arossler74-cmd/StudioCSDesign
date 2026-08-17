# Cybelle Sampaio Studio — project platform

Static web app (no build step). Discovery → Concept → Design & sourcing → Styling & reveal for each
project, a shared furniture catalog, and token-based client links for approvals.

## Run

Serve the folder over http (any static host) and open `Studio Platform.dc.html`.
Firebase config lives in `firebase-config.js`; while its `apiKey` is a `PASTE_…` placeholder the app
falls back to a localStorage demo mode.

## Deploy — GitHub Pages

Settings → Pages → Deploy from branch → `main` / root. Then add the Pages domain under
Firebase → Authentication → Settings → Authorized domains.

## Firebase

Project `cybelle-studio`: Authentication (Google + Email/Password), Firestore, Storage.
Publish `firestore.rules` before inviting anyone. Schema, roles and the client-link design are in
`ARCHITECTURE.md`.

First admin sign-in with `arossler74@gmail.com` gets the admin role automatically, then the
dashboard offers a one-time **Import starter data** action that writes the 86 Residence project,
its rooms, the starter catalog and the questionnaire into Firestore (uploading the images in
`refs/` and `assets/` to Storage).

## Files

| Path | What |
| --- | --- |
| `Studio Platform.dc.html` | the app |
| `platform-data.js` | data layer (Firebase, localStorage fallback) |
| `86 Residence - Simplified Proposal Generator.dc.html` | Concept deliverable |
| `86 Residence Design Proposal.dc.html` | Design & sourcing deliverable |
| `_ds/` | Organic design system (tokens + component bundle) |
| `assets/` | app chrome: logo, hero video, placeholder |
| `refs/` | 86 Residence source imagery — only needed until the seed moves it to Storage |
