# DoseCurve

An interactive pharmacokinetics lab for exploring how drug, patient and regimen choices shape exposure over time.

**Live:** https://saifmaati.github.io/dose-curve/

> Educational simulation only. DoseCurve models idealized one-compartment linear pharmacokinetics for learning and demonstration. It is not validated clinical software and must not be used to make dosing decisions for real patients.

## What you can do

- **Simulate** oral, IV bolus and IV infusion dosing: single, repeated (with loading and missed doses), or a **custom schedule** where every dose has its own time, amount and route, each infusion its own duration, and any dose can be marked missed. Mix routes freely: a loading bolus with a continuous infusion, overlapping infusions, or IV then oral. Drag a dose along the timeline (or step it ±0.5 h) to reschedule it, with Undo.
- **Compare against a baseline:** freeze a curve, change anything, and get a plain-English explanation of what moved and why, plus a metrics table.
- **Compare two scenarios side by side:** edit Scenario A and B independently, lock everything but one setting ("Vary only"), or start from six one-click comparisons such as once vs twice daily.
- **Watch steady state build up:** peak and trough for every dose, accumulation, and how long 90% of steady state takes.
- **See the math:** select any readout (Cmax, tmax, half-life, clearance, AUC, peak and trough, accumulation, time to steady state…) to see its formula worked through with the scenario's own numbers, updating as you move the sliders. Readouts that can only be found by sampling the curve (time in window, a custom schedule's peak) say so. The tests hold each formula's result to the simulation's.
- **Inspect any moment:** drag a cursor across the chart (or focus it and use the arrow keys) to read the concentration, window status, whether it's rising or falling, and the last dose given; jump between doses, peaks and troughs, or play the curve at 1×, 2× or 4×.
- **See the effect (PK/PD):** switch on the effect charts to turn concentration into response with the sigmoid Emax model. Set EC50, Emax, the Hill slope and a baseline, pick a target effect, and read the effect over time, the concentration–effect curve with a dot that follows the time cursor, and how long the effect stays at or above target.
- **Learn** through 20 guided lessons in five groups (PK fundamentals, repeated dosing, custom regimens, infusion and route, PK/PD). Each one sets a goal, asks you to predict the result before explaining it, and ends with a challenge the app checks live; every answer and every number a lesson states is checked by the test suite.
- **See your progress:** lesson cards are marked when you get the prediction right and when you meet the challenge; Practice keeps your first-answer results by topic and counts the data sets you fit and the window tasks you meet. It all stays in your browser (`localStorage`), with a reset button.
- **Look terms up** in the glossary under the lessons: 30 terms from concentration and AUC to EC50 and the Hill slope, each with its symbol, unit and relation, a link to the lesson that shows it, and a search box.
- **Practise** with generated calculation problems: 21 kinds in four topics (single dose, repeated dosing, infusions, concentration–effect), from half-life and AUC to steady-state troughs, loading doses and the Emax model. Each comes with a worked solution, and "Visualize on curve" opens its scenario with the time cursor on the moment the question asks about. The tests work every answer out again from a simulation of the problem's own scenario.
- **Hit the window:** a made-up drug and a concentration window. Choose a dose and a dosing interval so that, at steady state, the trough stays at or above the lower limit and the peak at or below the upper one, with a live verdict and a textbook route (the swing e^(kₑτ) has to fit the band). Every task is built around a regimen on the sliders' steps, so it can always be met.
- **Worksheets:** make a set of 5, 10 or 15 problems from one topic or all of them, work it on screen with an answers toggle, or print it (black on white, with a worked answer key on its own page). Its link (`#ws=topic.count.seed`) rebuilds the same sheet.
- **Fit the data:** get a set of measured concentrations after an IV bolus or an oral dose (made by the model with about 5% measurement scatter) and move the half-life and volume until the curve runs through them, with a live fit error. A "how to estimate" panel works the same numbers out by hand: the log-linear slope and intercept for an IV bolus, and the terminal slope plus the area under the points for an oral dose.
- **Share** any scenario or comparison as a link, and export the chart as PNG or the curves as CSV. A practice problem or a fit-the-data set has its own link too (`#p=kind.seed`, `#fit=iv.seed`), which rebuilds exactly the same numbers, so a whole class can work the same one.
- **Use it offline:** after one visit a service worker keeps a copy of the app, so it opens without a connection (in a classroom or on a phone). Online, the page always comes from the network first, so updates show up at once.
- **Save** setups in a local scenario library: save, update, rename, duplicate, delete, and export or import them as JSON. Saved scenarios and your progress stay in your browser (`localStorage`) unless you export or share them.

## How it's built

A static site with no build step and no dependencies:

| File | Purpose |
| --- | --- |
| `index.html` | The app: UI, charts, lessons and the practice view |
| `pk-engine.js` | The model: PK equations, regimens, metrics, presets, lessons, practice problems and the share-link format. Has no DOM access, so it runs in the browser and in Node |
| `CHANGELOG.md` | What changed in each release |
| `sw.js` | The service worker for offline use: network first for the page, cached engine, icons and fonts |
| `tests/pk-engine.test.js` | Automated tests for the engine |
| `tests/sw.test.js` | Tests for the service worker against a simulated cache and network |
| `404.html` | The page GitHub Pages shows for a missing address |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest` | Browser, home-screen and install icons |
| `og-image.png` | The preview image shown when a link is shared |
| `sitemap.xml` | The page's address for search engines |
| `robots.txt` | Crawler guidance and the sitemap's address (read once the site has its own domain) |

The model is one-compartment and linear:

- Oral: `C(t) = F·D·kₐ / (V·(kₐ − kₑ)) · (e^(−kₑt) − e^(−kₐt))`
- IV bolus: `C(t) = (D/V)·e^(−kₑt)`
- IV infusion: zero-order input over the infusion time, then first-order decay
- `kₑ = ln2 / t½`, `CL = kₑ·V`; doses add by superposition (a loading dose scales dose 1; a missed dose is left out; a custom schedule adds each dose at its own time and amount)
- Internally, every dose's response is built from a sum of exponential terms (a single term for this one-compartment model), which keeps AUC, peaks and steady state exact for every route
- Steady state (a regimen repeated indefinitely) is computed exactly: each earlier dose's contribution forms a geometric series, so there is no cap on how many doses it takes to settle. It is shown only for regular repeated regimens (one dose every τ), never for single doses or custom schedules
- In a custom schedule each dose has its own route: oral doses use the scenario's F and kₐ, IV doses count in full, and an infusion delivers its amount at a constant rate (amount ÷ duration) from start to stop. There is one volume and one clearance whatever the route, overlapping infusions add their rates (the page says so whenever infusions overlap, including when the infusion time is longer than the dosing interval), and the line adds no delay. Infusions run 0.25–168 h, must end by 168 h and may carry up to 10,000 mg; other doses carry 25–4,000 mg
- Effect (PK/PD): `E = E₀ + Emax·Cⁿ / (EC50ⁿ + Cⁿ)`, as a percentage of the largest possible response (E₀ + Emax ≤ 100%). The effect follows plasma concentration instantly and reversibly. This is a simplified direct-effect model: it does not model delayed effects, tolerance, active metabolites, indirect responses, or any individual patient's outcome

Share links carry every setting in the URL itself, including custom schedules. Each link is written at the lowest format version that holds it: v1 for regular regimens, v2 for custom schedules, v3 once doses use different routes or infusions have their own durations, v4 once the PK/PD settings or the effect charts are used. Older links open unchanged. Nothing is sent to or stored on a server: DoseCurve runs in your browser, and saved scenarios stay in it unless you export or share them. Do not enter patient-identifying information.

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

When `pk-engine.js` changes, update the `?v=` stamp on its script tag in `index.html` (the test that fails prints the new value). It's the engine's content hash, so a browser holding a cached copy of an older engine fetches the new one instead of running a new page against it.

The suite checks the engine against closed-form one-compartment results, regimen edge cases (missed and final doses, drug that fully clears between doses), the comparison metrics, the share-link format, the concentration–effect model, every quantitative claim the lessons make, every practice problem's answer against a simulation of its own scenario, the offline service worker (online and offline pages, engine versions, fonts, pass-through requests), that every fit-the-data set can be fitted exactly on the sliders' steps while 20% misses don't count, and that every regimen-design task is met by its own regimen and missed by its start and by 3× or ⅓ the dose.
