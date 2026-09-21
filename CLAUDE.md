# Project instructions

## Installed skills

- **Apple Design** — `skills/apple-design/SKILL.md` (from github.com/emilkowalski/skills).
  Read it before building or reviewing gesture-driven UI, spring animations, drag/swipe/sheet
  interactions, translucent materials, or motion-heavy typography. It governs *motion and
  interaction feel*; the project's bound visual design system still governs colour, type and
  components.

## Versioning

`APP_VERSION` and `CHANGELOG` live near the top of the script in
`Studio Platform.dc.html` (search `APP_VERSION`). Every change that reaches this file —
here or in `report.js`, `platform-data.js`, etc. — bumps `APP_VERSION` and adds a
`CHANGELOG` entry describing it in plain terms, in the same commit as the change. The
version shows as a badge in the top bar (admins only) and the full history is at
Studio → Changelog. This is the studio's way of confirming a `git push` actually reached
GitHub Pages, since the site has no build step and no other deploy signal — so bump it,
don't skip it, and tell the user which version number to expect after pushing.
