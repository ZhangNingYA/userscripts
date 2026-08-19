# Repository Instructions

## Project Overview

- This repository publishes browser userscripts and their catalog at `https://scripts.fulafu.com/`.
- Each userscript lives in `scripts/<slug>/` and the directory must contain exactly one `.user.js` file.
- The catalog source is in `site/`; `tools/build-site.mjs` builds the deployable site into `dist/`.
- GitHub Pages deployment is defined in `.github/workflows/deploy-pages.yml` and runs after a push to `main`.

## Working Agreements

- Inspect the current working tree before editing and preserve unrelated user changes.
- Keep changes scoped to the requested script or catalog behavior.
- Do not edit or commit `dist/`; it is generated and ignored by Git.
- Do not add secrets, credentials, private endpoints, or personal data. Everything published here is publicly readable.
- Avoid adding dependencies unless they remove substantial complexity and the user agrees to the tradeoff.
- Do not commit, push, publish, or open a pull request unless the user explicitly asks for it.

## Userscript Conventions

- Keep the userscript metadata block valid and preserve the production `@homepageURL`, `@updateURL`, and `@downloadURL` unless the hosting location intentionally changes.
- A published userscript behavior change must update all of these together:
  - `@version`, using semantic versioning.
  - The matching runtime version constant, when the script exposes one in its UI.
  - The matching release timestamp, formatted as `YYYY-MM-DD HH:mm:ss UTC+8`.
- Site-only changes do not require a userscript version bump.
- Preserve compatibility with desktop browsers and Android Edge userscript managers. Controls must remain touch-friendly and layouts must not overlap at narrow viewport widths.
- Maintain graceful failure behavior when storage, cookies, history APIs, or network requests are unavailable.

## PTT Modern Reader

- Source: `scripts/ptt-modern-ui/ptt-modern-ui.user.js`.
- Preserve the automatic PTT over-18 flow, including the `over18` cookie and `/ask/over18` handling.
- This is an SPA reader. Internal board and article navigation should avoid full-page reloads while keeping the address bar and browser history correct.
- Infinite scrolling means fetching and appending older board pages near the bottom. Do not replace it with timed or automatic page refreshes.
- Browser Back and Forward must restore the correct view and a useful scroll position after opening an article and returning to a board.
- Preserve the core reader settings: Traditional/Simplified Chinese, background theme, font size, version, and release time.
- When changing parsing logic, account for pinned, deleted, malformed, empty, and ordinary PTT entries without breaking the entire page.

## Catalog Conventions

- Keep public catalog UI copy in English.
- Keep the catalog restrained and readable: compact typography, clear hierarchy, responsive layout, and no decorative oversized headings.
- Treat userscript metadata as the catalog's source of truth; do not duplicate script records manually.
- When adding a script, add one directory and one `.user.js` file under `scripts/`; the build tool should discover it automatically.
- Every userscript addition, update, rename, or removal must be reflected on the published catalog in the same release. Do not treat the script push and website update as separate work.
- Keep catalog requests cache-safe so a successful Pages deployment is visible immediately. When changing a versioned site asset, also bump its query version in `site/index.html`.

## Verification

- Run `npm run build` after every code change. The build also runs `node --check` on every userscript and validates required metadata.
- Confirm the build ends with the expected script count and inspect relevant files in `dist/` when catalog generation changes.
- For PTT behavior or UI changes, test the affected workflows against live or representative PTT pages when browser access is available.
- For navigation or rendering changes, cover at least:
  - First visit and the over-18 gate.
  - Board rendering and bottom-of-page infinite loading.
  - Opening an article, then using browser Back and Forward.
  - Traditional/Simplified switching, every theme, and font-size controls.
  - Desktop and narrow mobile viewports, including touch interaction and text overflow.
- Report any browser checks that could not be run; do not claim visual or mobile validation based only on a successful build.

## Release Checks

- Before a requested push, review the diff and run `npm run build` from a clean understanding of the working tree.
- Use a concise, scoped commit message. Do not mix generated `dist/` files or unrelated changes into the commit.
- A push to `main` deploys GitHub Pages. After a requested deployment, verify both the catalog and the affected `.user.js` production URL, including the published version metadata.
- Do not report a userscript release complete until the Pages workflow succeeds and the uncached production homepage/catalog, generated detail page, and install URL all show the same new version. Verify removed scripts are absent from the catalog and return `404` when removal is intentional.
