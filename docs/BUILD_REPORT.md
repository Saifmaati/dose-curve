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
| Two-compartment model (stretch) | Done after the ship step, as 1.1.0: see section 9 | — |
| Saturable population mode | Done after 1.1.0 (decision 61): the steady state is solved directly, and 1,000 patients take about 1 s | — |
| Branch history on GitHub | Commits reached GitHub as one upload per folder per phase; the fine-grained history is in the local repository | — |

## 4. Metrics, before and after

| Measure | Before (Phase 0, commit 18037f5) | After (v1.0) |
| --- | --- | --- |
| Tests | 179 in 2 files | 246 in 9 files |
| Initial JS (inline script + engine) | 318,996 bytes | 392,768 bytes (+23.1%; budget +25%, tested) |
| Loaded on demand | — | `cases.js` 38,230 B, `pk-glossary.js` 9,949 B, `pop-worker.js` 4,445 B |
| Inline CSS | 59,903 bytes | 71,622 bytes |
| Lighthouse mobile (perf · a11y · best practices · SEO) | 75 · 100 · 100 · 100 (live) | 85 · 100 · 100 · 100 (live), CLS 0 |
| Lighthouse desktop | 92 · 100 · 100 · 100, CLS 0.144 (live) | 98 · 100 · 100 · 100 (live), CLS 0.006 |
| Validation page accessibility (Lighthouse) | — | 100 |
| axe-core 4.10.2 violations (app states checked, both themes) | 0 | 0 |
| Library values with a cited source | 0 of 6 drugs sourced | 54 cited values (15 sources), 27 flagged unverified, across 9 drugs |
| Lessons · comparisons · practice kinds · glossary terms · cases | 21 · 15 · 26 · 30 · 0 | 23 · 17 · 30 · 42 · 8 |
| Independent validation | — | 94 scenarios, 376 comparisons, largest difference 0.025% |

### The live check after merging

- Pull request #1 merged `v1.0` into `main` as commit a75f28c, after CI passed on the branch and on the pull request.
- A fresh clone of the branch passed all 246 tests.
- After the Pages deploy, all 20 site files were byte-identical to the local ones.
- Checked on the live site:
  - Simulator defaults unchanged (Cmax 9.3 mg/L, AUC 74.2 mg·h/L, 48% in the window).
  - Lessons (23, with the 42-term glossary loading with the tab) and the Kidney function lesson.
  - Compare, and Practice (30 kinds).
  - The Cases tab (8 cases).
  - Population mode with a band.
  - The validation page: 376 of 376 comparisons within tolerance, run in the browser.
  - The offline cache (dosecurve-v9) holds the page, cases, worker, glossary and validation files, with the service worker in control.

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

- **One or two compartments.** Since 1.1.0 a second (peripheral) compartment can be switched on, with teaching-assumption exchange rates. There are no three-compartment models, and saturable elimination stays one-compartment.
- **Direct effect, or an effect-site delay.** The Emax effect follows plasma, or since 1.7.0 an effect compartment (ke0) for first-order drugs. There is no tolerance or indirect response, and saturable drugs keep the direct link.
- **No active metabolites, and no protein-binding dynamics.** In the drug library fu is informational, and the Sheiner–Tozer tool reads a measured level only. Since 1.9.0 the optional liver model uses fu in hepatic clearance, but unbound levels aren't drawn and the volume doesn't depend on fu.
- **Renal adjustment by one formula.** Cockcroft–Gault with a reference CrCl of 120 mL/min scales only the renal fraction of clearance; volume scales with actual weight.
- **Teaching-level variability.** The population mode's CVs (30% on CL, 20% on V) are teaching assumptions, independent log-normals with no covariates.
- **Saturable elimination.** Vmax and Km for phenytoin are typical textbook values (unverified). Population variability is on Vmax and volume, with Km fixed.
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
3. **Two-compartment digoxin** (done for vancomycin in 1.1.0), once sourced distribution parameters can be read and cited.
4. **Confirm the unverified values** from a current edition of Winter or Bauer, and cite them.
5. **Saturable population mode** (done after 1.1.0).
6. **Instructor exports:** a CSV of a class's worksheet answers, and case hand-outs with blanks.
7. **Usage evidence:** turn on the cookie-free counter and report real usage alongside the validation.

## 9. After the ship step: 1.1.0, the stretch goal

The plan's stretch was a two-compartment IV model with vancomycin as the example. It had tests against the closed form, and a note in the vancomycin case comparing it with the one-compartment approximation. All of it shipped as 1.1.0 on the `two-compartment` branch.

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Two compartments for every route and regimen: C(t) = A·e^(−αt) + B·e^(−βt) for a bolus, with V1, k10, k12 and k21 | Drug Parameters → Two compartments | `twocmt.test.js`: the closed form, and an independent RK4 integration of the compartments to 1 part in a million |
| AUC = F·D / CL and Vss = V1·(1 + k12/k21) whatever the distribution; fast exchange tends to one compartment | Readouts; What changed | `twocmt.test.js` |
| Lesson *One or two compartments* (vancomycin, every number tested), comparison, 2 glossary terms | Lessons → PK fundamentals | `twocmt.test.js` |
| Vancomycin case: the same regimen under both models (peak differs, AUC24 doesn't) | Cases → Vancomycin → Walkthrough | `twocmt.test.js` |
| Validation: two-compartment drug added to the SciPy reference (126 scenarios); window statistics made exact | validation.html | `validation.test.js` (every difference under 0.001%) |
| Fix: the last dose's peak (up to 1.2% low for short infusions) | "Peak (last dose)" readouts | `twocmt.test.js`, `pk-engine.test.js` |

The number of tests rose from 246 to 257, in 10 files.

## 10. 1.2.0

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Population mode for saturable drugs: variability on Vmax and volume, PTA from each patient's exact periodic steady state, and the share with no steady state | Load phenytoin, Repeated, ◍ POPULATION | `population.test.js` (4 saturable tests) |
| The saturable steady state solved directly (secant on the one-interval map): about 100× faster; the old search stopped up to 0.12% short near Vmax | Saturable readouts and steady-state panel | `nonlinear.test.js` (periodic to 1e-9) |
| Faster first paint: non-blocking fonts, deferred engine, app as a module script. Lighthouse mobile 85 → 98–99 (gzip preview), LCP 3.4 → 1.8–1.9 s, CLS 0 | Any page load on a phone | `pk-engine.test.js` (script order) |
| Case 9, *Vancomycin: the AUC from two levels*: the first-order two-level method, and why the peak waits for distribution | Cases tab | `cases.test.js` |

There are now 263 tests in 10 files.

Live check after merging (pull request #3, merge 2d50c74):
- CI was green on the branch head and the pull request, and a fresh clone of the branch passed 263/263.
- The deployed files are byte-identical to the repository's.
- In the browser: defaults unchanged, Version 1.2.0, offline cache dosecurve-v11, and phenytoin's population (200 virtual patients) in about 1.4 s.
- Live Lighthouse: mobile 97–100 in performance (85 before), desktop 100, and 100 for accessibility, best practices and SEO on both.

## 11. 1.3.0

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Fit the data, two compartments: data that can be stripped by hand, and the method of residuals worked with the data's own numbers (by-hand values alone fit 97% of sets) | Simulator → Fit the data → Two compartments | `pk-engine.test.js` (fit tests over 120 seeds) |
| Practice: AUC from two levels, and two-compartment clearance (32 kinds) | Practice → Infusions; Single dose | `pk-engine.test.js` (every answer against the model) |
| Worksheet links keep their problems when new kinds arrive (a pool version in the link) | Practice → Worksheet → Copy link | `pk-engine.test.js` (five 1.2.0 sheets rebuilt exactly) |
| The practice problems load with the Practice tab (`pk-practice.js`); initial script +25.2% → +14.1% | Practice tab | `release.test.js` (stamps, id list, budget) |
| Validation page: no jump when results arrive; Lighthouse mobile 95 → 100 | validation.html | — |

There are now 265 tests in 10 files.

Live check after merging (pull request #4, merge e178f31): the deployed files are byte-identical. In the browser: defaults unchanged, Version 1.3.0, the Practice tab loads its module only when opened, `pk-practice.js` is in the offline cache (dosecurve-v12), and the two-compartment fit link opens. Live Lighthouse: app mobile 97, validation page 96.

## 12. 1.4.0

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Accuracy: the dose table's and steady-state peaks were refined (they were up to 3.7% low for sharp oral peaks); a bolus at the window's end now stays outside the window. Both were found by a random-scenario cross-check against dense scans | Dose table; readouts | `validation.test.js` (two regression tests) |
| Validation page: checks run a dozen at a time with progress (longest task 295 → 57 ms) | validation.html | — |
| Case 10, *Gentamicin after burns: individualizing from two levels* (Sawchuk–Zaske), citing Zaske et al. 1976 and Sawchuk and Zaske 1976 | Cases tab | `cases.test.js` (k and V recovered within 2%) |
| Glossary: method of residuals, AUC from two levels, Sawchuk–Zaske method (47 terms), each formula tested | Lessons → Glossary | `twocmt.test.js` |

There are now 269 tests in 10 files.

Live check after merging (pull request #5, merge 36e3abf): the deployed files are byte-identical. In the browser: Version 1.4.0, offline cache dosecurve-v13, the tenth case grades 220 mg every 6 h on target, and the validation page shows 504 of 504.

## 13. 1.4.1

A patch. The IV-bolus dose table was off by one dose (since 1.0): each row's peak included the bolus that starts the next interval. The fix reads each interval as [start, end). A standing cross-check now runs in the test suite (40 seeded random scenarios against dense scans of the engine's own curve) and passed 800 more before release. There are 270 tests in 10 files.

Live check after merging (pull request #6, merge fadf6bd): the deployed files are byte-identical, and the live engine gives the corrected dose table (12.50, 15.63, 16.41, 16.60 mg/L for 500 mg every 12 h), Version 1.4.1 and cache dosecurve-v14.

## 14. 1.5.0

- With two compartments, the half-life readout is labelled "t½ terminal".
- The standing cross-check also covers 24 random custom schedules (mixed routes, missed doses, one or two compartments, saturable).
- The README shows the two-compartment lesson.

There are 271 tests in 10 files.

Live check after merging (pull request #7, merge d4d0290): the deployed files are byte-identical, and the live site shows Version 1.5.0, cache dosecurve-v15, and "t½ terminal" with two compartments.

## 15. 1.6.0

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Effect statistics exact (time above a target effect, onset): bolus jumps and bisection crossings. They were up to 0.12 h off, found by the cross-check | Effect readouts | `validation.test.js` (closed form, and the random cross-check) |
| Two-compartment t90 working: the exact constant-infusion figure (17.0 h against 18.3 h for vancomycin) | Readout → working | `twocmt.test.js` |
| Text alternatives for the per-dose chart and the effect chart; a keyboard-reachable comparison table; axe clean on every tab in both themes | Screen readers; Compare | `a11y.test.js` |
| Levetiracetam and meropenem from their DailyMed labels (11 drugs; 69 cited values, 20 sources) | Drug Library | `clinical.test.js` |
| Lesson 25, *Time above the MIC* (meropenem, 30-minute vs 3-hour infusion), a comparison and a glossary term | Lessons; Compare | `clinical.test.js` |
| Case 11, *Meropenem with reduced kidney function*: the label's renal table (a new target kind), and what the model says it does to exposure and time above the MIC | Cases tab | `cases.test.js` |
| Case 12, *Levetiracetam with reduced kidney function*: a renal table by creatinine clearance per 1.73 m², with a dose chosen in the label's range by matching exposure | Cases tab | `cases.test.js` |
| Practice: renal dose adjustment (33 kinds); worksheet pool version 3, with version-2 links tested unchanged | Practice → Repeated dosing | `pk-engine.test.js` |

There are 277 tests in 10 files.

## 16. 1.7.0

| Feature | Where to see it | Tests |
| --- | --- | --- |
| An effect-site delay (equilibration half-life t½eq = ln 2 / ke0): closed forms for every route, one or two compartments and custom schedules; the effect statistics follow the effect site | Effect → Effect-site delay slider | `effect-site.test.js` (an independent RK4 integration, the bolus closed form, conserved AUC) |
| The effect-site level drawn dashed under the plasma curve; the hysteresis loop on the concentration–effect chart, with its direction; the cursor, inspector, What changed, print header and CSV follow the effect site | Simulator and Compare with Effect on | `effect-site.test.js`, `a11y.test.js` |
| Lesson 26, *Effect delay (hysteresis)*, a comparison (20) and two glossary terms (50) | Lessons; Compare | `effect-site.test.js` |
| Links v6 carry the delay; every older link reads as before | Copy link | `effect-site.test.js` |
| The independent solver adds 20 effect-site scenarios (146 in all, 584 comparisons); the 126 earlier rows are unchanged. Largest effect-site difference 0.000004% | validation page | `validation.test.js` |
| The standing cross-check covers effect-site peaks, onset and time above a target | — | `validation.test.js` |

There are 283 tests in 11 files. The initial script is +19.6% over the Phase 0 baseline (limit +25%).

## 17. 1.8.0

1.6.0 and 1.7.0 were deployed and checked live: PR #8 (merge 0845417) and PR #9 (merge b1ae2f3). Every changed file was byte-identical on Pages, and the live validation page reported 584 of 584 comparisons within tolerance.

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Practice: effect delay, time of peak effect (34 kinds); worksheet pool version 4, with version-3 links pinned | Practice → Concentration–effect | `pk-engine.test.js` (every kind against the model; the v3 snapshot) |
| Vary only: the effect-site delay | Compare | `effect-site.test.js` |
| Service worker: install bypasses the HTTP cache; validation results named by content hash | Offline use; validation page | `sw.test.js`, `validation.test.js` |

There are 285 tests in 11 files. Lighthouse (gzip preview): 100 in every category on mobile and desktop.

## 18. 1.9.0

1.8.0 was deployed and checked live (PR #10, merge b31ff5e): every changed file byte-identical, the new practice problem live, and the version-18 cache holding the hash-named validation results.

| Feature | Where to see it | Tests |
| --- | --- | --- |
| A liver model (well-stirred): Q, fu and CLint give E, hepatic clearance Q·E and oral F = fabs·(1 − E); the half-life and F follow; links v7 | Drug parameters → Clearance from: Liver model | `liver.test.js` (identities, oral AUC = fabs·D / (fu·CLint) for any Q, defaults unchanged, links) |
| Three lessons (27–29): hepatic extraction, first pass and induction, liver blood flow; three comparisons (23); five glossary terms (55) | Lessons → Liver and first pass | `liver.test.js` (every number each lesson states) |
| Practice topic *Liver and first pass* (37 kinds); worksheet pool version 5, with version-4 links pinned | Practice | `liver.test.js`, `pk-engine.test.js` |
| Worked readouts for clearance, half-life and AUC with the liver model; What changed explains it; Vary only holds CLint, Q or fu apart | Readouts; Compare | `liver.test.js` |
| Lesson 26 uses the default window, and the README shows it | README | `release.test.js` |

There are 294 tests in 12 files. The initial script is +23.7% over the Phase 0 baseline (limit +25%): the next release should move the lesson texts into a lazy module before adding more to the engine.

## 19. 1.10.0

1.9.0 was deployed and checked live (PR #11, merge da05093). Plan V2 (Phase A) started here; push access with `gh` works.

| Item | Where to see it | Tests |
| --- | --- | --- |
| Lesson texts, predictions and challenges in lazily loaded `pk-lessons.js`; initial script 394.6 → 351.0 kB (+23.7% → +10.0% of the baseline) | Lessons tab; any lesson link | `release.test.js` (stamps, precache, every lesson's six texts, none left in the engine, budget) and every lesson test |
| Tags v1.0.0–v1.9.0 on the recorded merge commits | GitHub → Tags | — |
| GitHub Releases and merged-branch deletion | NEEDS-SAIF §1 and §6 | blocked by the auto-mode safety check |
| Zenodo: repository 1343327284, no DOI until a Release exists | NEEDS-SAIF §2 | — |

There are 294 tests in 12 files.

## 20. 1.11.0 (Plan V2, Phase B)

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Bayesian (MAP) individualization in `pk-bayes.js` (lazily loaded, stamped): log-normal prior from the patient model, combined error, grid + Nelder–Mead, Laplace 95% intervals, uncertainty left | Simulator → Clinical → Individualize from levels | `bayes.test.js` (wide-prior recovery within 0.1%, no levels = prior, between prior and levels, grid vs optimizer within 0.5%, SD falls with levels) |
| SciPy MAP reference, 20 scenarios, on the validation page | validation.html | `bayes.test.js` (within 0.5%, regression guard 1e-5) |
| Two-level estimate beside it; dose to an AUC24 or trough target; the estimate on the chart; applying it keeps the levels' regimen as the baseline | the panel | `bayes.test.js` |
| Measured levels in scenarios and v8 links | Copy link | `bayes.test.js`, `clinical.test.js` |
| Cases 13–14: vancomycin (two levels an hour apart) and gentamicin (the second level higher) | Cases tab | `cases.test.js` |
| Lesson 30, *One level and a prior*; glossary 58 | Lessons → Levels and individualization | `bayes.test.js` (every number the text states) |
| The page's scripts parse | — | `release.test.js` |

There are 308 tests in 13 files. The initial script is +14.7% over the Phase 0 baseline (limit +25%).

## 21. 1.12.0 (Plan V2, Phase C)

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Write a case: checked spec, the author's values flagged, solvability over the regimen grid, community case in a compressed versioned link, marked unreviewed | Cases → For instructors → Write a case | `instructor.test.js` (every field round-trips, compressed and plain; the count matches grading every regimen; unsolvable refused; bad values named) |
| Built-in case links unchanged | any `#case=` link | `instructor.test.js` (all 14, with and without a regimen) |
| Assignments: bundle links, worksheets answered in the app, progress in the browser | Make an assignment; an assignment link | `instructor.test.js` (round trip, same worksheets, limits) |
| Completion codes and the verify panel | the end of an assignment; Verify a completion code | `instructor.test.js` (HMAC-SHA256 checked with Node's crypto; a changed score, identifier, key or code fails) |
| Teaching guide: run a class in ten minutes; privacy notes | docs/teaching-guide.md; footer | — |

There are 314 tests in 14 files. The initial script is +14.8% over the Phase 0 baseline (limit +25%); the instructor tools live in the lazily loaded cases.js.

## 22. 1.13.0 (Plan V2, Phase D)

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Antimicrobial indices (`PK.micStats`): fT>MIC on the unbound level, Cmax/MIC, AUC24/MIC; steady state for a regular regimen, the window otherwise | Simulator → Antimicrobial PK/PD; the MIC line and dotted unbound level on the chart; Compare rows | `pkpd.test.js` (IV-bolus closed form over 200 random regimens; continuous infusion exactly 100% and 0%; both infusion crossings in closed form; MIC and fu scaling; loading and missed doses; window reading) |
| SciPy reference: 12 regimens run to steady state | validation.html | `pkpd.test.js` (fT>MIC within 0.01 pp, ratios within 0.01%; observed ~1e-9) |
| Each antimicrobial's index from its source; a numeric target only where cited (vancomycin) | the panel's *Index and target* | `pkpd.test.js` |
| Piperacillin-tazobactam from its label (CL 208 vs 207 mL/min, AUC 241 vs 242) | Drug library | `pkpd.test.js`, `clinical.test.js` (every value sourced) |
| v9 links: fu, the MIC, doses to 4,000 mg; older links clamp as before | Copy link | `pkpd.test.js`, `pk-engine.test.js` |
| Lessons 30–31 (*Extended infusion*, *Once daily vs divided*), two comparisons | Lessons → Antimicrobial PK/PD | `pkpd.test.js` (every number the text, tip and comparison state; challenges hold their conditions) |
| Practice topic (fT>MIC, Cmax/MIC, AUC24/MIC), worksheet pools v6 | Practice → Antimicrobial PK/PD | `pk-engine.test.js` (every answer against the model), `pkpd.test.js` (v5 sheets unchanged) |
| Case 15: piperacillin-tazobactam with reduced kidney function | Cases tab | `cases.test.js` |
| Community cases: an fT>MIC target, solved by bisection | Write a case | `instructor.test.js` (count equals grading every regimen, four drugs) |
| Glossary 63 | Lessons → Glossary | `pk-engine.test.js` |

There are 327 tests in 15 files. The initial script is +19.6% over the Phase 0 baseline (limit +25%). axe: no violations on the simulator with the panel open.

## 23. 1.14.0 (Plan V2, Phase E)

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Indirect responses, types 1–4 (Dayneka, Garg and Jusko 1993), in lazily loaded `pk-idr.js` (RK4 on dose-aligned steps, Hermite interpolation) | Simulator → Effect → *How the effect is produced*; response chart in % of baseline; response-vs-level loop with the plateau curve; readouts; Compare; What changed; inspector; CSV | `idr.test.js` (no drug: exactly 100; constant level: analytic plateau and time constant 1/kout or 1/(kout·(1 ∓ D)) to 1e-7; directions and lag of all four types; limits) |
| SciPy reference: 12 indirect-response scenarios | validation.html (696 comparisons) | `idr.test.js` (0.01% at five times and the largest change, 0.01 h on its time; observed ~1e-8) |
| v10 links with idr, tout, imax, smax; Vary only holds the turnover | Copy link | `idr.test.js`, `pk-engine.test.js` |
| Lesson 27, *Indirect response* (warfarin-like, from the label), comparison 26 | Lessons → PK/PD concepts | `idr.test.js` (every number the text, tip and comparison state; the challenge's conditions) |
| Practice kind *Indirect response · steady state* (worksheet pools v7) | Practice → Concentration–effect | `pk-engine.test.js` (every answer against the simulated response) |
| Glossary 66 (indirect response, response turnover, baseline response; the effect compartment's 1979 origin) | Lessons → Glossary | `idr.test.js` |
| The drug library's sources and notes in lazily loaded `pk-sources.js` | Drug information; antimicrobial panel; cases | `release.test.js` (stamped and precached), `clinical.test.js` |

There are 335 tests in 16 files. The initial script is +18.2% over the Phase 0 baseline (limit +25%), down from +19.6% in 1.13.0. axe: no violations with the indirect-response charts open.

## 24. 1.15.0 (Plan V2, Phase F)

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Hemodialysis sessions in lazily loaded `pk-hd.js`: the dialysis clearance added while a session runs, solved exactly between events, with the area and the amount removed | Simulator → Patient → Hemodialysis; session bands on the chart; session table; readouts and worked formulas; What changed | `hd.test.js` (closed form before, during and after a session; mass balance for every route and schedule to 1e-9; removal = ∫CLd·C to 1e-8; no sessions in reach = no dialysis) |
| SciPy reference: 8 dialysis scenarios | validation.html (712 comparisons) | `hd.test.js` (0.01%; observed ~1e-12) |
| No steady state on dialysis: dose table off the curve, readouts switch | Steady-state panel; readouts | `hd.test.js` |
| v11 links with hd, hdcl, hdstart, hddur, hdevery | Copy link | `hd.test.js`, `pk-engine.test.js` |
| Case 16, *Gentamicin on hemodialysis* (label: 50% per 8-hour session, 1–1.7 mg/kg after each) | Cases tab | `hd.test.js`, `cases.test.js` |
| Lesson 10, *Hemodialysis sessions*, comparison 27 | Lessons → PK fundamentals | `hd.test.js` (every number the text, tip and comparison state) |
| Practice kind *fall over a session* (pools v8); glossary 68 | Practice → Single dose; Glossary | `pk-engine.test.js`, `hd.test.js` |

There are 345 tests in 17 files. The initial script is +21.2% over the Phase 0 baseline (limit +25%); Phase G's sensitivity analysis goes entirely into a lazily loaded file. axe: no violations with the dialysis panel open.

## 25. 1.16.0 (Plan V2, Phase G)

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Sensitivity analysis in lazily loaded `pk-sens.js`: ±20% on each input, one at a time; tornado chart of AUC24, peak, trough or time in window; a sentence naming the dominant input | Simulator → under the readouts → *Sensitivity* | `sens.test.js` (CL ±20% → AUC24 +25% / −16.7% for five kinds of scenario; dose in proportion; interval like CL; V leaves AUC24 alone and moves the IV peak by the closed form; every sign; the inputs per scenario; F capped; window reading; saturable more than proportional; the sentence and the chart) |
| Glossary 69 (sensitivity analysis) | Lessons → Glossary | `pk-engine.test.js` |

There are 350 tests in 18 files. The initial script is +21.7% over the Phase 0 baseline (limit +25%). axe: no violations with the sensitivity panel open.

## 26. 1.17.0 (Plan V2, Phase H)

| Feature | Where to see it | Tests |
| --- | --- | --- |
| Educator landing page, built from the engine: counts, run a class, every lesson's share link and every case's link | educators.html (footer: For educators) | `educators.test.js` (counts are the app's; each lesson link equals the app's own and opens the lesson; each case link opens its case; the version) |
| Named tab links (#practice, #lessons, #cases, #compare) | any page | `educators.test.js` |
| README screenshots: antimicrobial, indirect response, hemodialysis, sensitivity, validation | README | `release.test.js` (images exist) |
| Validation page: deferred scripts, checks yield between tasks, reserved space | validation.html | `release.test.js` (its scripts parse) |

Lighthouse, mobile, on the gzip preview: app 97–100 in every category (desktop 100), validation 97 (TBT 0–190 ms, CLS 0.026), educators 100. There are 354 tests in 19 files; the initial script is +21.7% over the baseline.

## 27. 1.17.1 (Plan V2, Phase I)

| Fix | Found by | Tests |
| --- | --- | --- |
| Population bands follow dialysis sessions (the worker loads the dialysis model) | engineer review | `hd.test.js` |
| The Bayesian estimate declines dialysis and says why | engineer review | `hd.test.js` |
| Session edges as grid points for peaks; the indirect-response integrator steps to them | the 1,000-seed cross-check | `hd.test.js`, cross-check (peak now within 3e-15) |
| Sensitivity off steady state reads the window AUC | the cross-check | `sens.test.js` |
| The rebound glossary entry drops an unsourced timing | pharmacist review | — |

The cross-check, its results and the plan's summary are in [BUILD_REPORT_V2.md](BUILD_REPORT_V2.md). There are 355 tests in 19 files; the initial script is +21.8% over the baseline.

## 28. 2.0.0 (redesign, stage 1 of 4: shell, tokens, type, stage, opening sequence)

| Feature | Where to see it | Checked by |
| --- | --- | --- |
| Tokens for a dark and a paper theme; IBM Plex Sans and Mono served from the site with metric-matched fallbacks | everywhere | contrast computed for every text token (docs/DESIGN.md §1); CLS 0 |
| Charts from the theme's tokens (no invert filter); PNG export and print in the right palette | the simulator, Light theme, Download PNG, Print | screenshots in both themes; print to PDF from dark |
| Controls: sliding segment thumb and tab indicator, slider fill and bubble, switches, readout tweening, two-line crosshair | the simulator | `a11y.test.js`; axe |
| The 3D stage (stage.js + Three.js 0.186.1 from cdnjs, import map with sha512); its CSS version | behind the app; Effects in the top bar | `stage.test.js` (pinned, hashed, never precached, loaded by hash) |
| The opening sequence: seven screens from the engine, the sphere of 584 checks run in the browser | the root address on a first visit | `stage.test.js` (numbers are the engine's; one heading and a 3–5 word caption per screen; disclaimer) |
| Top bar, pinned main-action pill, glass panels at a computed contrast floor | everywhere | axe in 13 states × 2 themes × 2 widths |
| Layout held on every link with a # part, the practice problem, the validation summary | `#practice`, `#compare`, a lesson link, `#case=gent`, validation.html | layout-shift trace: 0 on each |
| Validation, educator and 404 pages restyled | those pages | Lighthouse 100; axe |

Lighthouse on mobile, gzip preview: root 97, `#practice` 98, `#case=gent` 99, validation 100, educators 100 (desktop root 100); accessibility 100 and CLS 0 on each. axe: no violations. 359 tests in 20 files. The initial script is +23.1% over the Phase 0 baseline (limit +25%); the stylesheet is 83 KB (limit 250 KB); stage.js (31 KB) and Three.js load after the first paint.

The brief for this release changed twice while it was being built; DECISIONS 116–117 record how, and that the last brief's reference image wasn't on the machine.
