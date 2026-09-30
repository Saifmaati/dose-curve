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
