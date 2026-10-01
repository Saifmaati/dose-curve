# v1.0 build log

One line per task. Status is done, deferred or dropped. Times are the commit times on this machine's clock (US Eastern). Hashes are commits on the local `v1.0` branch (see decision 2 in `DECISIONS.md`).

| Time | Phase | Task | Status | Commit |
| --- | --- | --- | --- | --- |
| 2026-09-29 23:07 | 0 | Audit (`docs/AUDIT.md`): file map, baseline metrics, QA pass | done | 2f1805e |
| 2026-09-29 23:07 | 0 | Fix the load-time layout shift, the inspector button names, the Safari blur prefix and the `dvh` fallback | done | 2f1805e |
| 2026-09-29 23:08 | 0 | Bump the service-worker cache (dosecurve-v2); the tests read the cache name from sw.js | done | 8e8e8fc |
| 2026-09-29 23:21 | 1 | Engine: Cockcroft–Gault, Devine IBW, AdjBW, renal scaling by fe, units, salt factor, cited drug library (+ digoxin, phenytoin, lithium), v5 links | done | 8f8f513 |
| 2026-09-29 23:32 | 1 | Page: clinical patient panel with the working, units end to end, drug sources panel, What-changed causes, Kidney function lesson and comparison, 6 glossary terms | done | e39dce5 |
| 2026-09-29 23:32 | 1 | Tests: tests/clinical.test.js (14 tests: hand values, fe limits, unit round trips, salt factor, library sources, v5 and v1 links, lesson) | done | e39dce5 |
| 2026-09-29 23:33 | 1 | Docs (teaching guide, changelog, decisions) and cache v3 | done | 52e1dd3 |
| 2026-09-29 23:47 | 2 | Engine: Michaelis–Menten path (RK4, exact dose events, dense cached solution), Css, t90, level-dependent t½, periodic steady state, phenytoin as saturable, Sheiner–Tozer, lesson, comparison, 4 glossary terms, 4 practice kinds; tests/nonlinear.test.js | done | f609b67 |
| 2026-09-29 23:51 | 2 | Page: kinetics switch, Vmax and Km sliders, saturable readouts and working, steady-state panel, chart note, explainer branch, albumin tool; docs; cache v4 | done | b4ee887 |
| 2026-09-30 00:05 | 3 | Cases tab: 8 cases in cases.js (lazy), grading with rule-based hints and practical-strength rounding, walkthroughs, links, print; tests/cases.test.js; tab bar scrolls on phones; cache v5 | done | 5080fc6 |
| 2026-09-30 00:12 | 4 | Validation: scipy reference (94 scenarios), tests/validation.test.js (matrix + identities), validation.html (live), windowStats accuracy fix, lesson figure corrected; cache v6 | done | 3f73afd |
| 2026-09-30 00:59 | 5 | CI workflow + badge, README rewrite (screenshots), LICENSE, CITATION.cff, .zenodo.json, issue templates + footer feedback link, analytics flag + privacy note, NEEDS-SAIF.md, tests/release.test.js; cache v7 | done | a2c7819 |
| 2026-09-30 01:11 | 6 | Population mode: pop-worker.js (Web Worker), band + median, PTA (window, AUC24), compare mode, links, 2 glossary terms; glossary moved to pk-glossary.js (budget +22.0%); tests/population.test.js; cache v8 | done | 81fcf6c |
| 2026-09-30 01:18 | 7 | Present mode, system theme default, switchable shortcuts (Space, arrows, L, B, ?), keyboard dose timeline, chart text alternative, reduced motion, week-by-week guide; Lighthouse a11y 100 (mobile, desktop, validation); tests/a11y.test.js; cache v9 | done | f8a3c2f |
| 2026-09-30 01:21 | 8 | Version 1.0.0: footer, CHANGELOG heading, meta and structured data, share card pill (23 lessons, repainted in-browser); docs/BUILD_REPORT.md | done | 0c63e26 |
| 2026-09-30 01:29 | 8 | Fresh clone of the branch: 246/246; CI green on branch and PR; PR #1 merged to main (a75f28c); Pages deploy byte-identical (20 files); live click-through; live Lighthouse 85/98, a11y 100 | done | a75f28c |
| 2026-09-30 01:56 | 1.1 | Two compartments (stretch): engine (sum of exponentials for every route), lesson, comparison, 2 glossary terms, vancomycin case note; worked formulas moved to pk-math.js (budget +22.2%); windowStats exact (refined peak, Simpson, bisection) and the last dose's peak refined (up to 1.2% low before); tests/twocmt.test.js | done | edde814 |
| 2026-09-30 01:56 | 1.1 | Validation: two-compartment drug in the SciPy reference (126 scenarios, 504 comparisons, every difference under 0.00002%); closeness guard test | done | eaaebbe |
| 2026-09-30 01:56 | 1.1 | Page: compartments switch, k12/k21 sliders, V1 and terminal-half-life readouts, explainer for model and exchange changes; checked in the browser (360 px, axe clean in both themes, validation 504/504); version 1.1.0; cache v10 | done | 8e4103f |
| 2026-09-30 01:56 | 1.1 | Docs: changelog 1.1.0, decisions 55–60, build report section 9, teaching guide, README, NEEDS-SAIF tag steps | done | 915dcc4 |
| 2026-09-30 02:35 | 1.2 | Population mode for saturable drugs (Vmax and volume variability, exact periodic steady states, no-steady-state share); mmSteady solved directly by secant (about 100× faster, fixes up to 0.12% near Vmax); the worker integrates each patient once; superseded jobs stopped | done | 17ec7dd |
| 2026-09-30 02:40 | 1.2 | Faster first paint: non-blocking fonts, deferred engine, app as a module script; Lighthouse mobile 85 → 98–99 on a gzip preview, CLS 0 | done | 7959880 |
| 2026-09-30 02:47 | 1.2 | Case 9, vancomycin from two levels (first-order method, two-compartment sampling comparison); the CID executive summary read in full and cited; 360 px and axe clean in both themes | done | 5398751 |
| 2026-09-30 02:47 | 1.2 | Version 1.2.0, cache v11, build report section 10 | done | 1978077 |
| 2026-09-30 03:06 | 1.3 | Fit the data, two compartments: strippable data (α ≥ 8β), the method of residuals in fitEstimate and on the page, the model held fixed; by-hand values fit 97% of sets | done | 4a9b5f9 |
| 2026-09-30 03:14 | 1.3 | Practice: AUC from two levels and two-compartment clearance (32 kinds); worksheet links carry a pool version (1.2.0 sheets rebuilt exactly); problems moved to pk-practice.js (initial script +14.1%) | done | 944d59d |
| 2026-09-30 03:16 | 1.3 | Validation page: the waiting summary has the result's shape (mobile Lighthouse 95 → 100); teaching guide counts | done | 73ad484, e03143e |
| 2026-09-30 03:17 | 1.3 | Version 1.3.0, cache v12, build report section 11 | done | 9b34443 |
| 2026-09-30 03:27 | 1.4 | Random-scenario cross-check against dense scans; fixed the dose-table and steady-state peaks (up to 3.7% low) and a bolus at the window's end; regression tests | done | 6ddef7a |
| 2026-09-30 03:30 | 1.4 | Validation page checks run a dozen at a time with progress (longest task 295 → 57 ms) | done | 1953391 |
| 2026-09-30 03:34 | 1.4 | Case 10, gentamicin after burns from two levels (Sawchuk–Zaske); Zaske 1976 abstract read, Sawchuk and Zaske 1976 metadata verified; 360 px and axe clean | done | 7f755c9 |
| 2026-09-30 03:35 | 1.4 | Glossary: three terms (47), formulas tested; version 1.4.0, cache v13, build report section 12 | done | b90c5f5, df44897 |
| 2026-09-30 03:44 | 1.4.1 | Standing cross-check in the tests; fixed the IV-bolus dose table (off by one dose since 1.0) | done | c77fe4f |
| 2026-09-30 03:45 | 1.4.1 | Version 1.4.1, cache v14, build report section 13 | done | 352aeaf |
| 2026-09-30 03:54 | 1.5 | "t½ terminal" label with two compartments; README two-compartment screenshot; custom schedules in the standing cross-check | done | cb6810a, 02d9fdd, c8994e6 |
| 2026-09-30 03:54 | 1.5 | Version 1.5.0, cache v15, build report section 14 | done | a9727fa |
| 2026-09-30 08:06 | 1.6 | Effect statistics exact (bolus jumps, bisection crossings); window times and effect in the standing cross-check | done | 5c4adc1, db399b5 |
| 2026-09-30 08:07 | 1.6 | Two-compartment t90 working gives the exact constant-infusion figure | done | 0d7f06b |
| 2026-09-30 08:09 | 1.6 | Text alternatives for the per-dose and effect charts | done | e131d84 |
| 2026-09-30 08:19 | 1.6 | Levetiracetam and meropenem from DailyMed labels; lesson 25 (time above the MIC), comparison, glossary term; comparison table keyboard-reachable; axe clean on every tab in both themes; share card 25 lessons | done | e1f33f2 |
| 2026-09-30 08:20 | 1.6 | Version 1.6.0, cache v16, build report section 15 | done | 1e94eed |
| 2026-09-30 08:23 | 1.6 | Case 11, meropenem by the label renal table (a label-table target) | done | b0c16c6 |
| 2026-09-30 08:25 | 1.6 | Case 12, levetiracetam by the label renal table per 1.73 m² (Mosteller); table targets take ranges | done | b972489 |
| 2026-09-30 08:27 | 1.6 | Practice: renal dose adjustment (33 kinds); worksheet pool v3 with v2 snapshot | done | 84ba2d7 |
| 2026-09-30 08:29 | 1.6 | Validation page lists the effect closed form and the standing cross-check | done | 9e183df |
| 2026-09-30 13:10 | 1.7 | Effect-site delay (closed form, every route, 1–2 compartments, custom schedules); dashed effect-site curve, hysteresis loop, cursor, CSV, What changed; lesson 26, comparison 20, glossary 50; links v6 | done | 6b09680 |
| 2026-09-30 13:12 | 1.7 | SciPy reference: 20 effect-site scenarios (146, 584 comparisons, earlier rows unchanged); random effect-site cross-check | done | 125e36e |
| 2026-09-30 13:14 | 1.7 | Version 1.7.0, cache v17, share card 26 lessons, build report section 16, decisions 73–74 | done | b59bdd6 |
| 2026-09-30 13:25 | 1.6 | Deployed 1.6.0: branch v1.6.0 by web upload (3 commits), fresh clone 277/277, CI green on push and PR, PR #8 merged | done | 0845417 |
| 2026-09-30 13:20 | 1.7 | Teaching guide: the effect-site delay | done | ee22c1d |
| 2026-09-30 13:40 | 1.7 | Deployed 1.7.0: branch v1.7.0 by web upload (4 commits), fresh clone 283/283, CI green, PR #9 merged; live byte check, lesson 26 and validation 584/584 live | done | b1ae2f3 |
| 2026-09-30 13:50 | 1.8 | Practice: effect delay, time of peak effect (34 kinds), worksheet pool v4 with v3 snapshot | done | b7584f4 |
| 2026-09-30 13:55 | 1.8 | Service worker installs past the HTTP cache; validation results by content hash | done | 441700c |
| 2026-09-30 14:00 | 1.8 | Vary only: effect-site delay | done | b2d3210 |

| 2026-09-30 14:05 | 1.8 | Deployed 1.8.0: branch v1.8.0 by web upload (3 commits), fresh clone 285/285, CI green, PR #10 merged; live byte check and practice live | done | b31ff5e |
| 2026-09-30 14:10 | 1.9 | Lesson 26 on the default window; README screenshot of the effect-site delay | done | d79a368 |
| 2026-09-30 15:30 | 1.9 | Liver model (well-stirred), lessons 27–29, practice topic (37 kinds, pool v5), glossary 55, links v7 | done | 4d08c50 |
| 2026-09-30 15:40 | 1.9 | Version 1.9.0, cache v19, share card 29 lessons, build report section 18, decisions 76–77 | done | fe89e97 |
| 2026-09-30 11:02 | 1.9 | Deployed 1.9.0: branch v1.9.0 by web upload (4 commits), fresh clone 294/294, CI green, PR #11 merged; live byte check, lessons 27–29 and practice live | done | da05093 |
| 2026-09-30 14:35 | 1.10 | Lesson texts, predictions and challenges moved to lazily loaded pk-lessons.js; initial script +23.7% → +10.0% | done | e397d86 |
| 2026-09-30 | 1.10 | Push access proven (scratch branch pushed and deleted); tags v1.0.0–v1.9.0 pushed; Releases and branch deletion blocked by the auto-mode check (NEEDS-SAIF) | done | — |
| 2026-09-30 17:46 | 1.11 | Bayesian (MAP) engine in pk-bayes.js; measured levels in scenarios and v8 links; SciPy MAP reference (20 scenarios) on the validation page | done | 97229fe |
| 2026-09-30 17:51 | 1.11 | Individualize from levels panel; estimate on the chart; applying it keeps the levels' regimen as the baseline; page-scripts-parse test | done | f1fbf1a |
| 2026-09-30 18:03 | 1.11 | Bayesian cases (vancomycin, gentamicin), lesson 30, glossary 58, Sheiner 1979 source, share card | done | 10f4f4f |
| 2026-09-30 18:14 | 1.12 | Instructor tools: write a case, assignments, completion codes and verification; class guide; privacy notes | done | 8813e6f |
| 2026-09-30 18:14 | 1.12 | Assignment builder selects labelled (axe clean in both themes) | done | df5c499 |

| 2026-09-30 20:19 | 1.13 | Antimicrobial PK/PD: MIC and fu, fT>MIC / Cmax/MIC / AUC24/MIC panel, chart and Compare; piperacillin-tazobactam; two lessons; practice topic; reduced-CrCl case; glossary 63; SciPy PK/PD reference; v9 links | done | c6ae185 |
| 2026-09-30 20:22 | 1.13 | Community cases: fT>MIC target, solved by bisection | done | f242195 |
| 2026-09-30 21:41 | 1.14 | Indirect responses (types 1–4) in pk-idr.js; response charts, readouts, Compare, What changed; lesson 27 (warfarin-like); comparison 26; practice idrss (pools v7); glossary 66; links v10 | done | 073456f |
| 2026-09-30 21:45 | 1.14 | Drug sources and notes moved to lazily loaded pk-sources.js (initial script +18.2%) | done | edb3153 |
| 2026-09-30 21:45 | 1.14 | SciPy indirect-response reference, 12 scenarios (696 comparisons) | done | bd9d1da |
| 2026-09-30 22:25 | 1.15 | Hemodialysis in pk-hd.js (exact between events): session table, chart bands, readouts, What changed; case 16 (gentamicin on hemodialysis); lesson Hemodialysis sessions; comparison 27; practice hdfall (pools v8); glossary 68; links v11 | done | 73ce289 |
| 2026-09-30 22:25 | 1.15 | SciPy dialysis reference, 8 scenarios (712 comparisons) | done | 24bbdde |
| 2026-09-30 22:29 | 1.16 | Sensitivity analysis (±20%, tornado chart, dominant input) in pk-sens.js; glossary 69 | done | 0dc21be |
| 2026-09-30 22:39 | 1.17 | Educator page, named tab links, README screenshots, validation page responsiveness, Lighthouse ≥95 everywhere | done | 618c40c |
| 2026-09-30 22:52 | 1.17.1 | Phase I review fixes (dialysis in population mode and the Bayesian panel, session-edge peaks, sensitivity window AUC, glossary wording); 1,000-seed cross-check; BUILD_REPORT_V2; NEEDS-SAIF reduced | done | 8eddf8a |
| 2026-10-01 00:45 | 2.0.0 | Redesign stage 1: tokens, IBM Plex (self-hosted), charts from tokens, controls, the 3D stage (Three.js, Effects), the seven-screen opening sequence, top bar and pill, glass, CLS 0 on every link | done | (this release) |
| 2026-10-01 01:25 | 2.1.0 | Redesign stage 2: the ribbon eases into new curves, the cursor rides the ribbon, the population cloud from the app's sampler, Compare's two ribbons, phones step the stage back | done | (this release) |
| 2026-10-01 02:05 | 2.2.0 | Redesign stage 3: paper pages for lessons, cases, practice, fit and hit the window; mastheads; case dossier with accordions and a dark levels panel; pill actions; faster paper rendering | done | (this release) |
| 2026-10-01 02:35 | 2.3.0 | Redesign stage 4: the validation sphere (712 checks), the educator page on paper, README screenshots, link preview image and counts, masthead fitted to its words | done | (this release) |
| 2026-10-01 03:40 | 2.4.0 | When to sample (pk-tdm.js), lesson "Which weight for CrCl" (35 lessons), case of the day, ARCHITECTURE.md, CONTRIBUTING.md, tools/stamp.js, print fixes | done | (this release) |
| 2026-10-01 04:40 | 2.5.0 | Layout shift fixed on lesson links (up to 0.23) and #cases (0.63); all 107 link kinds CLS 0 at 390 and 1440; What changed sentences in pk-explain.js (script +24.7% to +18.0%) | done | (this release) |
| 2026-10-01 05:30 | 2.6.0 | Population band on the effect chart (direct, delayed, indirect), spread sentence, faster indirect-response solver | done | (this release) |
