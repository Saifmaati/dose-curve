# Changelog

What changed in DoseCurve, newest first. Every release keeps older share links working and the default scenario's numbers unchanged: Cmax 9.3 mg/L, AUC 74.2 mg·h/L, 48% of the window in range.

## Unreleased: v1.0 (in progress on the `v1.0` branch)

- **Population mode** (◍ POPULATION above the chart):
  - It simulates 50–1,000 virtual patients around the scenario, with log-normal variability on clearance (CV 30%) and volume (20%). Both CVs are adjustable and labelled as teaching assumptions.
  - A seed makes the patients reproducible, including in links.
  - The chart shades the 5th–95th percentile band and dots the median, beside the deterministic curve.
  - The readouts give the probability of target attainment at steady state (trough at or above MEC and peak at or below MTC) and, optionally, the share with AUC24 in a range.
  - It runs in a Web Worker (1,000 patients in about 0.3 s), works in Compare, and leaves saturable scenarios alone, with a note.
  - Two glossary terms (42).
- **Release infrastructure:**
  - A GitHub Actions workflow runs the whole suite on every push and pull request, with a badge in the README.
  - The README is rewritten, with screenshots.
  - New files: `LICENSE` (MIT), `CITATION.cff`, `.zenodo.json`, and issue templates (bug report, feedback, "I'm an educator and want…"), with a feedback link in the footer.
  - Visit counting (GoatCounter, cookie-free) sits behind `ANALYTICS_SITE_ID`. It is off by default, sends only the page's path, and the privacy note says exactly what it counts.
  - `docs/NEEDS-SAIF.md` lists what needs the owner's accounts.
- **Validation** (`validation.html`, linked in the footer). An independent solver (`validation/reference.py`, SciPy's `solve_ivp`) runs a matrix of 94 scenarios:
  - routes × regimens × drugs (first-order, salt, saturable) × patients
  - the peak, trough, AUC and time in window of each, compared with DoseCurve's engine live in the browser, and in the test suite

  All 376 comparisons agree within 0.5% (first-order) or 1% (saturable); the largest difference is 0.025%.

  Analytic identities are tested too. The validation found that the window statistics sampled IV-bolus jumps and window crossings coarsely (up to 0.8% in AUC and 1 point in time in window). They now land exactly, and the *Short vs long infusion* lesson says 0.9 h above the MTC, where it said 0.8 h.
- **Clinical cases** (a new Cases tab), eight of them: gentamicin conventional and once daily (the Hartford approach), vancomycin to an AUC target, phenytoin with low albumin, digoxin in an older adult, theophylline in a smoker, lithium with lower kidney function, and a late-dose question.
  - The model grades a proposed regimen at steady state and gives rule-based hints.
  - It re-grades the regimen rounded to the forms available.
  - A walkthrough uses the patient's own numbers.
  - Every case has a link and prints.
  - The cases load only when the tab opens, and nothing numeric is stored that the model could compute.
- **Saturable (Michaelis–Menten) elimination.** Any scenario can switch from first-order to saturable elimination. The curve is integrated numerically:
  - RK4 in 0.05 h steps, with every dose landing at its exact time.
  - Every chart, readout, comparison, export and link works as before.
  - The readouts show the predicted steady state, Css = Km·R / (Vmax − R), the input as a share of Vmax, the half-life at the current level, and the dose-dependent time to 90% of steady state. They say "No steady state: input rate exceeds Vmax" when that happens.
  - Phenytoin now uses saturable elimination (Vmax 7 mg/kg/day, Km 4 mg/L, marked unverified).
  - A Sheiner–Tozer tool adjusts a measured phenytoin level for low albumin.
  - New: a lesson (*Saturable elimination*), a comparison, four glossary terms, and a practice topic with four kinds (30 in all).
- **Clinical patient mode.** Age, sex, height, weight, serum creatinine and albumin. The panel shows the working, with the numbers substituted, for:
  - ideal body weight (Devine) and adjusted body weight
  - Cockcroft–Gault creatinine clearance, with the weight used selectable
  - the drug's clearance, CL = CL_ref × [(1 − fe) + fe × CrCl / 120]

  Simple mode and every older link are unchanged.
- **Drug library with sources.** Nine profiles. Digoxin, phenytoin and lithium carbonate are new, and each profile has a renal fraction, protein binding, salt factor, units and forms. Every value is tied to its FDA label on DailyMed or a paper, or marked "typical textbook value, unverified". Some profiles now follow their labels:
  - amoxicillin: t½ 1.0 h
  - vancomycin: 1 g every 12 h, t½ 4.8 h, V 0.4 L/kg
  - theophylline: V 0.45 L/kg, 450 mg every 12 h
  - caffeine: V 0.6 L/kg
- **Units end to end.** Digoxin in mcg and ng/mL, lithium in mEq/L, with the salt factor applied to every dose. Readouts, axes, tables, explanations and CSV columns follow the drug. A scenario in other units is converted when two are compared.
- **New lesson and comparison, *Kidney function (CrCl)*** (22 lessons, 16 comparisons), and six glossary terms (36).
- **What changed** explains changes in creatinine clearance, the renal fraction, the salt factor and units.
- **Links, version 5.** Links carry the clinical patient, units and the wider ranges (volume to 600 L, half-life to 72 h, weight to 200 kg, window to 14 days). Other links are written exactly as before, and a scenario link without a version is read as version 1.
- **Fixes:**
  - No layout shift on first load (desktop CLS 0.144 → 0.01).
  - The inspector's ⟨ dose ⟩ buttons now carry their visible text in their accessible names.
  - Safari's `-webkit-` blur prefix, and a fallback for `100dvh`.

## 2026-09-30

- **New lesson, *Dosing by weight*** (21 lessons in all), and a matching one-click comparison (15 in all). The same 500 mg gives a 100 kg adult half the peak and half the AUC of a 50 kg adult at the same half-life; 10 mg/kg each makes the curves identical.
- **Keyboard shortcuts** dialog (⌨ Keys under the chart, and in the footer), listing the chart, slider, tab and dialog keys.
- **Print a handout** (⎙ Print, or the browser's own print): the scenario's settings and a link back, the charts, the readouts, time in the window, the steady-state panel and any comparison, in the light palette, without the controls.
- **Light theme** for projectors, bright rooms and white course pages. It's in the header (and the embed bar), remembered in the browser, and can be set by `?theme=light`. Embed code keeps the theme in use, and exported PNGs follow it. The dark theme is unchanged: every element's computed colours were checked against the previous release.
- **Five more practice kinds** (26 in all), each checked against the simulation:
  - time for an IV bolus to fall to a level
  - half-life from clearance and volume
  - the longest interval whose steady-state swing fits a window, τ = ln(upper / lower) / kₑ
  - clearance from a steady-state infusion, CL = R₀ / Css
  - how long an effect stays above a target after a bolus
- **Embed in a course page:** **Embed code** copies an iframe snippet for the current scenario. The `?embed` view drops the landing section and footer, keeps the educational-use note, puts the chart first in a narrow column and links out to the full page. Shared links never carry `?embed`.
- **Teaching guide** (`docs/teaching-guide.md`), linked from the footer and the README.
- **Progress:** lesson cards show "✓ Predicted" and "✓ Challenge met"; Practice keeps all-time first-answer results by topic and counts fitted data sets and met window tasks. Kept in the browser only, with a two-step reset.
- **Two new lessons** (20 in all): *Double the dose* (linearity: twice the dose doubles every concentration and the AUC, while the half-life and the timing stay put) and *Flip-flop kinetics* (when absorption is slower than elimination, the tail of an oral curve falls at absorption's pace). Lessons now also reset the chart's scale, since the flip-flop lesson opens on the log scale.
- **Glossary:** 30 terms under the lessons, each with its symbol, unit, the relation DoseCurve uses and a link to its lesson, with a search box.
- **Hit the window:** regimen design. Choose a dose and an interval that keep a made-up drug's steady-state peak and trough inside a window, with a live verdict, a textbook route to an answer, and a link to share the task.

## 2026-09-29

- **Works offline** after one visit. A service worker keeps a copy of the app. Online, the page still comes from the network first, so updates show at once.
- **Worksheets:** 5, 10 or 15 problems from one topic or all. Work them on screen with an answers toggle, or print them black on white with a worked answer key on its own page. Each sheet has a link that rebuilds it.
- **Show the math:** select any readout to see its formula worked through with the scenario's own numbers, updating as the sliders move.
- **Share one problem or data set:** a practice problem or a fit-the-data set has its own link, which rebuilds exactly the same numbers for everyone who opens it.
- **Fit the data:** measured concentrations after an IV bolus or an oral dose. Move the half-life and volume until the curve runs through them, with a live fit error and a by-hand estimation method. The two sliders are also in the fit bar, so on a phone the chart stays in view while they move.
- **Practice 2.0:** 21 kinds of generated problems in four topics (single dose, repeated dosing, infusions, concentration–effect). Each has a worked solution and a "Visualize on curve" view that lands on the moment the question asks about. The tests work every answer out again from a simulation.
- **Predict-first lessons:** each of the 18 lessons sets a goal, asks for a prediction before explaining, and ends with a challenge the app checks live. The tests check every prediction and challenge against the model.
- **Hardening:**
  - Keyboard focus now lands sensibly after every action.
  - The PNG export uses the app's fonts.
  - The effect-target labels stay readable.
  - The page loads the engine under its content hash, so a cached older engine never runs against a newer page.
  - A value from a link that falls between a slider's steps now sits exactly on its slider.

## 2026-09-28

- **Concentration–effect (PK/PD) charts:** a sigmoid Emax model, with the effect over time, the concentration–effect curve and time at or above a target effect.
- **Per-dose routes and IV infusions** in custom schedules: oral, IV bolus and infusion doses mixed freely, each infusion with its own duration.
- **Drag doses** along the timeline to reschedule them, with Undo.
- **Exact steady state** by geometric series. A note appears when infusions overlap.
- **Public presence:** icons, a share card, a 404 page, a "Try the PK/PD Lab" entry point and a privacy note.
- **Engine:** every dose response is built from a sum of exponentials.

## 2026-09-27

- **The PK engine** with shareable scenario links and an A/B comparison view: lock everything but one setting, or start from one-click comparisons.
- **Custom regimen timeline:** each dose with its own time, amount and route, marked given or missed.
- **Time cursor, inspector and playback** to read any moment of the curve.
- **Local scenario library:** save, rename, duplicate, export and import.
- **An audit:** its fixes, regression tests and a written report (`docs/audit-2026-09-27.md`).
