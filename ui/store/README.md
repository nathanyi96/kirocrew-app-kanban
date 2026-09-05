# Store assets

`icon.svg` puts the existing `ui/icon.svg` mark on an opaque 512 × 512 tile.
`hero.svg` (1200 × 675) and `banner.svg` (1200 × 288) are editable SVG artwork.

`board.png` is an unedited screenshot of the installed app running in KiroCrew
0.5.0, captured at 1800 × 1000 after the repository's Playwright journey.
The cards are test data; execution responses come from KiroCrew's fake ACP
backend. It shows the actual UI, not production agent results.

These are shipped product assets referenced by `app.json`. CI review evidence
is kept separately under `docs/e2e/<pr-number>/`.
