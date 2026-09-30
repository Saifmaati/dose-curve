# DoseCurve

**An interactive pharmacokinetics and PK/PD simulator for pharmacy education.** Change a drug, a patient or a regimen and watch concentration and effect respond; estimate creatinine clearance, see saturable kinetics, and work graded clinical cases. (Not related to the open-source "dosecurve" package for fitting IC50 dose–response curves.)

[![Tests](https://github.com/Saifmaati/dose-curve/actions/workflows/test.yml/badge.svg)](https://github.com/Saifmaati/dose-curve/actions/workflows/test.yml)

**Live:** https://saifmaati.github.io/dose-curve/ · **Validation:** https://saifmaati.github.io/dose-curve/validation.html · **Teaching guide:** [docs/teaching-guide.md](docs/teaching-guide.md)

> Educational model, not for clinical dosing. DoseCurve models idealized one- or two-compartment pharmacokinetics (first-order, or saturable in one compartment) and a direct Emax effect for learning and demonstration. Its validation checks that it solves its own model correctly, not that the model predicts real patients.

![A saturable-elimination lesson: phenytoin at 300 and 400 mg a day](docs/img/saturable-lesson.png)

## What it does

**Simulate**
- Oral, IV bolus and IV infusion dosing: single, repeated (with loading and missed doses), or a custom schedule where every dose has its own time, amount and route. Drag a dose along the timeline to reschedule it.
- **One or two compartments.** With two, the drug enters a central volume and exchanges with a peripheral one (k12, k21), so the curve falls in a fast distribution phase and a slower terminal phase, C(t) = A·e^(−αt) + B·e^(−βt). The readouts give α, β, the steady-state volume and the terminal half-life, and the vancomycin case compares its regimen under both models.
- First-order elimination, or saturable **Michaelis–Menten** elimination (Vmax, Km) integrated numerically. The readouts give the predicted steady state Km·R / (Vmax − R), the input as a share of Vmax, the level-dependent half-life and the time to 90% of steady state, and they say "No steady state: input rate exceeds Vmax" when that happens.
- A **clinical patient**: age, sex, height, weight and serum creatinine give ideal and adjusted body weight (Devine), Cockcroft–Gault creatinine clearance, and the drug's clearance CL = CL_ref × [(1 − fe) + fe × CrCl / 120], with every step shown with its numbers.
- A **drug library** of nine teaching profiles (gentamicin, vancomycin, digoxin, phenytoin, theophylline, lithium carbonate and three more). Every value names its source (the FDA label on DailyMed, or a paper) or is marked "typical textbook value, unverified". Units follow the drug: digoxin in mcg and ng/mL, lithium in mEq/L, with salt factors applied.
- The **effect** (PK/PD): a sigmoid Emax model, its concentration–effect curve, and time above a target effect.
- A **population**: 50–1,000 virtual patients with log-normal variability on clearance (or Vmax, for a saturable drug) and volume, drawn as a 5th–95th percentile band. With saturable elimination it also reports the share whose input exceeds their own Vmax, so they never reach a steady state. It reports the probability of target attainment at steady state (and for an AUC24 range), is computed in a Web Worker, and reproduces from its seed.

**Explain**
- Set a baseline, change anything, and **What changed** explains it with the model's numbers: "CrCl fell from 73 to 41 mL/min, so the clearance of a drug that is 90% renally excreted fell 38%; the half-life rose from 3.9 h to 6.2 h; the steady-state trough rose from 2.2 to 4.7 mg/L."
- Compare scenarios A and B side by side, with "Vary only" to change one thing at a time, and 18 one-click comparisons.
- Select any readout to see its formula worked through with the scenario's own numbers.

**Teach and practise**
- **24 guided lessons** that ask for a prediction first and end with a challenge the app checks live.
- **10 clinical cases** (gentamicin conventional, once daily and individualized from two levels, vancomycin to an AUC24 target and from two measured levels, phenytoin with low albumin, digoxin, theophylline in a smoker, lithium, a late-dose question). The model grades a proposed regimen at steady state, gives rule-based hints, re-grades it rounded to the forms available, and walks through the textbook route.
- **32 kinds of generated practice problems** in five topics with worked solutions, printable worksheets with answer keys, "Fit the data" (including a two-compartment curve to strip by the method of residuals) and "Hit the window" exercises, and a 47-term glossary.
- Links for everything (a scenario, a lesson, a problem, a worksheet, a case), embed code for course pages, a light theme for projectors, printable handouts, and offline use after one visit.

![A clinical case graded by the model](docs/img/case-gentamicin.png)

## Validation

An independent solver, [`validation/reference.py`](validation/reference.py), integrates the model's equations with SciPy's `solve_ivp`. It runs 126 scenarios:

- **Routes:** oral, IV bolus, IV infusion, and mixed routes.
- **Regimens:** single, repeated, loading, missed and custom.
- **Drugs:** first-order, first-order with a salt factor, saturable, and two-compartment.
- **Patients:** normal, and reduced creatinine clearance.

The test suite and the [validation page](https://saifmaati.github.io/dose-curve/validation.html) compare DoseCurve's peak, trough, AUC and time in window with it. All 504 comparisons agree within 0.5% for first-order scenarios and 1% for saturable ones. The largest difference is 0.00002% (two parts in ten million), and 0.000001 percentage points in time in window. Analytic identities are tested too:

- the accumulation ratio
- 3.32 half-lives to 90% of steady state
- AUC = F·S·D / CL
- the infusion plateau
- the Michaelis–Menten steady state and its time to 90%
- the Cockcroft–Gault and Devine hand values

![The validation page](docs/img/validation.png)

## Quick start

It's a static site with no build step and no dependencies. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

Tests (Node 20; nothing to install):

```bash
node --test tests/
```

Regenerate the reference results (optional):

```bash
python3 -m pip install numpy scipy
python3 validation/reference.py
```

When `pk-engine.js` or one of the files loaded on demand (`cases.js`, `pk-math.js`, `pk-glossary.js`, `pk-practice.js`, `pop-worker.js`) changes, update its `?v=` content-hash stamp where it's loaded: `index.html` and `validation.html` for the engine, `index.html` and `sw.js` for the others. The failing test prints the new value.

## How it's built

| File | Purpose |
| --- | --- |
| `index.html` | The app: UI, charts, lessons, practice |
| `pk-engine.js` | The model, with no DOM access, so it runs in the browser and in Node. It holds the PK equations (closed-form sums of exponentials; RK4 for saturable elimination), the clinical patient, units, the drug library with sources, lessons, practice problems and the share-link format |
| `cases.js` | The clinical cases and their grader, loaded when the Cases tab opens |
| `pk-math.js` | The worked formulas behind each readout, loaded the first time one is opened |
| `pk-glossary.js` | The glossary, loaded with the Lessons tab |
| `pk-practice.js` | The generated practice problems and worksheets, loaded with the Practice tab |
| `pop-worker.js` | Population mode, run as a Web Worker |
| `validation.html`, `validation/` | The public validation page, the independent reference solver and its results |
| `sw.js` | The service worker for offline use |
| `tests/` | The engine, clinical, saturable, two-compartment, cases, population, validation, accessibility, release and service-worker tests |
| `docs/` | The teaching guide, audits, the v1.0 build log, decisions and report |

Share links carry every setting in the URL itself and are written at the lowest format version that holds them (v1–v5). Older links open unchanged, and a scenario link without a version reads as v1. Nothing is sent to or stored on a server; saved scenarios and progress stay in your browser. Visit counting (GoatCounter, cookie-free) is off unless the site owner sets `ANALYTICS_SITE_ID`, and it never receives a link's settings. Don't enter patient-identifying information.

![Clinical mode: Cockcroft–Gault and a renally cleared drug](docs/img/clinical-crcl.png)

## How to cite

See [`CITATION.cff`](CITATION.cff) (GitHub's "Cite this repository" button uses it):

> Maati S. DoseCurve: an interactive pharmacokinetics and PK/PD simulator for pharmacy education. Version 1.4.0. 2026. https://github.com/Saifmaati/dose-curve

## Contributing

Issues and suggestions are welcome, and there are templates for a [bug report](https://github.com/Saifmaati/dose-curve/issues/new?template=bug_report.md), [feedback](https://github.com/Saifmaati/dose-curve/issues/new?template=feedback.md), and ["I'm an educator and want…"](https://github.com/Saifmaati/dose-curve/issues/new?template=educator.md).

For changes:
- Keep the site static (no build step, no runtime dependencies), keep every number the UI shows covered by a test, and run `node --test tests/` before sending.
- Cite drug values only from a source you've read (an FDA label on DailyMed or a paper), or mark them unverified.

See [CHANGELOG.md](CHANGELOG.md) for what changed in each release.

## License

[MIT](LICENSE) © 2026 Saif Maati
