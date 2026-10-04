# MaatiRX audit before v1.0

Written 2026-09-29 at the start of the v1.0 build (branch `v1.0`). It records where everything lives, how it is tested and deployed, the baseline numbers the build is measured against, and the bugs found and fixed before any new feature. The earlier audit is `docs/audit-2026-09-27.md`.

## File map

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, one `<style>` block and one inline `<script>`. There is no build step, framework or bundler. |
| `pk-engine.js` | The PK/PD engine. It is DOM-free: the page loads it as `window.PK` and the tests load it with `require()`. The page loads it under its content hash (`pk-engine.js?v=<sha-256 prefix>`), and a test enforces the stamp. |
| `sw.js` | Service worker for offline use. The page comes from the network first; the engine, icons, manifest and Google Fonts come from the cache and are refreshed. |
| `tests/pk-engine.test.js` | Engine, share links, lessons, practice, fit, window, glossary, progress and page-integrity tests. |
| `tests/sw.test.js` | Service worker tests, run against a simulated cache and network. |
| `404.html`, `robots.txt`, `sitemap.xml`, `site.webmanifest` | Site files for GitHub Pages. |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `og-image.png` | Icons and the share card. |
| `README.md`, `CHANGELOG.md` | Project readme and release notes. |
| `docs/teaching-guide.md` | Guide for instructors. It is linked from the footer. |
| `docs/audit-2026-09-27.md` | The first audit and its follow-ups. |

## Where each part lives

Line numbers are approximate. They are the `/* ===== NAME ===== */` banners in each file.

| Part | Engine (`pk-engine.js`) | Page (`index.html` script) |
| --- | --- | --- |
| Scenario model: keys, defaults, ranges, custom schedules | SCENARIO MODEL (l. 18) | STATE (l. 1432) |
| PK maths: sum-of-exponentials responses, superposition, `derived`, `windowStats`, `ssConc`, `ssProfile` | PK ENGINE (l. 155) | |
| Time inspector and extrema | TIME INSPECTION (l. 365) | TIME INSPECTOR, CROSSHAIR |
| Sigmoid Emax PD | PHARMACODYNAMICS (l. 429) | EFFECT (PK/PD) |
| Chart drawing (canvas) | | PLOT, AXIS HELPERS |
| Readouts and "show the math" | SHOW THE MATH (`metricMath`) | READOUTS |
| "What changed" explainer and A/B rows | COMPARISON (`compareRows`, `diff`) | COMPARISON, COMPARE MODE |
| Drug library (6 presets) | PRESETS (`DRUGS`) | DRUG LIBRARY |
| Lessons (21) and their checks | PRESETS (`LESSONS`), LESSON CHECKS | LESSONS |
| Comparison templates (15) | PRESETS (`TEMPLATES`) | COMPARE MODE |
| Practice generator (26 kinds) and worksheets | PRACTICE PROBLEMS | PRACTICE, WORKSHEETS |
| Fit the data, Hit the window | FIT THE DATA, HIT THE WINDOW | FIT THE DATA, HIT THE WINDOW |
| Share-link codec (`#v=1..4`, task links `#p=`, `#fit=`, `#win=`, `#ws=`) | SHARE LINKS | SHARE LINKS |
| Saved-scenario library (localStorage) | SCENARIO LIBRARY | SCENARIO LIBRARY |
| Progress (localStorage) | PROGRESS | PROGRESS |
| Glossary (30 terms) | GLOSSARY | LESSONS tab |
| Offline | | `sw.js`, registered at INIT |

## Tests, build and deploy

- **Tests:** `node --test tests/` (Node 20). There are no dependencies and no `package.json`.
- **Build:** none. The files are served as they are.
- **Deploy:** GitHub Pages builds from `main`. In this environment there are no git push credentials. Releases reach `main` through GitHub's web "Upload files" page. The deploy is then checked by byte-comparing the live files with the local ones.
- **Engine stamp:** after any change to `pk-engine.js`, the `?v=` stamp in `index.html` must be updated. The test "loads the engine under its own content hash" prints the value.

## Baseline (live site at commit 18037f5)

| Measure | Value |
| --- | --- |
| Tests | 179 (173 engine and page, 6 service worker), all passing |
| `index.html` | 274,368 bytes: inline JS 172,918, inline CSS 59,903, markup 41,547 (77,183 gzipped) |
| `pk-engine.js` | 146,078 bytes (46,240 gzipped) |
| **Initial JS payload** | **318,996 bytes** (inline script plus engine). The v1.0 budget is +25%, so at most **398,745 bytes**. |
| Lighthouse 12, mobile | Performance 75 · Accessibility 100 · Best practices 100 · SEO 100 |
| Lighthouse 12, desktop | Performance 92 · Accessibility 100 · Best practices 100 · SEO 100 (CLS 0.144) |
| axe-core 4.10.2 | 0 violations: Simulator, Compare, Lessons and Practice in the dark theme, Simulator in the light theme |

Lighthouse ran headless in Chrome, against the live URL. Its flagged items were:

- One layout shift on desktop.
- `label-content-name-mismatch` on the inspector's ⟨ dose ⟩ buttons.
- Render-blocking fonts and engine.
- 2.6 s of main-thread work on the throttled mobile profile.

## Manual QA pass

| Check | Result |
| --- | --- |
| 360 px, every tab (Simulator, Compare, Lessons, Practice) | No horizontal overflow |
| 360 px, task views: shared problem, fit data set, window task, worksheet, embed plus light theme | No horizontal overflow |
| Exports: CSV, PNG and embed code | CSV (text/csv, 8.8 kB) and PNG (image/png, 235 kB) download; the embed snippet is copied |
| Keyboard | Every control is reachable. Tabs use arrow keys, dialogs trap and restore focus, and the chart takes arrow keys (covered by the 2026-09-27 audit; unchanged since) |
| Safari | See the risks below |
| Offline | Service worker behaviour covered by `tests/sw.test.js` (page network-first, engine and fonts cached, stale engines dropped) |

Safari risks:

- **`backdrop-filter`:** four rules had no `-webkit-` prefix. Safari before 18 needs the prefix, so the blur was missing there. Fixed.
- **`100dvh`:** the full-screen library dialog on phones had no fallback for browsers before Safari 15.4. Fixed with a `100vh` first.
- **No other risks found.** A search found no lookbehind regexes, `structuredClone`, `requestIdleCallback`, `Array.prototype.at`, `:has()`, `color-mix()` or CSS nesting. Clipboard writes fall back when the Clipboard API is unavailable.

## Bugs found and fixed in Phase 0

1. **Layout shift on first load (desktop CLS 0.144).** Three causes:
   - The quick-start strip was un-hidden by script after the first paint. The page now decides whether to show it in the head script, before the first paint.
   - The chart legend was empty until the script filled it. It now reserves one row.
   - Fallback fonts had different widths from the web fonts. The page now has metric-matched fallback faces (`size-adjust` and ascent/descent overrides measured against Arial and Courier New), so nothing reflows when the web fonts arrive.

   Result: desktop CLS **0.01** in Lighthouse on the local build.
2. **The inspector's ⟨ dose, dose ⟩, ⟨ peak … buttons had visible text that wasn't part of their accessible names** (WCAG 2.5.3, Label in Name). The arrows are now drawn by CSS, so the visible word ("dose") is contained in the name ("Previous dose").
3. **The Safari prefix and `dvh` fallback**, as above.

No bugs are deferred.
