# What needs Saif

Only these steps need your accounts or your judgment; everything else in Build Plan V2 is done (see [BUILD_REPORT_V2.md](BUILD_REPORT_V2.md)). The license is MIT, as you confirmed; nothing to do there.

## 1. Merge the release pull requests

Merging is blocked for Claude Code by its auto-mode safety check ("Merge Without Review"). Each release is a pull request with green CI. On 2026-09-30 GitHub showed all of these open and `main` at 1.9.0 (da05093); a merge only counts once the pull request page says **Merged**.

| Release | Pull request | Release | Pull request |
| --- | --- | --- | --- |
| 1.10.0 | https://github.com/Saifmaati/dose-curve/pull/12 | 1.14.0 | https://github.com/Saifmaati/dose-curve/pull/16 |
| 1.11.0 | https://github.com/Saifmaati/dose-curve/pull/13 | 1.15.0 | https://github.com/Saifmaati/dose-curve/pull/17 |
| 1.12.0 | https://github.com/Saifmaati/dose-curve/pull/14 | 1.16.0 | https://github.com/Saifmaati/dose-curve/pull/18 |
| 1.13.0 | https://github.com/Saifmaati/dose-curve/pull/15 | 1.17.0 | https://github.com/Saifmaati/dose-curve/pull/19 |
| 1.17.1 | https://github.com/Saifmaati/dose-curve/pull/20 | 2.0.0 | https://github.com/Saifmaati/dose-curve/pull/21 |
| 2.1.0 | https://github.com/Saifmaati/dose-curve/pull/22 | 2.2.0 | https://github.com/Saifmaati/dose-curve/pull/23 |
| 2.3.0 | the pull request from branch `v2.3.0` | | |

Each one contains the ones before it. Merging them one by one, oldest first, gives each release its own merge commit to tag:

```bash
for n in 12 13 14 15 16 17 18 19; do /Users/saifmaati/.local/bin/gh pr merge $n --repo Saifmaati/dose-curve --merge; done
```

Then merge 1.17.1 (#20), 2.0.0 (#21), 2.1.0 (#22), 2.2.0 (#23) and 2.3.0 the same way. Each contains the ones before it, so merging only the last one also works, at the cost of one merge commit for all of them. Afterwards Claude Code tags each merge commit, checks the live site byte for byte and runs Lighthouse. To let it merge after green CI in future runs, allow `Bash(/Users/saifmaati/.local/bin/gh pr merge:*)` in `~/.claude/settings.json`.

## 2. Create the GitHub Releases

Tags `v1.0.0` to `v1.9.0` are pushed; v1.10.0 onward are tagged as they merge. Creating the Releases is blocked for Claude Code ("Create Public Surface"), and Zenodo archives a release, not a tag. From the repository folder, oldest first, each with its CHANGELOG section as the notes:

```bash
for v in 1.0.0 1.1.0 1.2.0 1.3.0 1.4.0 1.4.1 1.5.0 1.6.0 1.7.0 1.8.0 1.9.0 1.10.0 1.11.0 1.12.0 1.13.0 1.14.0 1.15.0 1.16.0 1.17.0 1.17.1 2.0.0 2.1.0 2.2.0 2.3.0; do awk -v H="## $v " 'index($0,H)==1{f=1;next} /^## /{f=0} f' CHANGELOG.md > /tmp/dc-notes-$v.md; gh release create v$v --verify-tag --title "DoseCurve $v" --notes-file /tmp/dc-notes-$v.md; done
```

To let Claude Code do it in future runs, allow `Bash(/Users/saifmaati/.local/bin/gh release create:*)`.

## 3. Zenodo: DOI expected with the first release

**Status:** Zenodo is enabled for the repository (Saif, 2026-09-30). The repository id is 1343327284; `https://zenodo.org/badge/latestdoi/1343327284` returned 404 on 2026-09-30 because no Release exists yet. Once the Releases exist, Zenodo archives each release and mints a DOI; each later release checks the badge again and, when it resolves, adds the DOI badge and a "Cite" section to the README and the app footer, and a `doi:` line to `CITATION.cff`.

## 4. Turn on visit counting (optional)

**Why:** it needs a GoatCounter account.

1. Sign up at https://www.goatcounter.com and choose a site code, for example `dosecurve`.
2. In `index.html`, set `const ANALYTICS_SITE_ID="dosecurve";` (search for `ANALYTICS_SITE_ID`).
3. Commit the change.

The footer then says "Visit counting: on". GoatCounter is cookie-free and receives only the page's path, never a link's settings. The privacy note in the footer already describes what is counted and what isn't.

## 5. Delete the merged branches

Blocked for Claude Code ("Git Destructive"). These are fully merged into `main`:

```bash
git push origin --delete two-compartment v1.0 v1.2 v1.3 v1.4 v1.4.1 v1.5.0 v1.6.0 v1.7.0 v1.8.0 v1.9.0
```

After step 1, the release branches `v1.10.0` to `v1.17.1` can go the same way. To let Claude Code delete them after each merge, allow `Bash(git push origin --delete:*)`.

## 6. The build plan files on `main`

`docs/BUILD_PLAN_V2.md` and `docs/OUTREACH.md` were not on `main` (locally or on GitHub) when 1.10.0 was prepared, and Claude Code's auto-mode check blocked it from copying them in from Downloads. From the repository folder:

```bash
cp ~/Downloads/DOSECURVE-BUILD-PLAN-V2.md docs/BUILD_PLAN_V2.md && cp ~/Downloads/DOSECURVE-OUTREACH-EMAILS.md docs/OUTREACH.md && git add docs/BUILD_PLAN_V2.md docs/OUTREACH.md && git commit -m "docs: build plan v2 and outreach drafts" && git push origin main
```

The outreach drafts in Downloads describe DoseCurve as of 1.9 ("10 clinical cases", "29 guided lessons"). The educator page, https://saifmaati.github.io/dose-curve/educators.html (live once the releases are merged), is a good link to send instead of the app itself. Before sending, update the numbers: as of 1.17.1 there are 16 clinical cases, 34 guided lessons, 42 kinds of practice problems and 12 library drugs, plus antimicrobial PK/PD (fT>MIC, Cmax/MIC, AUC24/MIC), indirect response models, hemodialysis, sensitivity analysis, Bayesian individualization from levels, and instructor tools (write a case, assignments, completion codes).

## 7. Optional: values a pharmacist or a textbook could confirm

Every drug-library value either names its source or is marked "typical textbook value, unverified". The unverified ones:

- **Gentamicin:** half-life 2.5 h and volume 0.25 L/kg. The label gives neither number.
- **Phenytoin:** Vmax 7 mg/kg/day, Km 4 mg/L, volume 0.7 L/kg, fu 0.1, fe 0.05.
- **Ibuprofen:** all its values. Only the OTC Drug Facts label was available, which has no pharmacokinetics.
- **Amoxicillin:** volume 27 L and F 0.9.
- **Caffeine:** F and kₐ.
- **Windows:** the ibuprofen, amoxicillin, caffeine and vancomycin concentration windows, which are illustrative. The vancomycin case uses the cited AUC24 target instead.
- **Cases:**
  - Gentamicin's peak floor of 5 mg/L, a teaching target.
  - The conventional 1.7 mg/kg every 8 h used for comparison.
  - The convention of rounding IV doses to 10 mg (gentamicin) and 250 mg (vancomycin).
- **Bayesian panel:** the prior's CVs (30% on clearance, 20% on volume) and the level error model (10% proportional plus a tenth of the MEC) are teaching assumptions; drug-specific values would need a cited population model.
- **Liver model:** hepatic blood flow of 90 L/h in the glossary and the model's defaults (fu 0.5, CLint 20 L/h), teaching values.
- **Antimicrobial MICs:** meropenem's 2 mg/L and the gentamicin lesson's 1 mg/L are illustrative (flagged); piperacillin's 16 mg/L is the FDA breakpoint for *P. aeruginosa* (cited). No numeric fT>MIC or Cmax/MIC target is shown because none was verified (the abstracts of Craig 1998 and Moore 1987 state none); if you have the full papers or a textbook table, the targets can be added with their citation.
- **Dialysis:** the default dialysis clearance (5 L/h) is a typical value. The gentamicin case derives its clearance from the label's 50% per 8-hour session, but gentamicin's library half-life and volume are themselves unverified.
- **Indirect-response lesson:** the drug's potency (IC50 1 mg/L) and dose (25 mg) are illustrative; its half-life, volume, absorption and the two turnovers come from the warfarin label. It reports no INR.
- **Sheiner–Tozer:** the CrCl threshold for the end-stage kidney variant. References disagree (under 10 or under 20 mL/min), so it is left to the user.

If you have Winter's *Basic Clinical Pharmacokinetics* or Bauer's *Applied Clinical Pharmacokinetics*, you can confirm the textbook values. Add a reference entry in `pk-engine.js` (`SOURCES` and the drug's `refs`), with chapter or page, and the "unverified" label goes away.

## The 2.0 reference image

The 2.0 brief names `~/Downloads/dosecurve-reference.png` as its reference; it wasn't on the machine when 2.0.0 was built, so the brief's written description was used (DECISIONS 117). If you have the file, put it back in Downloads and the next stage's review will set the screenshots beside it.
