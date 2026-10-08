# DoseCurve design system (2.0)

DoseCurve is read by pharmacy students in a lecture hall and pharmacists at a desk, often on a projector, often on a
phone, nearly always to read a number. Version 2 rebuilds it to the standard of the best full-screen cinematic product
sites, translated to pharmacokinetics:

- **Alternating sections.** Full-bleed dark cinematic scenes for simulation and validation; light, near-paper
  editorial pages for lessons, cases, practice and educators. Generous whitespace everywhere.
- **Giant display headlines**, often split across the viewport (a word left, a word right) or bleeding off an edge,
  with a three-to-five-word caption beneath. Body text small, set in columns on a grid. Facts fold into accordions.
- **One hero object travels through the whole site as the visitor scrolls:** the current scenario's
  concentration–time curve as a 3D ribbon, drawn live from the engine. It glows in dark sections and turns to a
  solid graphite material in light ones, and it passes over the headlines. Doses arrive as pulses along it; the
  therapeutic window is a translucent plane. Where a product site would use a photograph, DoseCurve uses a scene the
  engine renders, with fog for depth. No photography, no generated media.
- **One pill-shaped primary action pinned bottom-centre** on every screen ("Open the simulator" on the landing, the
  screen's main action inside the app), and a **minimal top bar**: links left, DoseCurve centred, utilities right.

The 2D chart stays in the simulator as the precision instrument, over the stage, because students read numbers from
it. The first two plans for 2.0 supplied the tokens, type, components and checks below (sections 1–8); sections 9 to
11 are this brief's stage, sequence and stages. The reference sheet named in the brief
(`~/Downloads/dosecurve-reference.png`) wasn't on the build machine, so the brief's written description is the
reference: rhythm, type scale, spacing, restraint, and how the hero object moves.

## 1. Colour

Two themes, each designed for its own room, not one inverted from the other.

**Dark: the instrument.** For a laptop at night and the default when the system is dark. A graphite instrument face;
the curve is the brightest thing on it.

| Token | Name | Value | Role |
| --- | --- | --- | --- |
| `--c-page` | Basalt | `#0B0D11` | page; also the inset wells (chart plot area, inputs, segmented tracks) |
| `--c-surface` | Graphite | `#12151B` | panels |
| `--c-raised` | Slate | `#1C2029` | raised controls: the segmented thumb, buttons, hover |
| `--c-line` | Rule | `#2A303B` | panel edges and dividers (decorative only) |
| `--c-text` | Bone | `#E8EBF0` | text, values |
| `--c-muted` | Fog | `#9AA3B2` | secondary text, units, axis labels (7.2:1 on Graphite) |

**Light: the classroom and the handout.** For projectors, bright rooms and paper. Cool paper on a light bench (no
cream), ink-dark text, the chart's lines heavier and its grid firmer so they survive a washed-out projector.

| Token | Name | Value | Role |
| --- | --- | --- | --- |
| `--c-page` | Bench | `#ECEEF1` | page |
| `--c-surface` | Paper | `#FFFFFF` | panels |
| `--c-raised` | Wash | `#F4F5F7` | wells, raised controls |
| `--c-line` | Rule | `#D3D8DF` | panel edges and dividers |
| `--c-text` | Ink | `#121720` | text, values |
| `--c-muted` | Pencil | `#545E6D` | secondary text (6.6:1 on Paper) |

Derived from these: `--c-text-2` (prose, between text and muted) and `--c-line-strong` (input and control edges,
3:1 against their surface, WCAG 1.4.11).

**One luminous accent, kept for the curve and the primary action.**

| Token | Dark | Light | Used for |
| --- | --- | --- | --- |
| `--c-accent` | Phosphor `#4CC7EE` | Cerulean `#0670A3` | the concentration curve, the primary button, focus rings, the active tab and segment, slider fill |

A cool cyan-blue, the colour of a monitor trace. It is not used for decoration, headings or borders.

**The window band: a quieter hue.** `--c-band` Sage, `#6FC79B` (dark) and `#1A7D4E` (light), filled at 9–12%
between MEC and MTC. "In window" text uses the same hue.

**Semantic thresholds.**

| Token | Dark | Light | Meaning |
| --- | --- | --- | --- |
| `--c-mec` | `#E9B04A` | `#985600` | MEC, below the window, sub-therapeutic |
| `--c-mtc` | `#F2697A` | `#BE2338` | MTC, above the window, toxic |
| `--c-mic` | `#A89BFF` | `#5847C7` | MIC, unbound level, steady-state troughs |
| `--c-b` | `#E58AD8` | `#A3368F` | scenario B in Compare |
| `--c-ghost` | `#8D96A8` | `#6B7383` | the baseline curve (dashed) |

Every text use passes 4.5:1 on its surface; every chart line passes 3:1. Colour never carries meaning alone: MEC and
MTC are labelled on the chart, the window state is written out ("in window", "above MTC"), the baseline is dashed.

The charts read these tokens when they draw (no CSS filter, no inverted copy), so the light theme's charts are drawn
for paper and the PNG export matches the theme on screen.

## 2. Type

Two families from Google Fonts, served from the site itself (no third-party request) and preloaded:

- **IBM Plex Sans** (variable, 400–600): every word. An engineering grotesque with open apertures that stays legible
  at 13 px on a projector.
- **IBM Plex Mono** (400, 500): every number with a unit, axis ticks, symbols (t½, kₐ, CL), keys, codes. Its figures
  are tabular and lining, so readouts don't jitter when they change. Plex Sans's default figures are also tabular, and
  the page sets `font-variant-numeric: tabular-nums` throughout.

Fallbacks are metric-matched (Arial with `size-adjust: 101%`, `ascent-override: 101.5%`, `descent-override:
27.2%`; Courier New at 100%), computed from the font files, so the swap moves nothing (CLS 0).

| Step | Size / line | Weight | Use |
| --- | --- | --- | --- |
| display | 30–44 / 1.08 | 600, −0.02em | hero heading only |
| title | 20 / 28 | 600 | panel and view titles, dialog titles |
| heading | 16 / 24 | 600 | lesson, case and worksheet titles |
| body | 15 / 1.6 | 400 | prose: lessons, cases, explanations |
| ui | 14 / 20 | 500 | buttons, tabs, segments, labels |
| small | 13 / 1.5 | 400 | notes, captions, legends |
| micro | 12 / 16 | 500 | units, tags, table heads (the floor for text) |
| readout | 22 / 1 (hero 32) | Mono 500 | readout values |
| value | 13–14 / 1 | Mono 500 | slider values, inputs |

Sentence case everywhere. No all-caps labels, no letter-spaced eyebrows.

## 3. Space, radius, elevation

- **Spacing** on a 4 px grid: `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-5` 24, `--s-6` 32, `--s-7` 48, `--s-8` 64.
  Panels pad 24 (16 on phones); controls stack at 16; sections at 32.
- **Radius**: `--r-1` 4 (tags, keys, the segmented thumb), `--r-2` 6 (inputs, buttons, segments), `--r-3` 10 (panels,
  dialogs). Round only for switch knobs and the dose markers. Small radii read as machined, not soft.
- **Elevation**, by surface step first and shadow last:
  - −1, the stage: the 3D scene (or its CSS version) fixed behind everything.
  - 0, the page, over the stage only where nothing else is.
  - 1, panels: glass over the stage, the surface colour at 78% (dark) or 84% (light) with a 24 px backdrop blur, a
    1 px edge and a soft shadow. The opacity is set so every text colour stays at AA even if the stage behind were a
    flat 35% mix of the page and the accent, far brighter than a blurred ribbon ever is (muted text 6.4:1 in dark,
    5.9:1 in light). Without backdrop-filter support the panels are opaque.
  - Inset wells (chart area, inputs, tracks) go one step *down*, to the page colour.
  - 2, the tooltip and toast: raised colour, a soft shadow.
  - 3, dialogs: the only large shadow, over a plain dimmed backdrop.

## 4. Motion

| Token | Duration | Use |
| --- | --- | --- |
| `--t-fast` | 120 ms | hover, press, exits |
| `--t-base` | 200 ms | segment thumb, tab indicator, readout value changes, slider bubble |
| `--t-slow` | 320 ms | disclosure open, toast enter |
| hero | 1200 ms | the curve draws; the band settles from 300 ms; the readouts count over the draw |

Easing: `cubic-bezier(.2,.8,.2,1)` to enter, `cubic-bezier(.4,0,1,1)` to leave (exits faster than entrances). Only
`transform`, `opacity` and the curve's `stroke-dashoffset` animate. Nothing moves on its own except the hero draw,
once per visit. With `prefers-reduced-motion: reduce` the hero shows its final state at once, values change without
tweening, and the thumb and indicator jump.

**Micro-interactions that answer an action**: a crosshair (vertical and horizontal) and a reading follow the pointer on
the chart; a slider shows its value in a bubble above the thumb while it's dragged or focused; the tab indicator
slides to the chosen tab; the segment thumb slides to the chosen segment; a readout's number runs from its old value
to its new one in 200 ms.

## 5. Layout

Content width 1280 px. The controls column is 340 px and sticky on wide screens; the workspace takes the rest.
Breakpoints: 960 (one column), 640 (phone layouts for lists), 480 (phone gutters, 16 px). At 360 px nothing scrolls
sideways: the tab bar and the comparison table scroll inside themselves.

### Desktop, 1440

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ⌒ DoseCurve                                       [Light theme ○] [Present] Source code │ 56
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                    │ ┌ Default scenario ─────────── 500 mg oral, t½ 4 h ┐│
│ Watch a dose move through          │ │ 12 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ MTC ││
│ the body, in real time.            │ │    ░░╭──╮░░░░░░░░░░░░░░░░░░ window ░░░░░░░░░░░ ││
│                                    │ │    ░╱░░░╲░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ││
│ Change a drug, a patient or a      │ │  2 ╱┄┄┄┄┄╲┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ MEC ││
│ regimen and see the curves ...     │ │   ╱       ╲___________________                   ││
│                                    │ │   0        6        12        18        24 h     ││
│ [Try the PK/PD Lab] [Start a       │ ├──────────────┬──────────────┬──────────────────┤│
│  lesson] [Compare regimens]        │ │ Cmax         │ AUC          │ Time in window   ││
│ (i) Educational model, not for     │ │ 9.3 mg/L     │ 74.2 mg·h/L  │ 48 %             ││
│     clinical dosing.               │ └──────────────┴──────────────┴──────────────────┘│
├──────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Route and regimen        │ Simulator  Compare  Lessons  Cases  Practice 42             │
│ [Oral▮|IV bolus|Infusion]│ ━━━━━━━━━                                                   │
│ [Single▮|Repeated|Custom]│ Plasma concentration–time       [Linear▮|Log] ○Effect ○Pop. │
│                          │ Single oral dose                                            │
│ Drug parameters          │ ── Current  ▭ Therapeutic  ┄ Toxic                          │
│ Dose          ┌500 mg┐   │ ┌ well ──────────────────────────────────────────────────┐ │
│ ━━━━━━━●───────────────  │ │                    the curve                           │ │
│ Bioavailability    0.9   │ │                                                        │ │
│ ━━━━━━━━━━━━━━━━━●─────  │ └────────────────────────────────────────────────────────┘ │
│ ...                      │ ⟨dose⟩ ⟨peak⟩ ⟨trough⟩ Final τ           ▶ Play [1×|2×|4×]   │
│ Patient                  │ ┌Cmax──┬Tmax──┬t½────┬CL────┐  one readout block,         │
│ Therapeutic window       │ │9.3   │1.88  │4.0   │6.07  │  divided, not eight cards   │
│ [MEC 2  ] [MTC 12 ]      │ ├Vd────┼AUC∞──┼Dose──┼In win┤                             │
│ Drug library             │ │35    │74.2  │7.1   │48 %  │                             │
│ Analyze and export       │ └──────┴──────┴──────┴──────┘                             │
│ (sticky, scrolls inside) │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ time budget  below · in · above           │
│                          │ What changed (baseline)                                     │
└──────────────────────────┴─────────────────────────────────────────────────────────────┘
  footer: disclaimer · privacy · model · validation · links, in a quiet two-column block
```

### Phone, 390

```
┌──────────────────────────────┐
│ ⌒ DoseCurve      [○] [▣] [⌥] │ 52, icon buttons keep their text for readers
├──────────────────────────────┤
│ Watch a dose move through    │
│ the body, in real time.      │
│ Change a drug, a patient...  │
│ [Try the PK/PD Lab        ]  │ full-width primary
│ [Start a lesson][Compare  ]  │
│ (i) Educational model, not   │
│     for clinical dosing.     │
│ ┌ Default scenario ────────┐ │
│ │  curve, band, MEC, MTC   │ │
│ ├────────┬────────┬────────┤ │
│ │Cmax    │AUC     │In win  │ │
│ │9.3     │74.2    │48 %    │ │
│ └────────┴────────┴────────┘ │
├──────────────────────────────┤
│ Route and regimen            │ controls panel
│ ...                          │
├──────────────────────────────┤
│ Simulator Compare Lessons ▸  │ tabs scroll inside
│ chart, full width            │
│ ⟨dose⟩⟨peak⟩ ▶ Play          │ wraps
│ readouts 2 × 4               │
│ ...                          │
└──────────────────────────────┘
```

## 6. Components

- **Segmented control**: an inset track (page colour) with a raised thumb that slides under the chosen segment. The
  chosen label is text colour, the others muted. 36 px tall (44 px on touch screens).
- **Slider**: the name on the left, the value on the right in Plex Mono, the track 4 px with the filled part in the
  accent, a 16 px thumb with an accent ring. While it's dragged or focused, a bubble above the thumb repeats the value.
- **Toggle**: a small switch (track and knob) in front of the label, for Effect, Population, the theme and the
  single-key shortcuts. `aria-pressed` and checkboxes keep their semantics.
- **Tabs**: text tabs on the panel's edge, an accent bar 2 px tall sliding to the chosen one.
- **Readouts**: one block divided into cells by 1 px rules. Label in Plex Sans 12, value in Plex Mono 22, unit muted.
  The key readouts (Cmax, time in window) take the accent colour for their value only.
- **Buttons**: primary (accent fill, page-colour text) appears once per view; secondary (raised, edge); quiet (text
  only) for inline actions. No arrows appended to labels; a link out says where it goes.
- **Lists** (lessons, cases, drugs): rows in a divided list or a two-column grid of rows, with the title, a short
  line and a status. Not a wall of identical cards.
- **Focus**: a 2 px accent ring with a 2 px offset in both themes (9:1 in dark, 5.4:1 in light), never removed.
- **Disclaimer**: the clinical surfaces (hero, simulator patient and library panels, cases, footer) each keep their
  "Educational model, not for clinical dosing" line, in muted text with an info glyph.

## 7. Critique against the generic tells

The first plan was checked against a list of generic looks; most fixes stand. The replacing brief asks for two of
them on purpose (glass, gradients), so they are used where they carry meaning and nowhere else:

| Tell | Where it stands in 2.x |
| --- | --- |
| Cream background, terracotta accent | Not used. Cool paper in light, blue-graphite in dark; the accent is a cyan-blue trace colour |
| Near-black with acid green | Not used. Green survives only as the 10% sage window band |
| Hairline broadsheet | Rules only where an instrument has them: the readout block, table rows, panel edges |
| Identical rounded cards, same shadow | Readouts are one divided block; lessons and the glossary are lists; cases are tiles; drugs a selectable list; one panel radius |
| Gradient washes | Only in the CSS version of the stage (no WebGL, effects off, offline), where gradients stand in for depth. Never on text, buttons or panels |
| All-caps eyebrow labels | None. Sentence case throughout |
| Middle-dot meta strings | None in the interface; the dot survives inside formulas and data lists |
| Arrows appended to links | None. An arrow means a change of value (500 → 750 mg) |
| Glassmorphism on content panels | Asked for by the brief. Done as frosted glass at 78–84% with a computed contrast floor, never as see-through cards with text over a bright scene |
| Glow on everything | Only the ribbon is luminous, from additive blending of its own geometry; nothing else glows |
| Particle or parallax backgrounds | No particles. The stage's only motion is data and the camera, and the camera moves only when the visitor scrolls or changes tabs |

## 8. Verification

At every stage: screenshots at 1440 and 390 (and 1024 for layout) in both themes, plus present mode and print,
reviewed as a design lead and fixed; then the test suite, axe in both themes over every main state, Lighthouse
(accessibility 100 everywhere, mobile performance at least 85 on every URL, CLS 0), the stylesheet under 250 KB and
the initial script inside its existing budget.

## 9. The stage and the hero object

The stage is a canvas fixed to the viewport, decorative (`aria-hidden`), drawn by `stage.js` with Three.js (pinned
0.186.1 from cdnjs, with sha512 integrity in an import map, loaded after the first paint). It renders only when
something changes.

- **The ribbon.** The scenario's curve as a strip with depth, x for time, y for concentration. In a dark section its
  core is the accent, blended additively with a soft halo of the same geometry (luminous, not a glow filter). In a
  light section it is solid graphite, lit by one key light and an ambient fill, with a faint shadow-coloured curtain
  beneath it. It is rebuilt from the curve the 2D chart already sampled, so they never disagree.
- **The window** is a translucent sage plane behind the ribbon, MEC and MTC its edges in their own colours.
- **Doses** are rings on the time axis that send out a pulse when they're given (in the sequence, as the curve
  reaches them; in the app, when the schedule changes).
- **Depth** comes from fog and a floor grid that fades with distance; nothing is blurred by a filter.
- **Layering.** In the root sequence the canvas sits over the headlines (the object passes in front of the words)
  but under the top bar, the captions' column and the pill. In the app it sits behind the glass panels.
- **Effects.** The utilities' Effects switch turns the 3D stage on or off (kept in this browser); it starts off on
  weak devices (reduced motion, under 4 GB of memory, under 4 cores, Save-Data). Phones get the single ribbon. Without
  WebGL, offline, or with Effects off, the CSS stage stands in: soft light sources, the curve as an SVG path in
  perspective, and each scene's frame drawn in SVG from the same engine numbers.
- Present mode and print are plain: no stage, no pill.

### Camera framing per screen

| Screen | Section | Framing | Object |
| --- | --- | --- | --- |
| Root sequence | Alternating (section 10) | Keyframes per scene, interpolated by scroll | Ribbon, then each scene's object |
| Simulator (2.1) | Dark | Three-quarter view from front left, ribbon right of centre behind the glass instrument panels | Live scenario, baseline ghost, dose pulses, population cloud |
| Compare (2.1) | Dark | Pulled back and raised, two ribbons separated in depth | A and B |
| Lessons (2.2) | Light | Each lesson: its split headline, the ribbon passing through it in graphite | That lesson's scenario |
| Cases (2.2) | Light | A dossier: facts in accordions, a dark levels panel with the ribbon | The case's regimen |
| Practice, Fit, Hit the window (2.2) | Light console | Far and still | The problem's curve |
| Validation (2.3) | Dark | Facing a sphere of points, one per check, lighting to 100%; "Validated" behind it | The checks |
| Educators (2.3) | Light | Wide and calm | The default ribbon |

## 10. The root sequence

Every visit to the root address with no `#` part opens on the sequence, the first or the hundredth (2.10; before,
only a first visit did). Any lesson, case, practice, worksheet or share link, `#app`, the embed view and present mode
go straight into the app. Reaching the app from the sequence adds one history entry (`#app`), so the browser's back
returns to the sequence and forward to the app, without a reload; the top bar's DoseCurve wordmark (Home) brings the
sequence back from anywhere. The pill reads "Open the simulator" throughout and lands in the simulator.

| # | Section | Headline (split) | Caption | Small print (columns) | Object and camera |
| --- | --- | --- | --- | --- | --- |
| 1 | Dark | Dose ··· Curve (Maati ··· Rx in 2.20) | Watch a dose move. | Cmax, AUC, time in window of the default scenario, counting as the ribbon draws; the disclaimer | The default curve draws itself once (1.2 s) between the two words; the window settles in. Camera low, rising |
| 2 | Light | Every ··· dose | drawn from the model | Four columns: simulate, compare, learn, check, one sentence each | A glass figure, the model's one compartment, its level the default scenario's concentration (2.11) |
| 3 | Dark | Simulate (bleeds off the right edge) | Doses arrive as pulses. | The regimen, in one line | Every 8 h, six doses: the curve draws to a cursor the scroll moves, each dose pulses as it is reached. Camera tracks the cursor |
| 4 | Light | Learn | 200 patients, one median. | Population settings, in one line | 200 virtual patients from the app's population mode, in graphite, drawing in to their median. Camera pulls back, then closes |
| 5 | Light | Cases | Two phases, one patient. | Sixteen graded cases, one line | A two-compartment bolus splitting into its distribution and elimination phases on a log scale. Camera orbits a quarter turn |
| 6 | Dark | Exposure | Time above the MIC, counted. | Two counters (fT>MIC for each infusion); piperacillin against an MIC, one paragraph (2.11) | One steady-state interval as a 30-minute and a 3-hour infusion against the MIC; a culture dish under each, dimming by its share of time above the MIC |
| 7 | Light | Rebound (right) | The level returns after dialysis. | The amount removed, counting; the session in one paragraph (2.11) | A two-compartment course through a session: a dialyzer that runs while it lasts, then the rebound, ringed |
| 8 | Dark | Validated (behind the object) | Every check, within tolerance. | The count, the solver, the tolerance | A sphere of points, one per check against the independent solver, lighting to 100% as the engine's values are compared, inside a glass globe on a brass stand (2.11). Camera faces it, turning with the scroll |
| 9 | Dark | Open ··· DoseCurve | Free, in your browser. | The disclaimer | The camera flies into the globe and out to the simulator's curve |

Captions are three to five words; small print is 13 px in columns. Every number in a scene is in its text too.

## 11. Stages

| Release | Scope |
| --- | --- |
| 2.0.0 | Shell (top bar, pill, alternating sections), tokens, type, glass, the stage and its CSS version, Effects, the root sequence |
| 2.1.0 | Simulator and Compare as dark scenes: instrument panels over the stage, the time cursor on the ribbon, the population cloud, the pill's actions |
| 2.2.0 | Lessons, Cases, Practice, Fit the data, Hit the window as light editorial pages with split headlines and accordions |
| 2.3.0 | Validation (the sphere), Educators, README, screenshots, OG image |

## 12. Storyboard: 2.1 simulator and compare

The simulator is a dark scene: the glass instrument panels sit over the stage, and the stage answers what the
instrument does. The 2D chart stays the precision instrument; the ribbon is its shadow in space.

| Moment | On the instrument (2D) | On the stage (3D) | Camera |
| --- | --- | --- | --- |
| A setting changes (slider, segment, drug) | The chart redraws | The ribbon eases into its new shape over about 250 ms instead of jumping; the window plane and dose rings follow | Holds the simulator framing |
| A new schedule (repeated, custom, a dose moved) | Dose ticks move | Each dose ring sends out a pulse, in the order the doses are given | Holds |
| The time cursor (drag, arrow keys, Play) | The cursor line and its readout | A marker rides the ribbon at the same time: a bright point on the curve, a thin line down to the floor, a ring where it meets the floor | Holds; Play keeps the marker moving with the cursor |
| Population on | Bands of the middle 90% | A cloud of the virtual patients' curves (up to 150 drawn, from the same sampler and seed as the app's population mode) around the ribbon | Holds |
| Baseline set | Dashed ghost curve | A dim ghost ribbon behind the live one | Holds |
| Compare | A and B curves, What changed | Two ribbons in their own colours, B in front of A; the window plane between | Pulls back and up to separate them |
| Present mode, print | Plain | No stage | — |

On phones the stage keeps the single ribbon (no cloud, rings or plane); the marker still rides it. With reduced
motion, shapes and the marker jump instead of easing.

## 13. Storyboard: 2.2 lessons, cases, practice, fit and hit the window

These are the paper pages. Opening one turns the app's palette to paper (the top bar, the panels, the charts and the
stage's ribbon, now graphite), and a masthead above the panels carries the screen's giant split headline and its
caption. The ribbon crosses the masthead, over the words and under the caption; the panels sit over the ribbon.

| Screen | Masthead (split) | Caption | The page | Pill |
| --- | --- | --- | --- | --- |
| Lessons | Guided ··· lessons | Predict first, then check. | The list, in groups, as rows | Start a lesson (the first not yet done) |
| A lesson (in the simulator) | its title, split at the middle word | Lesson n of 34 | The lesson bar (goal, predict, try this, challenge) over the chart | Next lesson |
| Cases | Clinical ··· cases | The patient's own numbers. | Case tiles; a case is a dossier: the facts as an open accordion, the levels in a dark panel, the task and its form, the walkthrough, what a pharmacist also weighs and the sources as accordions | Open a case, then Check regimen |
| Practice | Practice | Generated, checked, explained. | A console: topics, the problem, the answer, the worked solution | Check the answer, then Next problem |
| Fit the data | Fit the ··· data | Estimate from the measurements. | The fit bar over the chart | New data set |
| Hit the window | Hit the ··· window | Choose a dose and an interval. | The task bar over the chart | New drug |

Camera: high, so the ribbon runs across the masthead above the panels' top edge (Cases a little to the right,
Practice further and dimmer). On narrow screens the page's panel comes before the controls. The simulator and
Compare stay dark; leaving a lesson or task returns them.

## 14. Storyboard: 2.3 validation, educators, README and link previews

| Screen | Section | Picture | Words | Camera and motion |
| --- | --- | --- | --- | --- |
| Validation | Dark (paper in the light theme) | A sphere of points, one per comparison the page runs (712 at 2.3, 718 from 2.6, 727 from 2.17, 735 from 2.19) against the independent solver, on a faint wireframe; each lights as its check passes (a failed check would turn red) | "Validating" behind the sphere while the checks run, then "Validated" when all pass ("Checked" if any fails); the page's own heading, summary and tables follow | The sphere turns a little as the visitor scrolls; nothing moves on its own except points lighting as checks finish. Without WebGL or with Effects off, the front half of the sphere as SVG dots, lighting the same way |
| Educators | Paper, always | The default curve as a graphite line drawn from the engine, crossing the headline | "For ··· educators", caption "Teach pharmacokinetics with it." | Still |
| README | — | New screenshots: the opening sequence, the simulator, a lesson, a case dossier, the validation sphere | — | — |
| Link previews (OG) | Dark | The first screen of the sequence: "Dose ··· Curve" ("Maati ··· Rx" in 2.20) with the ribbon passing between, rendered from the engine | the caption | — |

## 15. 2.4: When to sample, and the case of the day

**When to sample** sits under the steady-state chart's four readouts, as a closed accordion with a hairline above it, like the sensitivity panel. Its summary is one line: the title, then "the model's times for this regimen" in the muted tone. Opened, it shows three columns in the readouts' type (a small muted label, the value in Plex Mono with tabular figures, a short sentence under it): *Steady state* (dose n), *Peak* and *Trough* (hours from the first dose). Peak and Trough each have a small **Show** button that moves the time cursor there, and the chart's focus with it. Below them is a note in small muted text, at most 62 em wide. On a phone the columns stack. It takes the panel's tone (dark in the simulator, paper in the light theme) and adds no colour of its own.

**The case of the day** is the first card in the case list, two columns wide, with "Case of the day" in the accent colour above its title. The other cards follow in their usual order.

## 16. Storyboard: 2.10, one world and one camera

**The world.** The scenes sit along x (hero and "Every dose" at 0, Simulate 24, Learn 48, Cases 72, Validated 96, the simulator at 120; since 2.11 the figure at 12, Exposure 96, Rebound 120, Validated 144 and the simulator at 168), close enough that the next comes into view as the camera travels. A thinner strand of the ribbon joins each scene's curve to the next and passes under the sphere to the simulator's own curve. The floor is one plane under everything: a faint grid that recedes into exponential fog and, in tier 2, a blurred mirror.

**The camera.** Three resting frames per scene, at 18%, 50% and 82% of its pinned screen, on one Catmull–Rom path; each segment eases in and out, so the camera dwells where a beat rests. The scroll drives it through an inertia filter (14% of the remaining distance per frame). When scrolling stops within a tenth of a screen of a resting frame, the page settles there. Reduced motion holds each scene's last resting frame.

| Scene | Tone | Beats (by scroll) | Headline |
| --- | --- | --- | --- |
| Cold open | black (paper in the light theme) | first light from 0.6 s (or when the stage arrives), the ribbon draws over about 1.9 s with a point of light at its head, the camera pulls back from the peak, the wordmark is unmasked from 1.15 s; the scroll cue at 4.2 s | "Dose ··· Curve" ("Maati ··· Rx" in 2.20) |
| Hero | dark | the window rises (28–56%), the readouts land one by one (60–94%) | in at once |
| Every dose | paper | a low glide along the graphite ribbon | in as it arrives |
| Simulate | dark | one dose (to 8 h), a second stacking on the ghost of the first (to 16 h), the climb to steady state (to 48 h) with the camera following | right, bleeding |
| Learn | paper | 200 patients appear one by one (points), then condense into the band and the bronze median | left |
| Cases | paper | the camera dives in, the axis turns logarithmic (32–62%), the two phases separate (68–95%) | right |
| Validated | dark | the checks light one by one as the camera stays close, then it pulls back to the sphere | centred, behind |
| Open | dark | the camera flies to the simulator's place; its curve is there | split |

**The look.** Dark scenes: deep blue-black, a warm key and a cool rim, one warm accent (the shafts and the dust), the ribbon's core emissive and blooming. Paper scenes: near-white, graphite with clearcoat, bronze for the median, no bloom, almost no aberration. Grain and the vignette are a CSS layer over the whole frame. The focus pulls to the headline as it arrives or leaves and racks back onto the ribbon as the camera settles.

## 17. Storyboard: 2.11, objects in the scenes

Each scene gains one object, lit and shot like product photography: clear or frosted glass, brass, graphite caps, a
luminous liquid. All are built in `stage.js` from Three.js primitives (lathes, capsules, cylinders, tori, instanced
meshes and point sprites). There are no model files, so there is nothing under `assets/` and no loader to fetch. **No
object moves on its own: every motion is a number from the engine, at the time the scroll has reached.**

| Scene | Object | What moves it (the engine) |
| --- | --- | --- |
| Hero | A two-tone capsule at the curve's start, dissolving (dithered) as it empties; particles leave it and land on the ribbon, drawing it | The amount left in the capsule, D·e^(−ka·t), at the time drawn. Particle i leaves at −ln(1 − Fᵢ)/ka for evenly spread Fᵢ (so their times follow absorption) and lands on the curve at that time |
| Every dose | A frosted-glass figure (a lathe): the body as one compartment, with its capsule dissolving inside, and hairline rings at the MEC and MTC | Its liquid stands at C(t) of the default scenario (clipped at that height); the capsule follows e^(−ka·t); a marker on the hero's ribbon shows the same t |
| Simulate | A capsule at each of the six doses, on its ring | Each dissolves from its own dose time, e^(−ka·(t − t_dose)), as the curve draws past it |
| Learn | 200 glass vials with crimp caps, one per virtual patient (the cloud's own patients) | Each fills to its patient's level as t runs to 4 hours, then they sort by that level: the middle 90% lit in the band's colour, the middle two (the median) in bronze, the tails grey. The same numbers are in the text |
| Cases | Two glass chambers joined by a tube, the central and the peripheral compartment | Their liquids are A₁(t) and A₂(t) as shares of the dose (A₁ = C·V₁; A₂ = D·k₁₂·(e^(−βt) − e^(−αt))/(α − β), checked against pk-hd.js's state). The tube's particles going out and back are in proportion to k₁₂·A₁ and k₂₁·A₂ |
| Exposure | Two culture dishes (glass, agar, 90–150 glowing colonies), one per infusion | Each dims by the share of the interval so far with the unbound level above the MIC (micStats' crossings, ending on its own fT>MIC), and the counters count it. A visual cue, said so in the text; not a model of bacterial killing |
| Rebound | A dialyzer: a glass cartridge of hollow fibres, capped, on a brass stand | During the session (pk-hd.js's schedule) the fibres glow and blood and dialysate stream through in proportion to the removal rate, CLd·C(t); between sessions it is dark. The rebound is ringed at sessionTable's peak, and the counter is the amount removed so far (stateAt) |
| Validated | The 584-point sphere inside a glass globe in a brass armillary (a meridian and a horizon ring) on a turned stand | The points light as the checks pass (the same comparison the validation page runs) |
| Open | The camera flies into the globe, whose glass clears as the camera nears it, among the checks and out to the simulator | — |

Reduced motion shows each object at its final state: the figure at Tmax, the vials sorted, both dishes and counters
at their final values, the session over with its rebound ringed. Phones get the capsule, the figure and the vials with
tier 1's simpler materials; the other scenes keep their SVG frames (which show the same numbers: the MIC's shaded
time, the session's hours and the rebound).

**Cost.** The vials' glass is a clear sheen without transmission (200 overlapping transmissive vials made 50–100 ms
frames). Shaders compile group by group before the sequence plays, the other tone's once the cold open is over and
the page is idle. pk-hd.js loads for the dialysis scene a scene ahead.

## 18. 2.12: the instrument panel

**Type.** Inter for every word and number, with tabular lining figures throughout (the body sets them). Newsreader,
light, for display: the chart's title, the readouts' large numbers, the steady-state numbers, a worked readout's
heading. Labels are small, muted and in sentence case (12 px); there are no bold boxed headers. The landing's giant
headlines stay in the sans, at 600, with a stand-in measured on headline text.

**Colour.** Dark: page #07090D, text #ECEEF2, muted #8F96A3; the accent champagne #D8C29D, for the live curve and the
primary action only; scenario B platinum #C2C9D4; MEC #86B2B6, MTC #D38D8D, band #8DBEA4. Paper: page #EFEEEA,
text #15171C, muted #5A5F69, accent brass #7A5B24, B slate #4B5567, MEC #2F6F78, MTC #A83E3E. Hairlines are 9–11%
of the text colour (`--hair`), quieter rules 5–6% (`--hair-2`).

**Glass and AA.** A panel is a 1 px hairline, a 20 px blur, a top inner highlight, a deep shadow, and a fill of 5.5%
white over the page's own colour at 80%. The base matters: the 3D ribbon sits behind the chart, and a blurred glow
through an 80% base raises the background to about #252424 at worst, where muted text is still about 5:1. On phones
the panels are 94% opaque and unblurred. A test checks every text colour against the page, the surface and the
raised colour in both themes (at least 4.5:1), the accent's own text, and the thresholds against the page (3:1).

**Controls.** Segments: text, with the chosen one in a hairline pill that slides to it. Toggles: a 20 × 10 track.
Sliders: a 1 px track, the filled part in the accent, an 11 px thumb with a soft glow; the value is an editable field
(right-aligned, tabular, as wide as the range's longest value) with its unit muted beside it. Buttons are hairline
pills; the primary action alone is filled with the accent. The drug library is a list on hairline rules.

**The chart.** Hairline axes with tick marks, gridlines at 4–6%, the window as a lighter band (4% of the text colour),
MEC and MTC as solid 1 px rules labelled with their values in the margin. Each curve is a 7 px glow (14%; 7% on
paper), a 2 px stroke and a 1 px core mixed 45% toward white; the live curve stands over a vertical gradient of the
accent (20% to nothing). The peak is a ring with a leader to its label, turned away from the chart's edges. The
crosshair is two hairlines, a dot on each curve, a time chip on the axis and a glass value chip. A discrete change
morphs the curves over 300 ms (ease-out cubic); a drag and reduced motion don't.

**Readouts.** One row of large light numbers (Newsreader 300, 31 px), each label above in the sans and each unit under
its number, divided by hairlines; on narrow screens the row wraps into a grid with the same rules.

**The reference image.** The brief named a reference at ~/Downloads/dosecurve-reference.png. It was not on this
machine at any point during 2.12, so the release follows the brief's words; screenshots before and after (simulator,
compare, a lesson, a case; 1440 and 390; both themes) are in the release's pull request.

## 19. 2.13: the chart as an object

Back to front: the grid (in parallax), the window as glass, infusion and dialysis shading, the population's glass, each
dose's own curve, the difference from a baseline, the curves, the thresholds, labels, the axes, the cursor and the
crosshair; particles on a canvas above.

| Element | Dark | Paper |
| --- | --- | --- |
| Curve | 2 px, coloured along its length by state: dim steel below the MEC, champagne lifting to luminous in the window, apricot toward the MTC, coral (#F2785E) past it; a 1 px core 32% toward white; a 4 px glow blurred 4.5 | the same order in ink: slate, brass, rust (#A8432E); no glow |
| Fill | the curve's colour at 25% fading to nothing at the baseline, with a grain tile at 40% | at 25%, grain at 25% |
| Reflection | the curve and fill mirrored under the baseline at 10%, masked to 26 px | the same |
| Particles | 72 points, a 4 px halo at 22% and a 1.1 px white core, coloured by state, one pass every 7.5 s | ink dots, 1.3 px at 45% |
| Window | text colour at 7% with soft 7% edges, 1 px hairlines at 20%, a highlight crossing it every 11 s | 6%, hairlines at 16% |
| Grid | major lines at 5.5%, major and minor ticks on the axes at 40% and 22% | 7% |
| Thresholds | solid 1 px rules at 60%, labelled in the right margin (MTC, MEC, MIC with their values), at least 11 px apart | 70% |
| Doses | 6 px ticks on the baseline that pulse (scale 2.6, 0.7 s) when the play head crosses them; each dose's own curve at 4% fill and 26% line, lit to 16% and 95% | 3.5% and 30% |
| Peak | a 5 px ring with a 1.6 px centre, a 1 px leader (16 px out, 12 px across) to "Cmax 9.3", in the first of six places that fits | the same |
| Baseline | 1 px at 35% of the text colour, no glow; the difference a 12% region blurred 2.5, its largest gap marked and labelled | the same |
| Population | the middle 90% at 7% with 28% edges, the middle 50% at 10%, the median luminous | 7% and 9% |
| Depth | the plane tilts up to 2.2° and 2.8° toward the pointer, the grid moves up to 5 px; a vignette inside the plot only | no vignette |

Motion: the first view draws the curve in 1.3 s (ease-out cubic) with a glowing head; Play reveals it up to the play
head with a 70 px wake; discrete changes morph every layer in 300 ms; the grid crossfades in 0.45 s when the scale
changes. Reduced motion: none of it, and the chart is simply there.

## 20. 2.14: the workspace

At 1100 px and wider, outside the paper pages, present mode and embeds:

| Part | Rule |
| --- | --- |
| Page | full width, 20 px gutters; a 64 px rail and the chart's panel |
| Chart | the plot as tall as the screen less 372 px (at least 380 px), drawn one unit to a pixel; at 1440 × 900 the plot is 1294 × 528 and the panel 1320 wide (92% of the width) |
| Rail | glass, 64 px with a hairline on its right; a pin and one 16 px line icon per section; opens to 380 px over the chart (0.32 s, cubic-bezier(.22, 1, .36, 1)) on hover, focus or a click; Escape or a click elsewhere closes it |
| HUD | the readouts directly under the plot: 28 px light numbers over a faint gradient, a hairline above |
| Focus | F or the toolbar: the top bar, rail, tabs and everything but the head, legend, plot, HUD and inspector hidden; the plot as tall as the screen less 250 px |
| Stage | centred behind the chart; the live ribbon, the window's glass plane, the doses' pulses and the glass figure (at 82%, beside the ribbon's end); a change drifts the camera up to 2.4 units toward its largest difference and back |

## 21. 2.15: motion and tabs

**One value.** The landing's virtual scroll eases toward the real one (lerp 0.1 a frame) and drives the camera, the
scenes' objects and the headlines. A scene is `.on` while u is between −0.32 and 1 (the hero from the start), `.past`
after; the hero's readouts (`.ro`) from u 0.58. Headlines, captions and small print fade and rise in 0.8 s,
cubic-bezier(0.22, 1, 0.36, 1); small print 0.12 s later; the readouts 0.12 s apart. Opacity and transform only.

**Tabs.** A switch crossfades the content in 0.5 s (opacity and 10 px of rise) while the camera moves to the tab's
framing; the top nav's 1 px accent line slides under the open tab in 0.45 s. Back and forward walk the tabs' own
addresses in the page. Dialogs open as glass sheets (20 px radius, 24 px blur, 0.45 s rise).

## 22. 2.18: the chart in 3D

**Hand-over.** The 3D copy's first frame lies on the 2D chart's plotting area (the camera is placed from the SVG's own
box), then the plane tilts and depth arrives over 600 ms on the page's easing; the 2D chart crossfades out under it in
160 ms. Landing reverses it. **Look.** The stage's materials: the ribbon's luminous core in the dark theme, graphite on
paper; the window as frosted glass at tier 2, a quiet plate at tier 1. States are coloured by height, with MEC and MTC
hairlines on the surfaces. **Chrome.** Hairline pills over glass for the views (top left), the target (regimen map) and
the cameras (top right); legend chips and the disclaimer at the foot; labels and readout chips are HTML, 11–12 px Inter
with tabular figures, a halo of the page colour behind the labels. **Phones.** Short view names on one scrolling row,
no camera row, a three-chip legend, taps to read.


## 23. 2.20: the name

**Wordmark.** "MaatiRx", set as the old one was: "Maati" in Inter's strong weight, "Rx" in the light one, beside the
same curve mark. Nothing else in the type, palette or layout changes. **Opening screen.** The first scene splits the
name, "Maati" left and "Rx" right, and the curve passes through the gap, as it did through "Dose" and "Curve". **Preview image.** The link
preview (1200 × 630) is that scene, with the top bar, the pill, the scroll cue and the counter hidden, so the image is
the name, the curve and the caption. **The move.** Two dialogs, the library's own (glass sheet, hairline foot, quiet
buttons): "MaatiRx has moved" at the old address, with what is saved there in a sentence and the privacy line in small
print (after a move: when it was brought, with Go and Bring it again); "Your saved work is here" at the new one, with
Done and Undo.

## 24. 2.21: DoseCurve again

The name returns to DoseCurve; nothing else changes. **Wordmark.** "DoseCurve": "Dose" in Inter's strong weight,
"Curve" in the light one, beside the curve mark, as before 2.20. **Opening screen.** "Dose" left, "Curve" right, the curve
through the gap. **Preview image.** That scene again (1200 × 630), with the page's chrome hidden.
