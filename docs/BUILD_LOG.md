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
