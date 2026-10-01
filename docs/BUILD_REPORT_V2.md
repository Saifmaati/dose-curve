# DoseCurve build report, Plan V2

Build Plan V2 ran on 2026-09-30, from 1.9.0 (live) to 1.17.1. Each phase is one release, built on its own branch with its own pull request, tests, validation, accessibility and Lighthouse checks; the detail for each is in [BUILD_REPORT.md](BUILD_REPORT.md) (sections 19 to 27), the reasoning in [DECISIONS.md](DECISIONS.md) (79 to 115), and the times and commits in [BUILD_LOG.md](BUILD_LOG.md).

## Releases

| Release | Phase | What it adds | PR |
| --- | --- | --- | --- |
| 1.10.0 | A | Lesson texts in a lazily loaded file (initial script +23.7% → +10.0%); tags v1.0.0–v1.9.0 | #12 |
| 1.11.0 | B | Bayesian (MAP) individualization from measured levels; two Bayesian cases; lesson *One level and a prior* | #13 |
| 1.12.0 | C | Instructor tools: write a case (checked for a solution), assignments, completion codes | #14 |
| 1.13.0 | D | Antimicrobial PK/PD: fT>MIC on the unbound level, Cmax/MIC, AUC24/MIC; piperacillin-tazobactam; two lessons; a practice topic; a reduced-CrCl case; community fT>MIC targets | #15 |
| 1.14.0 | E | Indirect responses (the four types of Dayneka, Garg and Jusko); a warfarin-like lesson; the drug sources moved to a lazy file | #16 |
| 1.15.0 | F | Hemodialysis sessions, exact between events; the gentamicin case from its label; a lesson | #17 |
| 1.16.0 | G | Sensitivity analysis: ±20% on each input, tornado chart, the dominant input named | #18 |
| 1.17.0 | H | Educator page; named tab links; README screenshots; validation page responsiveness; Lighthouse ≥ 95 | #19 |
| 1.17.1 | I | Fixes from the engineer's and pharmacist's review passes and the 1,000-seed cross-check | (this release) |

## Numbers

| | 1.9.0 | 1.17.1 |
| --- | --- | --- |
| Guided lessons | 29 | 34 |
| Clinical cases | 12 | 16 |
| Practice problem kinds | 37 | 42 |
| Glossary terms | 55 | 69 |
| One-click comparisons | 23 | 27 |
| Library drugs | 11 | 12 |
| Tests (files) | 294 (12) | 355 (19) |
| Comparisons with the independent solver | 584 | 712 |
| Initial script over the Phase 0 baseline (limit 25%) | +23.7% | +21.8% |
| Lazily loaded, hash-stamped files | 5 | 11 |

Every model added in this plan is checked against an independent SciPy implementation on the validation page: the MAP estimates (20 scenarios, agreement about 1e-7), the antimicrobial indices (12, about 1e-9), the indirect responses (12, about 1e-8) and dialysis (8, about 1e-12). Each also has closed-form tests: the IV-bolus fT>MIC formula, exact 100% for a continuous infusion above the MIC, the indirect response's plateau and time constant at a constant level, dialysis mass balance (what the body clears plus what the dialyzer removes is what was given), and the sensitivity of AUC24 to clearance (+25% / −16.7%).

## Review passes (Phase I)

**Engineer.** Each new model was checked against every other one it can meet:

- *Population mode on dialysis*: the Web Worker loaded only the engine, so its bands ignored the sessions. The page now passes the dialysis model's stamped address too, and a test checks the median follows the sessions.
- *Bayesian estimate on dialysis*: it assumes constant clearance between levels; the panel now says dialysis isn't covered instead of giving an estimate.
- *Session edges*: a dialysis session starts and ends with a kink in the curve. The window statistics and the dose-by-dose peak search didn't include them as grid points, so a peak sitting exactly at a session start could be missed by up to 4e-5 (found by the cross-check); the indirect-response integrator stepped across them. All three now include them.
- *Sensitivity off steady state*: the AUC was read over the first 24 hours, which is zero for a custom schedule that starts later. It now reads the AUC over the time window, and the button says AUC.
- Earlier in the run: a null readout stopped one render (1.15.0, now shown as "—"); a chart label ran off the right edge (1.17.0).

**Pharmacist.** Every new case, lesson, glossary entry and panel note was read for claims a source doesn't support:

- The post-dialysis rebound entry said a later level would be higher "an hour or two" after a session; the timing isn't sourced and was removed.
- Numeric targets: only vancomycin's AUC24/MIC (400–600, Rybak 2020) is shown. The β-lactam and aminoglycoside sources checked (Craig 1998, Moore 1987) state no single number in their abstracts, so none is shown, and the panel says why.
- The cases grade against what a label states (the piperacillin renal table; gentamicin's 1–1.7 mg/kg after each session) and present extended infusion, supplemental doses and lesson regimens as comparisons, not instructions.
- The warfarin-like lesson takes its half-life, volume, absorption and the clotting factors' turnovers from the warfarin label and reports no INR.

## The 1,000-seed cross-check (not committed)

A script in the scratchpad draws 1,000 random scenarios (every route and regimen, one and two compartments, clinical patients, dialysis in a third of the one-compartment ones, custom schedules) and checks the new models against brute-force readings of the engine's own curves:

| Check | Largest difference |
| --- | --- |
| Window peak against a dense scan | 3e-15 (relative) |
| fT>MIC against 20,000 samples of the steady state | 0.005 percentage points |
| AUC24/MIC against F·S·D/CL | 2e-9 (relative) |
| Dialysis mass balance | 5e-9 (relative) |
| Session removal against Simpson's rule on the curve | 2e-8 (relative) |
| Indirect response against an independent 0.002 h RK4 | 8e-5 at one point (the reference is read at the nearest 0.002 h step, not the exact hour; everywhere else under 2e-5) |
| Sensitivity: dose +20% → AUC +20% | 5e-13 percentage points |

Its first run found the session-edge peak and the sensitivity window above; after the fixes, 999 of the 1,000 seeds pass every check, and the table gives the largest differences.

## What remains

Only Saif can do these (details in [NEEDS-SAIF.md](NEEDS-SAIF.md)):

1. Merge the release pull requests #12–#19 (and this one): auto-merge, GitHub Releases and branch deletion are blocked for the build by its safety checks. Once merged, the build tags each merge commit and checks the live site.
2. Create the GitHub Releases (one command loop in NEEDS-SAIF), which also lets Zenodo mint the DOI.
3. Optionally set a GoatCounter site code.
4. Optionally confirm the values marked "typical textbook value, unverified" against a textbook.

## Backlog

From the plan's Part C, in order: a TDM sampling-time helper; pediatric allometry (maturation only if sourced); an obesity dosing-weight lesson; ARCHITECTURE.md and a contributor guide; a case of the day. From this run:

- A rebound model for dialysis needs a peripheral compartment and per-drug values that weren't verified.
- An effect site combined with an indirect response, and indirect responses in population mode.
- Dialysis for two-compartment and saturable drugs (the exact method is one-compartment, first-order).
- Lighthouse on the validation page varies between 97 and 100 with how the checks' tasks land; running them in a worker would remove the variation.
- The initial script has about 10 kB left; the practice tab's page code (about 40 kB) is the next candidate for a lazy file.
