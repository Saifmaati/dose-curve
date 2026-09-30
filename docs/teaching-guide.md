# Teaching with DoseCurve

DoseCurve is a free pharmacokinetics lab that runs in the browser: <https://saifmaati.github.io/dose-curve/>.

There is nothing to install and no sign-in. It works on laptops and phones, and after one visit it also opens offline. It models idealized linear pharmacokinetics in one or two compartments, saturable elimination, and a concentration–effect (Emax) relationship, direct or through an effect-site delay, for learning and demonstration only. It is not for dosing real patients.

This guide collects ways to use it in a course.

## In a lecture

For a projector, press **▣ Present** (top right): the chart takes the whole width, the controls fold away and the type grows. **Esc**, or the button in the corner, leaves it. For a bright room, the **light theme** (◐ Light) follows the computer's own light or dark setting until you pick one; the choice is remembered in that browser, and adding `?theme=light` to a link opens it in light.

With the keyboard, **Space** plays or pauses, **←/→** move the time cursor, **L** switches to a log scale and **B** sets a baseline, as long as you're not typing in a field; **?** lists every key. These single-key shortcuts can be switched off in that list.

- **Change one thing and explain it.**
  1. In the Simulator, press **Set baseline**. This freezes the current curve.
  2. Change one setting, such as the dose, the half-life or the route.
  3. The panel under the chart explains what moved and why. Its table gives the metrics before and after.
- **Two regimens side by side.** The **Compare** tab has 18 one-click comparisons:
  - Once vs twice daily
  - Loading dose
  - Normal vs 50% clearance
  - CrCl 73 vs 41 mL/min
  - Phenytoin 300 vs 400 mg/day
  - 50 kg vs 100 kg, same dose
  - IV bolus vs oral
  - Bolus vs infusion
  - Short vs long infusion
  - Infusion ± loading bolus
  - Continuous vs intermittent infusion
  - On time vs missed dose
  - Potent vs less potent
  - Full vs partial agonist
  - Graded vs steep response
  - Dose vs double dose (effect)
  - Direct vs delayed effect
  - Evenly spaced vs bunched doses

  **Vary only** locks every setting except one, so A and B can differ in exactly one respect.
- **Show where a number comes from.** Select any readout under the chart (Cmax, tmax, half-life, clearance, AUC, peak, trough, accumulation…). It shows the formula worked through with the scenario's own numbers, and updates as you move the sliders.
- **Print a handout.** **⎙ Print** (in *Analyze & Export*) prints the current scenario on one page: its settings and a link back, the charts, the readouts and the explanations, in the light palette and without the controls.
- **Walk through time.** Drag across the chart, or focus it and use the arrow keys, to read the concentration at any moment. **Play** animates the whole window.
- **Show the effect.** **Effect** turns on the concentration–effect charts. They show the effect over time, where the curve sits on the Emax curve, and how long the effect stays above a target. Set an **effect-site delay** to show hysteresis: the effect lags the level, the effect-site level is drawn dashed under the plasma curve, and the concentration–effect chart traces a counterclockwise loop.
- **Work from a patient's numbers.** Under **Patient**, switch from *Simple* to *Clinical (CrCl)* and enter age, sex, height, weight and serum creatinine (albumin is used for phenytoin). The panel works out, with the numbers substituted:
  - ideal body weight (Devine) and adjusted body weight
  - creatinine clearance by Cockcroft–Gault, with actual, ideal or adjusted weight
  - the drug's clearance, CL = CL_ref × [(1 − fe) + fe × CrCl / 120], where fe is the fraction the kidneys excrete unchanged and 120 mL/min is the reference.

  Set a baseline, raise the creatinine, and the panel under the chart explains the change with the numbers, for example: "CrCl fell from 73 to 41 mL/min, so the clearance of a drug that is 90% renally excreted fell 38%; the half-life rose from 3.9 h to 6.2 h; the steady-state trough rose from 2.2 to 4.7 mg/L." It is an educational model, not for clinical dosing.
- **Show a population.** **◍ POPULATION** (above the chart) simulates 200 virtual patients (50–1,000) whose clearance and volume vary log-normally around the scenario's values. The CVs are 30% and 20% by default, as teaching assumptions.
  - The band holds the middle 90% of their levels.
  - For a repeated regimen the panel gives the probability of target attainment: the share whose steady-state trough is at or above MEC and whose peak is at or below MTC, and optionally the share with AUC24 in a range.
  - In Compare it shows both regimens on the same virtual patients, a clean way to ask which regimen suits more people.
  - The seed is in the link, so a class sees the same population.
- **Show saturation.** Switch **Drug Parameters** from *First-order* to *Saturable (Vmax, Km)*, or load phenytoin. Elimination is then Vmax·C / (Km + C), integrated numerically.
  - The readouts give the predicted steady state, Css = Km·R / (Vmax − R), and the input as a share of Vmax.
  - They also give the half-life at that level and the time to 90% of steady state, which grows with the dose.
  - When the input reaches Vmax they say "No steady state: input rate exceeds Vmax".

  With phenytoin loaded, a small tool adjusts a measured total level for low albumin (Sheiner–Tozer). It is separate from the simulation.
- **Use a drug from the library.** Eleven teaching profiles: ibuprofen, amoxicillin, caffeine, theophylline, gentamicin, vancomycin, meropenem, digoxin, phenytoin, lithium carbonate and levetiracetam. Meropenem shows time above the MIC (its label ties efficacy to that), and levetiracetam is a mostly renally cleared drug whose label adjusts the dose by creatinine clearance. Each shows its renal fraction, protein binding, salt factor, units and forms. **Where these values come from** ties each value to its FDA label on DailyMed or a paper, or marks it "typical textbook value, unverified". Digoxin runs in mcg and ng/mL, and lithium in mEq/L (300 mg of lithium carbonate is 8.12 mEq), and every readout, axis, table and CSV column follows.

## Guided lessons (26)

Each lesson opens a ready-made scenario next to a baseline. It sets a goal and asks students to **predict** the result before it explains anything. It then says why the idea matters and ends with a **challenge** that the app checks live as students move the sliders. Every number a lesson states is checked by the automated tests.

| Group | Lessons |
| --- | --- |
| PK fundamentals | Oral vs IV bolus · Reduced clearance · Kidney function (CrCl) · Volume of distribution · Dosing by weight · Double the dose · Flip-flop kinetics · Saturable elimination · One or two compartments |
| Repeated dosing and steady state | Repeated dosing · Loading dose · Missed dose · Narrow window · Short vs long half-life · Once vs twice daily |
| Custom regimens | Evenly spaced vs bunched doses |
| Infusion and route | Bolus vs infusion · Short vs long infusion · Loading bolus + infusion · Continuous vs intermittent · Time above the MIC |
| PK/PD concepts | Potency (EC50) · Efficacy (Emax) · Hill slope · Dose vs duration of effect · Effect delay (hysteresis) |

To assign a lesson, open it and use **Copy link**. The link opens that lesson for anyone.

The **glossary** under the lessons defines 50 terms, each with its symbol, unit and formula, and links to the lesson that shows it. It includes creatinine clearance, the Cockcroft–Gault equation, fe, ideal and adjusted body weight, and the salt factor. It also notes why dosing references state renal adjustments as Cockcroft–Gault CrCl in mL/min, while laboratories report eGFR per 1.73 m².

## Clinical cases (12)

The **Cases** tab puts a patient, a drug from the library and a target together. Students propose a dose and an interval, and the model grades the regimen at steady state:

- It says whether the target is met.
- It gives a rule-based hint when it isn't, for example "Trough above target and peak in range: lengthen the interval before reducing the dose."
- It grades the same regimen again, rounded to the tablets, capsules or vial steps available.

A **Walkthrough** works the textbook route with the patient's own numbers: Cockcroft–Gault, clearance, then the dose and interval, then the check. **What a pharmacist also weighs** lists the qualitative side. **Open in simulator** loads the case's patient and regimen, and every case has its own link (with the proposed regimen) and prints.

| Case | Teaches |
| --- | --- |
| Gentamicin with reduced kidney function | Peak and trough targets; lengthening the interval as CrCl falls |
| Gentamicin after burns: individualizing from two levels | The Sawchuk–Zaske approach: k from two levels, V from the infusion equation, then a new dose and interval; why levels matter when a patient clears the drug faster than creatinine predicts (Zaske et al. 1976) |
| Gentamicin once daily | The Hartford approach (7 mg/kg, interval from CrCl bands) against conventional every-8-hour dosing |
| Vancomycin to an AUC target | AUC24 400–600 mg·h/L (MIC 1 mg/L); a two-compartment version of the patient changes the peak but not the AUC24 |
| Vancomycin: the AUC from two levels | The first-order two-level method (a post-distribution peak and a trough): k, the level at the end of the infusion, the area over one interval, then a proportional dose change; and why the peak waits for distribution |
| Levetiracetam with reduced kidney function | A renal table set by creatinine clearance per 1.73 m² (body surface area, Mosteller); choosing a dose within the label's range by matching exposure to normal kidneys |
| Meropenem with reduced kidney function | Reading a label's renal table (Cockcroft–Gault rows); why the interval stretches; the unadjusted regimen nearly doubles exposure, the adjusted one stays near normal while keeping most of each interval above the MIC |
| Phenytoin: a low level and low albumin | Albumin adjustment, Vmax from one level, and how steep the dose–level curve is near saturation |
| Digoxin in an older adult | ng/mL targets, a long half-life, and the loading dose |
| Theophylline in a smoker | A cited clearance factor (about +50%) and a narrow window |
| Lithium with lower kidney function | A renally cleared drug, 12-hour levels, and what one missed dose does |
| A late dose: which drug minds? | Reasoning from half-life |

No case stores an answer: every target check, hint, walkthrough number and reference regimen is worked out from the model when the case opens, and the tests check that each case's reference regimen passes and that a deliberately wrong one gets the expected hint. The cases teach reasoning; they are not prescribing instructions.

## Practice and assessment

- **Practice problems.** There are 33 kinds of calculation problem in five topics:
  - single dose (12 kinds, including clearance from a two-compartment fit)
  - repeated dosing (7, including a renal dose adjustment from age, weight and serum creatinine)
  - infusions (6, including the AUC from two measured levels)
  - concentration–effect (4)
  - saturable (Michaelis–Menten) elimination (4): Css, the dose for a target level, the time to 90% of steady state, and the half-life at a level

  Each has a worked solution. **Visualize on curve** opens the problem's scenario with the cursor on the moment the question asks about. Answers within 2% count, so working with 0.693 for ln 2 is fine.
- **One problem for everyone.** **Copy link to this problem** gives a link that rebuilds exactly the same numbers.
- **Worksheets.** Choose a topic (or all topics) and a size of 5, 10 or 15 problems.
  - Students can work the sheet on screen, with an answers toggle.
  - It also prints black on white, with the worked answer key on its own page at the end. To hand it out without answers, print only the pages before the key.
  - The sheet's link rebuilds the same problems, so it can be set as homework and marked against the key. New problem kinds never change a sheet that has already been shared.
- **Fit the data** (estimation). Students get concentrations measured after an IV bolus or an oral dose, with realistic scatter. They move the half-life and volume until the curve runs through the points, while a live fit error shows how close they are. A third type gives a two-compartment IV bolus: students strip the curve by the method of residuals (the working is one click away) and set k10's half-life, V1, k12 and k21.
  - Once the fit is good, the app shows the settings that made the data.
  - **How to estimate from the data** works the same numbers out by hand: the log-linear line for an IV bolus, or the terminal slope and the area under the points for an oral dose.
  - Each data set has its own link.
- **Hit the window** (regimen design). Students get a made-up drug and a concentration window. They choose a dose and a dosing interval so that, at steady state, the trough stays at or above the lower limit and the peak at or below the upper one.
  - **Show a regimen that works** gives one answer and the textbook bound on the interval, τ ≤ ln(upper/lower)/kₑ.
  - Each task has its own link.

## On a course page

**Embed code** (in *Analyze & Export*) copies an iframe snippet for the current scenario. It opens a compact view without the landing section, and it keeps the educational-use note and an **Open in DoseCurve** link. In a narrow column the chart comes first, with the controls under it. It works in any page that accepts an iframe, including most learning platforms.

## Students' progress

Each student's progress stays in their own browser:

- lesson predictions answered right
- challenges met
- first answers by practice topic
- fitted data sets and window tasks

It is not sent anywhere, so a teacher can't see it; ask students to report their results or hand in a worksheet. **Reset progress** clears it.

## Week by week through a pharmacokinetics course

A mapping onto a typical ten-week pharmacokinetics course. Each week lists the lessons, the cases and the practice that fit it; adjust to your syllabus.

| Week | Topic | In DoseCurve |
| --- | --- | --- |
| 1 | Concentration–time basics, routes, volume | Lessons: Oral vs IV bolus, Volume of distribution, Double the dose. Practice: *Single dose*. Glossary |
| 2 | Clearance, half-life, dosing by weight | Lessons: Reduced clearance, Dosing by weight. Show the math on each readout. Fit the data (IV bolus) |
| 3 | Absorption and bioavailability | Lesson: Flip-flop kinetics. Fit the data (oral) |
| 4 | Multiple dosing and accumulation | Lessons: Repeated dosing, Short vs long half-life, Once vs twice daily. Practice: *Repeated dosing* |
| 5 | Loading doses, missed and late doses | Lessons: Loading dose, Missed dose. Case: A late dose. Hit the window |
| 6 | Infusions | Lessons: Bolus vs infusion, Short vs long infusion, Loading bolus + infusion, Continuous vs intermittent, Time above the MIC (meropenem). Practice: *Infusions* |
| 7 | Renal function and dose adjustment | Lesson: Kidney function (CrCl). Clinical patient mode. Cases: Gentamicin with reduced kidney function, Lithium, Digoxin |
| 8 | Aminoglycosides, vancomycin, variability | Lesson: One or two compartments. Fit the data (two compartments: the method of residuals). Cases: Gentamicin once daily, Vancomycin to an AUC target, Vancomycin from two levels. Population mode and probability of target attainment |
| 9 | Nonlinear (saturable) kinetics | Lesson: Saturable elimination. Case: Phenytoin with low albumin. Population mode on phenytoin: how many virtual patients have no steady state as the dose rises. Practice: *Saturable (Michaelis–Menten)* |
| 10 | PK/PD and review | Lessons: Potency, Efficacy, Hill slope, Dose vs duration of effect, Effect delay. Case: Theophylline in a smoker. A mixed worksheet |

## A possible sequence

1. **Fundamentals:**
   - lessons: Oral vs IV bolus, Reduced clearance, Kidney function (CrCl), Volume of distribution, Dosing by weight, Double the dose
   - practice: *Single dose*
   - Fit the data (IV bolus)
2. **Repeated dosing:**
   - lessons: Repeated dosing, Short vs long half-life, Once vs twice daily, Loading dose, Missed dose
   - practice: *Repeated dosing*
   - Hit the window (IV bolus)
3. **Infusions and schedules:**
   - lessons: Bolus vs infusion, Short vs long infusion, Loading bolus + infusion, Continuous vs intermittent, Time above the MIC, Evenly spaced vs bunched doses
   - practice: *Infusions*
4. **Absorption, saturation and design:**
   - lessons: Flip-flop kinetics, Saturable elimination, One or two compartments, Narrow window
   - practice: *Saturable (Michaelis–Menten)*
   - Fit the data (oral)
   - Hit the window (oral)
5. **PK/PD:**
   - lessons: Potency, Efficacy, Hill slope, Dose vs duration of effect, Effect delay (hysteresis)
   - practice: *Concentration–effect*
6. **Review:** a mixed worksheet across all topics.

## What the model includes, and what it leaves out

**Included:**

- One well-mixed compartment, or two: a central compartment that exchanges with a peripheral one at rates k12 and k21, for every route. Elimination is from the central compartment, first-order (linear).
- First-order oral absorption with bioavailability F, IV boluses, and zero-order infusions.
- Superposition of every dose given, whether a regular regimen (with loading and missed doses) or a custom schedule mixing routes.
- Body weight scales the volume. Clearance is scaled either by an organ-function percentage (Simple) or by Cockcroft–Gault creatinine clearance acting on the renal fraction fe (Clinical).
- A salt factor S for drugs dosed as a salt, and units per drug (mg/L, ng/mL, mEq/L).
- Saturable (Michaelis–Menten) elimination, integrated numerically (RK4, 0.05 h steps, every dose at its exact time).
- A sigmoid Emax effect that follows the plasma concentration instantly or, with an effect-site delay (first-order drugs), an effect compartment: dCe/dt = ke0·(C − Ce), in closed form.

**Left out:**

- Three or more compartments, and two compartments with saturable elimination.
- Indirect effects, tolerance and active metabolites, and an effect-site delay with saturable elimination.
- Protein-binding changes.
- Covariates and correlated variability. Population mode draws clearance and volume independently, with teaching CVs.

The drug presets use typical textbook values and are not prescribing information.

## Privacy

There are no accounts, no server and no tracking. A shared link carries the scenario's settings in the URL. Saved scenarios and progress stay in the browser that made them. Ask students not to enter any patient-identifying information.
