# DoseCurve

An interactive pharmacokinetics lab for exploring how drug, patient and regimen choices shape exposure over time.

**Live:** https://saifmaatimessi-droid.github.io/dose-curve/

> Educational simulation only. DoseCurve models idealized one-compartment linear pharmacokinetics for learning and demonstration. It is not validated clinical software and must not be used to make dosing decisions for real patients.

## What you can do

- **Simulate** oral, IV bolus and IV infusion dosing: single, repeated (with loading and missed doses), or a **custom schedule** where every dose has its own time, amount and route, each infusion its own duration, and any dose can be marked missed. Mix routes freely: a loading bolus with a continuous infusion, overlapping infusions, or IV then oral. Drag a dose along the timeline (or step it ±0.5 h) to reschedule it, with Undo.
- **Compare against a baseline:** freeze a curve, change anything, and get a plain-English explanation of what moved and why, plus a metrics table.
- **Compare two scenarios side by side:** edit Scenario A and B independently, lock everything but one setting ("Vary only"), or start from six one-click comparisons such as once vs twice daily.
- **Watch steady state build up:** peak and trough for every dose, accumulation, and how long 90% of steady state takes.
- **Inspect any moment:** drag a cursor across the chart (or focus it and use the arrow keys) to read the concentration, window status, whether it's rising or falling, and the last dose given; jump between doses, peaks and troughs, or play the curve at 1×, 2× or 4×.
- **See the effect (PK/PD):** switch on the effect charts to turn concentration into response with the sigmoid Emax model. Set EC50, Emax, the Hill slope and a baseline, pick a target effect, and read the effect over time, the concentration–effect curve with a dot that follows the time cursor, and how long the effect stays at or above target.
- **Learn** through 16 guided lessons, and practice with unlimited generated problems that come with worked solutions.
- **Share** any scenario or comparison as a link, and export the chart as PNG or the curves as CSV.
- **Save** setups in a local scenario library: save, update, rename, duplicate, delete, and export or import them as JSON. Saved scenarios stay in your browser (`localStorage`) unless you export or share them.

## How it's built

A static site with no build step and no dependencies:

| File | Purpose |
| --- | --- |
| `index.html` | The app: UI, charts, lessons, practice problems |
| `pk-engine.js` | The model: PK equations, regimens, metrics, presets and the share-link format. Has no DOM access, so it runs in the browser and in Node |
| `tests/pk-engine.test.js` | Automated tests for the engine |
| `404.html` | The page GitHub Pages shows for a missing address |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest` | Browser, home-screen and install icons |
| `og-image.png` | The preview image shown when a link is shared |
| `sitemap.xml` | The page's address for search engines |

The model is one-compartment and linear:

- Oral: `C(t) = F·D·kₐ / (V·(kₐ − kₑ)) · (e^(−kₑt) − e^(−kₐt))`
- IV bolus: `C(t) = (D/V)·e^(−kₑt)`
- IV infusion: zero-order input over the infusion time, then first-order decay
- `kₑ = ln2 / t½`, `CL = kₑ·V`; doses add by superposition (a loading dose scales dose 1; a missed dose is left out; a custom schedule adds each dose at its own time and amount)
- Internally, every dose's response is built from a sum of exponential terms (a single term for this one-compartment model), which keeps AUC, peaks and steady state exact for every route
- Steady state (a regimen repeated indefinitely) is computed exactly: each earlier dose's contribution forms a geometric series, so there is no cap on how many doses it takes to settle. It is shown only for regular repeated regimens (one dose every τ), never for single doses or custom schedules
- In a custom schedule each dose has its own route: oral doses use the scenario's F and kₐ, IV doses count in full, and an infusion delivers its amount at a constant rate (amount ÷ duration) from start to stop. There is one volume and one clearance whatever the route, overlapping infusions add their rates (the page says so whenever infusions overlap, including when the infusion time is longer than the dosing interval), and the line adds no delay. Infusions run 0.25–168 h, must end by 168 h and may carry up to 10,000 mg; other doses carry 25–4,000 mg
- Effect (PK/PD): `E = E₀ + Emax·Cⁿ / (EC50ⁿ + Cⁿ)`, as a percentage of the largest possible response (E₀ + Emax ≤ 100%). The effect follows plasma concentration instantly and reversibly: no effect-site delay and no tolerance

Share links carry every setting in the URL itself, including custom schedules. Each link is written at the lowest format version that holds it: v1 for regular regimens, v2 for custom schedules, v3 once doses use different routes or infusions have their own durations, v4 once the PK/PD settings or the effect charts are used. Older links open unchanged. Nothing is sent to or stored on a server.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Tests

Requires Node 18 or later; no packages to install.

```bash
node --test
```

The suite checks the engine against closed-form one-compartment results, regimen edge cases (missed and final doses, drug that fully clears between doses), the comparison metrics, the share-link format, the concentration–effect model, and every quantitative claim the lessons make.
