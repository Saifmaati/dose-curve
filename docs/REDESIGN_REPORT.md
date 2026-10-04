# MaatiRX 2.x redesign report

The redesign ran on 2026-09-30 and 2026-10-01 as four releases, each its own pull request, with the site working at every step. The brief changed twice during the first release (a quiet "precision instrument"; then a persistent cinematic 3D stage; then a reference-led brief with alternating dark and paper sections and one travelling object). The last brief is the one built; its reference image (a file in Downloads) was not on the machine, so its written description was followed (DECISIONS 116–117). The design system, the critique and every storyboard are in [DESIGN.md](DESIGN.md).

| Release | Pull request | What it adds |
| --- | --- | --- |
| 2.0.0 | https://github.com/Saifmaati/dose-curve/pull/21 | Tokens for a dark and a paper theme; IBM Plex Sans and Mono served from the site; charts drawn from the theme; the 3D stage (Three.js 0.186.1 from cdnjs, pinned with hashes, Effects switch, a CSS version); the seven-screen opening sequence; top bar and pinned action; glass panels at a computed contrast floor; CLS 0 on every link |
| 2.1.0 | https://github.com/Saifmaati/dose-curve/pull/22 | The simulator and Compare on the stage: the ribbon eases into new curves, the time cursor rides it, the population cloud from the app's own sampler, two ribbons for A and B |
| 2.2.0 | https://github.com/Saifmaati/dose-curve/pull/23 | Lessons, Cases, Practice, Fit and Hit the window as paper pages under giant split mastheads; the case as a dossier with accordions and a dark levels panel |
| 2.3.0 | (branch `v2.3.0`) | The validation sphere of 712 checks; the educator page on paper; README screenshots; the link preview |

## Numbers at 2.3.0

| | 1.17.1 | 2.3.0 |
| --- | --- | --- |
| Tests (files) | 355 (19) | 362 (20) |
| Lighthouse mobile, root (perf / accessibility / CLS) | 97 / 100 / 0 | 99 / 100 / 0 |
| Lighthouse mobile, a deep link | 97–100 | 96–99, CLS 0 |
| Lighthouse mobile, validation / educators | 97 / 100 | 99 / 100 |
| axe violations (13 states × 2 themes × 2 widths, and the other pages) | 0 | 0 |
| Initial script over the Phase 0 baseline (limit 25%) | +21.8% | +23.9% |
| Stylesheet (limit 250 KB) | 76 KB | 85 KB |
| Font families | 3 (from Google) | 2 (served from the site) |

The default scenario's numbers are unchanged: Cmax 9.3 mg/L, AUC 74.2 mg·h/L, 48% of the window in range.

## What was checked, and how

- Screenshots at 1440, 1024 and 390 px in both themes, for every screen of the opening sequence, the simulator, Compare, every paper page, present mode and print, reviewed and fixed in rounds (the fixes are listed in each release's CHANGELOG entry).
- A layout-shift trace on the root, `#lessons`, `#practice`, `#compare`, `#p=…`, a lesson link and a case link: 0 on each.
- Contrast: every text token computed against its surface, and against the glass over a stage far brighter than a blurred ribbon.

## Known limits

- Once a reader scrolls down to the chart, the ribbon is mostly behind the glass panels; the cursor marker and the population cloud show best at the top of the page and on wide screens.
- Lighthouse readings on this machine dropped to 57–84 while a preview tab kept animating in the background; with it closed, both 2.1.0 and 2.3.0 read 99 on the root. The live site should be measured again after merging.
- The opening sequence's scenes and the stage are built for the default palette; a custom high-contrast mode in the operating system isn't specially handled beyond what the browser does.
