# Teaching with DoseCurve

DoseCurve is a free pharmacokinetics lab that runs in the browser: <https://saifmaati.github.io/dose-curve/>.

There is nothing to install and no sign-in. It works on laptops and phones, and after one visit it also opens offline. It models idealized one-compartment linear pharmacokinetics and a direct concentration–effect (Emax) relationship, for learning and demonstration only. It is not for dosing real patients.

This guide collects ways to use it in a course.

## In a lecture

- **Change one thing and explain it.**
  1. In the Simulator, press **Set baseline**. This freezes the current curve.
  2. Change one setting, such as the dose, the half-life or the route.
  3. The panel under the chart explains what moved and why. Its table gives the metrics before and after.
- **Two regimens side by side.** The **Compare** tab has 14 one-click comparisons:
  - Once vs twice daily
  - Loading dose
  - Normal vs 50% clearance
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
  - Evenly spaced vs bunched doses

  **Vary only** locks every setting except one, so A and B can differ in exactly one respect.
- **Show where a number comes from.** Select any readout under the chart (Cmax, tmax, half-life, clearance, AUC, peak, trough, accumulation…). It shows the formula worked through with the scenario's own numbers, and updates as you move the sliders.
- **Walk through time.** Drag across the chart, or focus it and use the arrow keys, to read the concentration at any moment. **Play** animates the whole window.
- **Show the effect.** **Effect** turns on the concentration–effect charts. They show the effect over time, where the curve sits on the Emax curve, and how long the effect stays above a target.

## Guided lessons (20)

Each lesson opens a ready-made scenario next to a baseline. It sets a goal and asks students to **predict** the result before it explains anything. It then says why the idea matters and ends with a **challenge** that the app checks live as students move the sliders. Every number a lesson states is checked by the automated tests.

| Group | Lessons |
| --- | --- |
| PK fundamentals | Oral vs IV bolus · Reduced clearance · Volume of distribution · Double the dose · Flip-flop kinetics |
| Repeated dosing and steady state | Repeated dosing · Loading dose · Missed dose · Narrow window · Short vs long half-life · Once vs twice daily |
| Custom regimens | Evenly spaced vs bunched doses |
| Infusion and route | Bolus vs infusion · Short vs long infusion · Loading bolus + infusion · Continuous vs intermittent |
| PK/PD concepts | Potency (EC50) · Efficacy (Emax) · Hill slope · Dose vs duration of effect |

To assign a lesson, open it and use **Copy link**. The link opens that lesson for anyone.

The **glossary** under the lessons defines 30 terms, each with its symbol, unit and formula, and links to the lesson that shows it.

## Practice and assessment

- **Practice problems.** There are 26 kinds of calculation problem in four topics:
  - single dose (11 kinds)
  - repeated dosing (6)
  - infusions (5)
  - concentration–effect (4)

  Each has a worked solution. **Visualize on curve** opens the problem's scenario with the cursor on the moment the question asks about. Answers within 2% count, so working with 0.693 for ln 2 is fine.
- **One problem for everyone.** **Copy link to this problem** gives a link that rebuilds exactly the same numbers.
- **Worksheets.** Choose a topic (or all topics) and a size of 5, 10 or 15 problems.
  - Students can work the sheet on screen, with an answers toggle.
  - It also prints black on white, with the worked answer key on its own page at the end. To hand it out without answers, print only the pages before the key.
  - The sheet's link rebuilds the same problems, so it can be set as homework and marked against the key.
- **Fit the data** (estimation). Students get concentrations measured after an IV bolus or an oral dose, with realistic scatter. They move the half-life and volume until the curve runs through the points, while a live fit error shows how close they are.
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

## A possible sequence

1. **Fundamentals:**
   - lessons: Oral vs IV bolus, Reduced clearance, Volume of distribution, Double the dose
   - practice: *Single dose*
   - Fit the data (IV bolus)
2. **Repeated dosing:**
   - lessons: Repeated dosing, Short vs long half-life, Once vs twice daily, Loading dose, Missed dose
   - practice: *Repeated dosing*
   - Hit the window (IV bolus)
3. **Infusions and schedules:**
   - lessons: Bolus vs infusion, Short vs long infusion, Loading bolus + infusion, Continuous vs intermittent, Evenly spaced vs bunched doses
   - practice: *Infusions*
4. **Absorption and design:**
   - lessons: Flip-flop kinetics, Narrow window
   - Fit the data (oral)
   - Hit the window (oral)
5. **PK/PD:**
   - lessons: Potency, Efficacy, Hill slope, Dose vs duration of effect
   - practice: *Concentration–effect*
6. **Review:** a mixed worksheet across all topics.

## What the model includes, and what it leaves out

**Included:**

- One well-mixed compartment with first-order (linear) elimination.
- First-order oral absorption with bioavailability F, IV boluses, and zero-order infusions.
- Superposition of every dose given, whether a regular regimen (with loading and missed doses) or a custom schedule mixing routes.
- Body weight scales the volume, and organ function scales clearance.
- A direct sigmoid Emax effect that follows the plasma concentration instantly.

**Left out:**

- Multi-compartment distribution.
- Saturable (Michaelis–Menten) elimination.
- Delayed or indirect effects, tolerance and active metabolites.
- Protein-binding changes.
- The variability between people that real dosing has to account for.

The drug presets use typical textbook values and are not prescribing information.

## Privacy

There are no accounts, no server and no tracking. A shared link carries the scenario's settings in the URL. Saved scenarios and progress stay in the browser that made them. Ask students not to enter any patient-identifying information.
