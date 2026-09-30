# DoseCurve v1.0 build report

Built unattended on 29–30 September 2026 on the `v1.0` branch, then merged into `main`. The build log (`docs/BUILD_LOG.md`) lists every task, and `docs/DECISIONS.md` every judgment call.

## 1. Summary

DoseCurve 1.0 is a free, static, browser-based pharmacokinetics and PK/PD simulator for pharmacy education. It now covers:

- the calculations pharmacists do: Cockcroft–Gault renal adjustment, saturable (Michaelis–Menten) kinetics, and population variability with probability of target attainment;
- eight clinical cases that the model grades;
- a drug library whose every value names its source or is marked unverified.

Its numbers agree with an independent SciPy solver within 0.025% on 94 scenarios, which anyone can rerun, and the work is test-covered (246 tests), CI-checked, citable and accessible (Lighthouse accessibility 100).

## 2. Shipped, by phase

| Phase | Feature | Where to see it | Tests |
| --- | --- | --- | --- |
| 0 | Audit, baseline metrics, QA pass | `docs/AUDIT.md` | — |
| 0 | No layout shift on first load (CLS 0.144 → 0.01) | Desktop first load | Lighthouse |
| 0 | Inspector buttons' accessible names; Safari blur prefix and `dvh` fallback | Under the chart | `a11y.test.js` |
| 1 | Clinical patient mode: IBW, AdjBW, Cockcroft–Gault, CL = CL_ref × [(1 − fe) + fe × CrCl/120], with the working shown | Simulator → Patient → Clinical (CrCl) | `clinical.test.js` |
| 1 | Drug library with sources: 9 drugs (digoxin, phenytoin, lithium new); 54 values cited, 27 flagged unverified | Simulator → Drug Library → a drug → "Where these values come from" | `clinical.test.js` ("every library value has a source…") |
| 1 | Units end to end (ng/mL, mEq/L) and the salt factor | Load digoxin or lithium | `clinical.test.js` (unit round trips, 8.12 mEq) |
| 1 | What changed: CrCl, fe, salt factor, units | Set baseline, change SCr | `clinical.test.js` (explainer example) |
| 1 | Lesson and comparison: Kidney function (CrCl) | Lessons → PK fundamentals | `clinical.test.js` |
| 1 | v5 links; a versionless link reads as v1 | Any clinical scenario → Copy link | `clinical.test.js`, `pk-engine.test.js` |
| 2 | Saturable elimination: RK4 with exact dose events, Css, t90, level-dependent t½, no steady state above Vmax | Drug Parameters → Saturable, or load phenytoin | `nonlinear.test.js` (limits, Css, mass balance, speed) |
| 2 | Sheiner–Tozer albumin tool | Load phenytoin | `nonlinear.test.js` |
| 2 | Lesson, comparison, practice topic (4 kinds) | Lessons → Saturable elimination; Practice → Saturable | `nonlinear.test.js`, `pk-engine.test.js` |
| 3 | Cases tab, 8 cases: model grading, rule-based hints, practical-strength rounding, walkthroughs, links, print | Cases tab; `#case=gent&d=100&t=8` | `cases.test.js` |
| 4 | Independent reference (SciPy) and live validation page; `windowStats` made exact at jumps (found by the validation) | https://saifmaati.github.io/dose-curve/validation.html | `validation.test.js` |
| 5 | CI, README, LICENSE, CITATION.cff, .zenodo.json, issue templates, opt-in analytics, NEEDS-SAIF | GitHub repository | `release.test.js` |
| 6 | Population mode: virtual patients, 5–95% band, PTA (window and AUC24), in a Web Worker | ◍ POPULATION above the chart | `population.test.js` |
| 7 | Present mode, system theme, switchable shortcuts, keyboard dose timeline, chart text alternative, reduced motion, week-by-week guide | ▣ Present; ⌨ Keys; `docs/teaching-guide.md` | `a11y.test.js` |
| 8 | Version 1.0.0, changelog, share card (23 lessons), merge, live check | Footer "Version 1.0.0" | all |

## 3. Deferred or dropped

| Item | Reason | Estimated effort |
| --- | --- | --- |
| Tag `v1.0.0` and GitHub Release | No push credentials or authenticated `gh` here. Steps are in `NEEDS-SAIF.md` | 5 minutes for Saif |
| Zenodo DOI | Needs Saif's Zenodo account | 10 minutes |
| Analytics site ID | Needs a GoatCounter account; the code path is ready and off | 5 minutes |
| NAPLEX competency mapping | The current statements couldn't be fetched and verified | 1 hour once the document is available |
| Published worked examples in the validation | None could be checked against an accessible source | 2 hours with a library textbook |
| Two-compartment IV model (stretch) | Not started before the ship step; to follow as 1.1 | 2–3 hours |
| Saturable population mode | Disabled with a note: 1,000 RK4 runs per change would break the responsiveness budget | 2 hours, in the worker with a coarser grid |
| Branch history on GitHub | Commits reached GitHub as one upload per folder per phase; the fine-grained history is in the local repository | — |

## 4. Metrics, before and after

| Measure | Before (Phase 0, commit 18037f5) | After (v1.0) |
| --- | --- | --- |
| Tests | 179 in 2 files | 246 in 9 files |
| Initial JS (inline script + engine) | 318,996 bytes | 392,768 bytes (+23.1%; budget +25%, tested) |
| Loaded on demand | — | `cases.js` 38,230 B, `pk-glossary.js` 9,949 B, `pop-worker.js` 4,445 B |
| Inline CSS | 59,903 bytes | 71,622 bytes |
| Lighthouse mobile (perf · a11y · best practices · SEO) | 75 · 100 · 100 · 100 (live) | 76 · 100 · 100 · 100 (local build) |
| Lighthouse desktop | 92 · 100 · 100 · 100, CLS 0.144 (live) | 96 · 100 · 100 · 100, CLS 0.034 (local build) |
| Validation page accessibility (Lighthouse) | — | 100 |
| axe-core 4.10.2 violations (app states checked, both themes) | 0 | 0 |
| Library values with a cited source | 0 of 6 drugs sourced | 54 cited values (15 sources), 27 flagged unverified, across 9 drugs |
| Lessons · comparisons · practice kinds · glossary terms · cases | 21 · 15 · 26 · 30 · 0 | 23 · 17 · 30 · 42 · 8 |
| Independent validation | — | 94 scenarios, 376 comparisons, largest difference 0.025% |

## 5. How to verify each headline claim

| Claim | URL or command |
| --- | --- |
| The engine agrees with an independent solver within 0.5% (0.025% worst) | https://saifmaati.github.io/dose-curve/validation.html, or `node --test tests/validation.test.js` |
| The reference is independent and rerunnable | `python3 -m pip install numpy scipy && python3 validation/reference.py` |
| Every test passes on every push | The Tests badge in the README; https://github.com/Saifmaati/dose-curve/actions |
| Cockcroft–Gault: 72.9 and 62.0 mL/min; Devine IBW: 73.0 and 57.0 kg | `node --test tests/clinical.test.js`; Simulator → Patient → Clinical |
| Phenytoin 300 → 400 mg/day moves Css 5.2 → 12.1 mg/L | Lessons → Saturable elimination; `tests/nonlinear.test.js` |
| Each case's reference passes and wrong regimens get the right hint | `node --test tests/cases.test.js`; Cases tab |
| Every library value names its source or says it is unverified | Drug Library → a drug → "Where these values come from"; `tests/clinical.test.js` |
| PTA is reproducible and rises with dose | `node --test tests/population.test.js`; ◍ POPULATION |
| Accessibility | Lighthouse in Chrome DevTools; `tests/a11y.test.js` |

## 6. Known limitations of the model

- **One compartment.** Distribution phases aren't modelled. Vancomycin and digoxin behave as two-compartment drugs, and their cases say so.
- **Direct effect only.** The Emax effect follows plasma concentration instantly: no effect-site delay, tolerance or indirect response.
- **No active metabolites, and no protein-binding dynamics.** fu is informational, and the Sheiner–Tozer tool reads a measured level only.
- **Renal adjustment by one formula.** Cockcroft–Gault with a reference CrCl of 120 mL/min scales only the renal fraction of clearance; volume scales with actual weight.
- **Teaching-level variability.** The population mode's CVs (30% on CL, 20% on V) are teaching assumptions, independent log-normals with no covariates.
- **Saturable elimination.** Vmax and Km for phenytoin are typical textbook values (unverified); there's no saturable population mode.
- **Not clinical software.** The validation checks the numerics of the model, not its fit to patients. Educational model, not for clinical dosing.

## 7. Needs Saif

From `docs/NEEDS-SAIF.md`:

1. Create the GitHub Release and the `v1.0.0` tag on `main` (web UI steps listed).
2. Connect the repository to Zenodo and publish the release to mint a DOI; add it to the README and `CITATION.cff`.
3. Optionally, sign up for GoatCounter and set `ANALYTICS_SITE_ID` in `index.html`.
4. Confirm the MIT license.
5. Optionally, confirm the values marked unverified against Winter or Bauer and add the references.
6. After merging, check that the Tests badge is green, and delete the `v1.0` branch.

## 8. Suggested next milestones, ranked

1. **Mint the DOI and publish the release.** Every claim then has a permanent, citable home.
2. **Pharmacist review of the cases.** Send the eight cases to the reviewers and add one case each suggests.
3. **Two-compartment IV model** (the stretch goal) for vancomycin and digoxin, with the one-compartment comparison in their cases.
4. **Confirm the unverified values** from a current edition of Winter or Bauer, and cite them.
5. **Saturable population mode** in the worker, with a coarser grid.
6. **Instructor exports:** a CSV of a class's worksheet answers, and case hand-outs with blanks.
7. **Usage evidence:** turn on the cookie-free counter and report real usage alongside the validation.
