# Teaching with DoseCurve

DoseCurve is a free pharmacokinetics lab that runs in the browser: <https://saifmaati.github.io/dose-curve/>.

There is nothing to install and no sign-in. It works on laptops and phones, and after one visit it also opens offline. It models idealized linear pharmacokinetics in one or two compartments, saturable elimination, and a concentration–effect (Emax) relationship, direct or through an effect-site delay, for learning and demonstration only. It is not for dosing real patients.

This guide collects ways to use it in a course.

The [educator page](https://saifmaati.github.io/dose-curve/educators.html) has a link to every lesson and case on one page, ready to paste into a syllabus or a course site.

## In a lecture

For a projector, press **Present** (top right): the chart takes the whole width, the controls fold away, the 3D stage and the pinned action button go, and the type grows. **Esc**, or the button in the corner, leaves it. For a bright room, the **Light theme** switch gives the paper version (graphite curves on white); it follows the computer's own light or dark setting until you pick one, the choice is remembered in that browser, and adding `?theme=light` to a link opens it in light.

Since 2.0 the curve also appears as a 3D ribbon behind the page, and a first visit to the site's address opens on a short scrolling introduction. Links you share with a `#` part (a lesson, a case, a scenario, `#practice`) skip the introduction and open straight in the app, so use those for a class. On an older classroom computer, or if the motion distracts, switch **Effects** off in the top bar: the page stays the same, without the 3D stage. It starts off by itself on low-memory devices and when the computer asks for reduced motion.

With the keyboard, **Space** plays or pauses, **←/→** move the time cursor, **L** switches to a log scale and **B** sets a baseline, as long as you're not typing in a field; **?** lists every key. These single-key shortcuts can be switched off in that list.

- **Change one thing and explain it.**
  1. In the Simulator, press **Set baseline**. This freezes the current curve.
  2. Change one setting, such as the dose, the half-life or the route.
  3. The panel under the chart explains what moved and why. Its table gives the metrics before and after.
- **Two regimens side by side.** The **Compare** tab has 28 one-click comparisons:
  - Once vs twice daily
  - Loading dose
  - Normal vs 50% clearance
  - Vancomycin: one vs two compartments
  - Phenytoin 300 vs 400 mg/day
  - CrCl 73 vs 41 mL/min
  - 50 kg vs 100 kg, same dose
  - IV bolus vs oral
  - Bolus vs infusion
  - Short vs long infusion
  - Infusion ± loading bolus
  - Continuous vs intermittent infusion
  - Meropenem: 30-minute vs 3-hour infusion
  - On time vs missed dose
  - Potent vs less potent
  - Full vs partial agonist
  - Graded vs steep response
  - Dose vs double dose (effect)
  - Direct vs delayed effect
  - Induction: a low-extraction drug
  - Induction: first pass, by mouth
  - Liver blood flow halved (IV)
  - Evenly spaced vs bunched doses
  - Fast vs slow response turnover
  - No dialysis vs hemodialysis
  - Dialysis: one vs two compartments
  - Piperacillin: 30-minute vs 3-hour infusion
  - Gentamicin: divided vs once daily

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
  - With **Effect** on, the effect chart shades the same patients' effect, and the panel compares the spread in effect with the spread in level at the moment the median effect is furthest from baseline. Near Emax the effect band narrows: with the default drug at steady state, a 1.8-fold spread in peak levels is only 13 points of effect, while the troughs, lower on the curve, spread far wider. Lowering EC50 narrows it further. A good question for students: why does variability in level matter less for some drugs' effects than for others'?
  - The seed is in the link, so a class sees the same population.
- **Show saturation.** Switch **Drug Parameters** from *First-order* to *Saturable (Vmax, Km)*, or load phenytoin. Elimination is then Vmax·C / (Km + C), integrated numerically.
  - The readouts give the predicted steady state, Css = Km·R / (Vmax − R), and the input as a share of Vmax.
  - They also give the half-life at that level and the time to 90% of steady state, which grows with the dose.
  - When the input reaches Vmax they say "No steady state: input rate exceeds Vmax".

  With phenytoin loaded, a small tool adjusts a measured total level for low albumin (Sheiner–Tozer). It is separate from the simulation.
- **Use a drug from the library.** Eleven teaching profiles: ibuprofen, amoxicillin, caffeine, theophylline, gentamicin, vancomycin, meropenem, digoxin, phenytoin, lithium carbonate and levetiracetam. Meropenem shows time above the MIC (its label ties efficacy to that), and levetiracetam is a mostly renally cleared drug whose label adjusts the dose by creatinine clearance. Each shows its renal fraction, protein binding, salt factor, units and forms. **Where these values come from** ties each value to its FDA label on DailyMed or a paper, or marks it "typical textbook value, unverified". Digoxin runs in mcg and ng/mL, and lithium in mEq/L (300 mg of lithium carbonate is 8.12 mEq), and every readout, axis, table and CSV column follows.

## Guided lessons (36)

Each lesson opens a ready-made scenario next to a baseline. It sets a goal and asks students to **predict** the result before it explains anything. It then says why the idea matters and ends with a **challenge** that the app checks live as students move the sliders. Every number a lesson states is checked by the automated tests.

| Group | Lessons |
| --- | --- |
| PK fundamentals | Oral vs IV bolus · Reduced clearance · Kidney function (CrCl) · Which weight for CrCl · Hemodialysis sessions · Rebound after dialysis · Volume of distribution · Dosing by weight · Double the dose · Flip-flop kinetics · Saturable elimination · One or two compartments |
| Repeated dosing and steady state | Repeated dosing · Loading dose · Missed dose · Narrow window · Short vs long half-life · Once vs twice daily |
| Custom regimens | Evenly spaced vs bunched doses |
| Infusion and route | Bolus vs infusion · Short vs long infusion · Loading bolus + infusion · Continuous vs intermittent · Time above the MIC |
| PK/PD concepts | Potency (EC50) · Efficacy (Emax) · Hill slope · Dose vs duration of effect · Effect delay (hysteresis) · Indirect response |
| Liver and first pass | Hepatic extraction · First pass and induction · Liver blood flow |
| Antimicrobial PK/PD | Extended infusion (fT>MIC) · Once daily vs divided (Cmax/MIC) |
| Levels and individualization | One level and a prior |

To assign a lesson, open it and use **Copy link**. The link opens that lesson for anyone. The lessons' texts load with the Lessons tab or the first lesson a student opens, so the simulator itself appears sooner; after one visit they are saved for offline use with the rest of the app.

The **glossary** under the lessons defines 69 terms, each with its symbol, unit and formula, and links to the lesson that shows it. It includes creatinine clearance, the Cockcroft–Gault equation, fe, ideal and adjusted body weight, and the salt factor. It also notes why dosing references state renal adjustments as Cockcroft–Gault CrCl in mL/min, while laboratories report eGFR per 1.73 m².

## Clinical cases (16)

The **Cases** tab puts a patient, a drug from the library and a target together. Students propose a dose and an interval, and the model grades the regimen at steady state. The list opens on the **case of the day**, the same case for everyone on a given date (it changes at midnight UTC), so a class can work one case together without a link:

- It says whether the target is met.
- It gives a rule-based hint when it isn't, for example "Trough above target and peak in range: lengthen the interval before reducing the dose."
- It grades the same regimen again, rounded to the tablets, capsules or vial steps available.

**Individualize from levels.** Under the clinical patient in the simulator, measured levels (each entered as hours after a given dose) give a Bayesian estimate of the patient's own clearance, volume and half-life with 95% intervals, weighing each level against the patient model by its uncertainty (Sheiner et al., 1979). It shows how much uncertainty the levels removed, the two-level estimate beside it when two levels follow the same IV dose, and the dose for an AUC24 or trough target; applying it keeps the setup the levels were measured on as the baseline. The two Bayesian cases open with their levels, so students can compare the two methods on the same numbers. The prior's CVs and the error model are teaching assumptions, stated in the panel.

**When to sample.** Under the steady-state chart of any repeated regimen, *When to sample* gives the dose from which its peak and trough are within 10% of steady state, and the model's peak and trough times in that interval: the end of an infusion, the oral Tmax, or, with two compartments, the moment distribution is 90% complete. A **Show** button moves the time cursor to each. Comparing one and two compartments for vancomycin shows why a protocol waits after the infusion before drawing a peak. The times are the model's; a local protocol sets the times levels are actually drawn.

A **Walkthrough** works the textbook route with the patient's own numbers: Cockcroft–Gault, clearance, then the dose and interval, then the check. **What a pharmacist also weighs** lists the qualitative side. **Open in simulator** loads the case's patient and regimen, and every case has its own link (with the proposed regimen) and prints.

| Case | Teaches |
| --- | --- |
| Gentamicin with reduced kidney function | Peak and trough targets; lengthening the interval as CrCl falls |
| Gentamicin after burns: individualizing from two levels | The Sawchuk–Zaske approach: k from two levels, V from the infusion equation, then a new dose and interval; why levels matter when a patient clears the drug faster than creatinine predicts (Zaske et al. 1976) |
| Gentamicin once daily | The Hartford approach (7 mg/kg, interval from CrCl bands) against conventional every-8-hour dosing |
| Vancomycin to an AUC target | AUC24 400–600 mg·h/L (MIC 1 mg/L); a two-compartment version of the patient changes the peak but not the AUC24 |
| Vancomycin: the AUC from two levels | The first-order two-level method (a post-distribution peak and a trough): k, the level at the end of the infusion, the area over one interval, then a proportional dose change; and why the peak waits for distribution |
| Vancomycin: two levels an hour apart | Two levels too close together make the two-level AUC look on target when it isn't; a Bayesian estimate from the same levels leads to the dose that is |
| Gentamicin: when the second level comes back higher | Assay error larger than the fall between two close levels breaks the two-level method outright (a negative elimination rate); the Bayesian estimate still gives a regimen on target |
| Levetiracetam with reduced kidney function | A renal table set by creatinine clearance per 1.73 m² (body surface area, Mosteller); choosing a dose within the label's range by matching exposure to normal kidneys |
| Meropenem with reduced kidney function | Reading a label's renal table (Cockcroft–Gault rows); why the interval stretches; the unadjusted regimen nearly doubles exposure, the adjusted one stays near normal while keeping most of each interval above the MIC |
| Piperacillin-tazobactam with reduced kidney function | The label's renal table (CrCl 20–40 mL/min: 2.25 g every 6 hours); fT>MIC on the unbound level against the FDA breakpoint for *P. aeruginosa* (16 mg/L); reduced clearance keeps each dose above the MIC longer; the same regimen over 3 hours, and an extended-infusion scheme (Lodise 2007), compared |
| Gentamicin on hemodialysis | The label's figures: an 8-hour session lowers the level by about 50%, and 1 to 1.7 mg/kg is given at the end of each session. The model shows the levels before and after each session and the amount removed, and why the dose after a session is a full dose that rebuilds the peak, not a top-up of what was removed |
| Phenytoin: a low level and low albumin | Albumin adjustment, Vmax from one level, and how steep the dose–level curve is near saturation |
| Digoxin in an older adult | ng/mL targets, a long half-life, and the loading dose |
| Theophylline in a smoker | A cited clearance factor (about +50%) and a narrow window |
| Lithium with lower kidney function | A renally cleared drug, 12-hour levels, and what one missed dose does |
| A late dose: which drug minds? | Reasoning from half-life |

No case stores an answer: every target check, hint, walkthrough number and reference regimen is worked out from the model when the case opens, and the tests check that each case's reference regimen passes and that a deliberately wrong one gets the expected hint. The cases teach reasoning; they are not prescribing instructions.

## Sensitivity: which input matters most

Under the readouts, **Sensitivity** moves each input 20% down and 20% up, one at a time with everything else held, and draws a tornado chart of the change in AUC24, the peak, the trough or the time in the window, largest first, with a sentence naming the input that matters most. Clearance moves with the volume held (so the half-life follows), and volume with clearance held. It turns a common exam point into something students can see: AUC24 depends on clearance and the daily dose but not on volume (clearance −20% gives +25%, +20% gives −16.7%), while volume moves the peak and the trough. Switch the output to the trough and the dosing interval often comes first. A regular regimen is read at steady state; a single dose, a custom schedule or a regimen on dialysis over the time window.

## Hemodialysis

Under the patient, **Hemodialysis** adds sessions: the dialyzer's clearance, how long each session lasts, when the first starts and how often they repeat. While a session runs, the clearances add, so the level falls faster. The chart marks each session, and the panel lists, for each session in the window, the level as it starts and as it ends, the amount removed (the dialysis clearance times the area under the curve during the session) and the IV dose that would bring the level back to where the session found it. Regimens on dialysis have no single steady state, so those readouts give way to the clearance on and off dialysis and the fall per session. With one compartment there is no post-dialysis rebound. Switch **Drug parameters** to two compartments and the level rebounds after each session as drug returns from the tissues; the session list gives the rebound's height, timing and the share of the fall it gives back. A good question for students: why does a level drawn straight after a session underestimate what the patient has? The default dialysis clearance is a typical value, flagged unverified; the gentamicin case and the lesson set it from the gentamicin label's statement that an 8-hour session lowers the level by about 50%. A question that works well: why does the label give 1 to 1.7 mg/kg after each session when each session in the case removes only 15 to 18 mg?

## Effects that lag the level

Two models make the effect come after the level, for different reasons, and the charts show both:

- **Effect-site delay** (Sheiner, Stanski and colleagues, 1979): the drug has to reach the site of action, so the effect follows an effect-site level that equilibrates with plasma. The concentration–effect chart shows a counterclockwise loop.
- **Indirect response** (Dayneka, Garg and Jusko, 1993): the drug inhibits or stimulates the production or loss of something the body makes, and the response can only change as fast as that is replaced. In **Pharmacodynamics → How the effect is produced**, choose one of the four types, then set the response's turnover half-life and the drug's maximum inhibition or stimulation. The effect chart shows the response as a percentage of its baseline. The concentration–effect chart shows the path it takes against the level, around the dotted curve where it would settle if each level were held. The readouts give its largest change, when it comes, and how far it lags the plasma peak.

The lesson *Indirect response* uses a drug with warfarin's half-life and volume, acting like warfarin on the production of clotting factors, with turnovers of 5 h (factor VII) and 60 h (factor II) from warfarin's label. After one dose, the fast response bottoms out at 24 h; the slow one at 96 h, much as the label describes: an effect within 24 hours, with the peak delayed 72 to 96 hours. It uses no INR values. A good question for a class: why does four times the single dose (100 mg) still leave the slow response at 45% of baseline, while 25 mg every day takes it to 29% within the week?

## Antimicrobial PK/PD

Under the therapeutic window, **Antimicrobial PK/PD** takes the organism's MIC and the drug's unbound fraction (fu), and reads three indices for the scenario on the chart (and for the baseline, or for A and B):

- **fT>MIC:** the share of each steady-state interval that the unbound level, fu × the total, stays above the MIC. The chart draws the MIC line and the unbound level, dotted, so students can see where they cross.
- **Cmax/MIC** and **AUC24/MIC**, on the total level, as the 2020 vancomycin guideline reads AUC24/MIC; the unbound versions are shown beside them.

A repeated regimen is read at steady state over one interval; a single dose or a custom schedule over the time window. Loading a library antimicrobial sets its MIC and fu: piperacillin-tazobactam starts at 16 mg/L (the FDA susceptible breakpoint for *P. aeruginosa*), meropenem at an illustrative 2 mg/L, vancomycin at the 1 mg/L the guideline assumes. The panel names each drug's index from its label or guideline (time above the MIC for piperacillin and meropenem, the peak ratio for gentamicin, AUC24/MIC for vancomycin). It shows a numeric target only where the cited source gives one, vancomycin's 400–600, and otherwise says why there is none: published targets differ by drug class, organism and infection model. Compare lists the three indices for A and B. Two lessons, a practice topic and the piperacillin case use it. A good class exercise: give the same daily dose of piperacillin as 30-minute, 3-hour and continuous infusions (47%, 69% and 100% of each interval above 16 mg/L, with the same AUC24), then do the same with gentamicin's peak ratio and watch the two indices pull in opposite directions.

## Practice and assessment

- **Practice problems.** There are 42 kinds of calculation problem in seven topics:
  - single dose (13 kinds, including clearance from a two-compartment fit and the fall over a dialysis session)
  - repeated dosing (7, including a renal dose adjustment from age, weight and serum creatinine)
  - infusions (6, including the AUC from two measured levels)
  - concentration–effect (6, including the time of the peak effect with an effect-site delay, and where an indirect response settles under a constant infusion)
  - saturable (Michaelis–Menten) elimination (4): Css, the dose for a target level, the time to 90% of steady state, and the half-life at a level
  - liver and first pass (3): hepatic clearance by the well-stirred model, oral bioavailability after the first pass, and what induction does to IV exposure
  - antimicrobial PK/PD (3): fT>MIC for an IV bolus at steady state (on the unbound level), Cmax/MIC for an intermittent infusion, and AUC24/MIC

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
| 3 | Absorption, bioavailability and the liver | Lessons: Flip-flop kinetics, Hepatic extraction, First pass and induction, Liver blood flow. Practice: *Liver and first pass*. Fit the data (oral) |
| 4 | Multiple dosing and accumulation | Lessons: Repeated dosing, Short vs long half-life, Once vs twice daily. Practice: *Repeated dosing* |
| 5 | Loading doses, missed and late doses | Lessons: Loading dose, Missed dose. Case: A late dose. Hit the window |
| 6 | Infusions | Lessons: Bolus vs infusion, Short vs long infusion, Loading bolus + infusion, Continuous vs intermittent, Time above the MIC (meropenem). Practice: *Infusions* |
| 7 | Renal function and dose adjustment | Lessons: Kidney function (CrCl), Which weight for CrCl. Clinical patient mode. Cases: Gentamicin with reduced kidney function, Lithium, Digoxin |
| 8 | Aminoglycosides, vancomycin, variability | Lesson: One or two compartments. Fit the data (two compartments: the method of residuals). Cases: Gentamicin once daily, Vancomycin to an AUC target, Vancomycin from two levels, Vancomycin: two levels an hour apart, Gentamicin: when the second level comes back higher. Lesson: One level and a prior. Individualize from levels (Bayesian) under the clinical patient. Population mode and probability of target attainment |
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
   - lessons: Flip-flop kinetics, Saturable elimination, One or two compartments, Narrow window, Hepatic extraction, First pass and induction, Liver blood flow
   - practice: *Saturable (Michaelis–Menten)*, *Liver and first pass*
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
- Optionally, clearance from a liver model (the well-stirred model): liver blood flow Q, the unbound fraction in blood fu and the intrinsic clearance CLint give E = fu·CLint / (Q + fu·CLint), hepatic clearance Q·E and oral F = fabs·(1 − E). Blood and plasma concentrations are taken as equal.
- A salt factor S for drugs dosed as a salt, and units per drug (mg/L, ng/mL, mEq/L).
- Saturable (Michaelis–Menten) elimination, integrated numerically (RK4, 0.05 h steps, every dose at its exact time).
- A sigmoid Emax effect that follows the plasma concentration instantly or, with an effect-site delay (first-order drugs), an effect compartment: dCe/dt = ke0·(C − Ce), in closed form.

**Left out:**

- Three or more compartments, and two compartments with saturable elimination.
- Indirect effects, tolerance and active metabolites, and an effect-site delay with saturable elimination.
- Protein-binding changes beyond the liver model's unbound fraction: unbound levels aren't drawn, and the volume doesn't depend on fu. The liver model is for first-order drugs in the simple patient, and counts no gut-wall metabolism or renal clearance alongside it.
- Covariates and correlated variability. Population mode draws clearance and volume independently, with teaching CVs.

The drug presets use typical textbook values and are not prescribing information.

## Run a class in ten minutes

1. **Write a case (optional).** In **Cases → For instructors → Write a case**, choose a first-order drug from the library, describe the patient (age, sex, height, weight, serum creatinine), set the regimens students may pick (intervals, dose range and step, and the infusion time for an IV drug), and the target at steady state: a peak range with a trough limit, an AUC24 range, or a time above the MIC (your MIC and the least share of each interval the unbound level must stay above it). You can change the drug's half-life, volume or bioavailability; the case then shows them as your values beside the library's. Before the link is made, DoseCurve checks every regimen your choices allow and offers the link only when at least one meets the target, and it tells you how many do. The case opens for everyone as a community case, marked unreviewed. Don't include a name or any other identifier.
2. **Make an assignment.** In **Make an assignment**, add up to 12 items in order: built-in cases, the case you just wrote, and worksheets (a topic and 5, 10 or 15 problems). Copy the one link and post it.
3. **Choose a class key** and tell your class separately; it isn't in the link. Give each student an identifier that isn't their name (a seat or roster number).
4. **Students work through the assignment** in the browser: each case is graded as they check a regimen, and worksheet answers are checked as they go. Their progress stays in their own browser.
5. **Completion codes.** At the end, a student enters the identifier and the class key and gets a few lines (the assignment, their identifier, the items finished, the score and the date) and a code. They show or send you both.
6. **Verify** in **Verify a completion code** with the same key: it says whether the code matches the lines. Anyone who knows the key can make a code, so a code records work done in the app, not proof of who did it.

## Privacy

There are no accounts, no server and no tracking. A shared link carries the scenario's settings in the URL, and a case or assignment you write travels in its link the same way. Saved scenarios, progress and assignment answers stay in the browser that made them. Completion codes are computed in the student's browser from the class key, which is never sent anywhere. Ask students not to enter any patient-identifying information, and give them identifiers that aren't their names.
