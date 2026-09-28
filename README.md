# DoseCurve

An interactive pharmacokinetics lab for exploring how drug, patient and regimen choices shape exposure over time.

**Live:** https://saifmaatimessi-droid.github.io/dose-curve/

> Educational simulation only. DoseCurve models idealized one-compartment linear pharmacokinetics for learning and demonstration. It is not validated clinical software and must not be used to make dosing decisions for real patients.

## What you can do

- **Simulate** oral, IV bolus and IV infusion dosing: single, repeated (with loading and missed doses), or a **custom schedule** where every dose has its own time and amount and any dose can be marked missed.
- **Compare against a baseline:** freeze a curve, change anything, and get a plain-English explanation of what moved and why, plus a metrics table.
- **Compare two scenarios side by side:** edit Scenario A and B independently, lock everything but one setting ("Vary only"), or start from six one-click comparisons such as once vs twice daily.
- **Watch steady state build up:** peak and trough for every dose, accumulation, and how long 90% of steady state takes.
- **Inspect any moment:** drag a cursor across the chart (or focus it and use the arrow keys) to read the concentration, window status, whether it's rising or falling, and the last dose given; jump between doses, peaks and troughs, or play the curve at 1×, 2× or 4×.
- **Learn** through 10 guided lessons, and practice with unlimited generated problems that come with worked solutions.
- **Share** any scenario or comparison as a link, and export the chart as PNG or the curves as CSV.

## How it's built

A static site with no build step and no dependencies:

| File | Purpose |
| --- | --- |
| `index.html` | The app: UI, charts, lessons, practice problems |
| `pk-engine.js` | The model: PK equations, regimens, metrics, presets and the share-link format. Has no DOM access, so it runs in the browser and in Node |
| `tests/pk-engine.test.js` | Automated tests for the engine |

The model is one-compartment and linear:

- Oral: `C(t) = F·D·kₐ / (V·(kₐ − kₑ)) · (e^(−kₑt) − e^(−kₐt))`
- IV bolus: `C(t) = (D/V)·e^(−kₑt)`
- IV infusion: zero-order input over the infusion time, then first-order decay
- `kₑ = ln2 / t½`, `CL = kₑ·V`; doses add by superposition (a loading dose scales dose 1; a missed dose is left out; a custom schedule adds each dose at its own time and amount)

Share links carry every setting in the URL itself, including custom schedules (format v2; links without one stay v1). Nothing is sent to or stored on a server.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Tests

Requires Node 18 or later; no packages to install.

```bash
node --test tests/
```

The suite checks the engine against closed-form one-compartment results, regimen edge cases (missed and final doses, drug that fully clears between doses), the comparison metrics, the share-link format, and every quantitative claim the lessons make.
