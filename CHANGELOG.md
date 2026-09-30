# Changelog

What changed in DoseCurve, newest first. Every release keeps older share links working and the default scenario's numbers unchanged: Cmax 9.3 mg/L, AUC 74.2 mg·h/L, 48% of the window in range.

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
