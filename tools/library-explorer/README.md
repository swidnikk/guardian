# Library Explorer

Static site generator for the Methodology Library. It reads the `policy.yml` manifests, validates them, and writes a fully static site (HTML, `data/catalog.json`, `data/library.sqlite`). It never writes to the library.

## Build

    npm ci
    node build.js --lib "<path to Methodology Library>" --out <output dir>

`--lib` is the library root (read-only). `--out` is the output folder; never build into the repo. Serve the output over http (for example `python3 -I -m http.server 8411 --bind 127.0.0.1 -d <out>`). The Advanced Search page needs http because it loads WebAssembly. All links are relative, so the site also works under a sub-path such as `/guardian/`.

`build-report.json` is written to the output root for local use only. The Pages workflow removes it before upload; do not publish it (it contains local paths).

## Settings: `site.config.json`

- `repo`: `url` and `branch` of the GitHub repository. One setting used by the card "View on Github" link and the About page "Visit GitHub" link.
- `links`: `platformUpdates` and `feedback` URLs used by the About page.
- `intro`: `text` (shown as the header on Catalog and About), plus `sourceUrl`, `sourceFile` and `snapshotDate` recording where it came from.
- `about.blocks`: the About page blocks, each with `question`, `label` and `link` (a key of `links`, or `github` meaning `repo.url`). Edit wording and links here, not in templates.

## Refreshing the intro snapshot

The intro is a committed text snapshot, not fetched at build or runtime, so it can go stale. Whoever publishes the site refreshes it: re-copy the opening paragraph (two to three sentences) of `docs/methodology-digitalization/methodology-library.md`, update `intro.text` and `intro.snapshotDate`. The wording must be approved by the user before it is published.

## Third-party dependency

`links.feedback` is a `tiny.cc` short link. Whoever controls the short link controls its target. It is the user's own link; keep it listed here as a known dependency.

## Routes

`index.html` (Catalog), `health/`, `advanced/` (Advanced Search), `about/`, `p/<id>/` (policy pages). `sql/index.html` is a small redirect page (meta refresh plus link) to `advanced/`, kept so old links to the former SQL page do not break.

## Filter links (B-11)

On every card and on the policy page, the values for sector, category, standards body, Hedera publication (Live / Testnet only / No record), status and policy type are links to `index.html?<facet>=<value>` (relative, URL-encoded; `net=mainnet|testnet|none` for publication). Without JavaScript they navigate; on the catalog, JavaScript adds the value to the current filters in place and announces the result count. `status=deprecated` or `status=superseded` turns the matching switch on. Hover and keyboard focus show a solid white pill (dark text, over any art). Tag chips now add as well (they used to replace the facet; ASSUMED, for consistency).

## Header and look (B-12)

The title bar is the Hedera logo, "Hedera Guardian" (links to https://guardian.hedera.com) and "Methodology Library" (links to the catalog). Header, nav and intro are pinned together (`#shell-sticky`); `nav.js` publishes their real height as `--sticky-top` (the filter panel and `scroll-margin-top` use it). Under 700px wide or tall the pinned intro is one line with a More toggle; without JavaScript the header is not pinned there. The logo is `carbon-atlas/public/hedera-logo.png` downscaled to `assets/hedera-logo-64.png` (macOS `sips -Z 64`) and inlined as a data URI. Colors are sampled from the GitBook docs screenshot and listed as ASSUMED at the top of `assets/css/00-base.css`; the font is a system sans stack (Inter is not bundled, Q-18).

## Tests

    node test/shell.browser.test.mjs <output dir>
    node test/v31.browser.test.mjs <output dir> [screenshot dir]
    node test/catalog.browser.mjs <base url ending in />   (needs the build served over http)
    node test/catalog.unit.mjs

The browser tests run headless Chrome (`/Applications/Google Chrome.app`) against the build; the shell and v31 tests serve it themselves at `/` and `/guardian/` and include axe-core.

## Names

The code name "Cairn" no longer appears in published output. The npm package name in `package.json` is internal and unchanged.
