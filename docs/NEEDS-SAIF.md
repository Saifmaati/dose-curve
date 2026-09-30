# What needs Saif

A few steps need your accounts or your judgment. Each one says why it wasn't done during the build and exactly what to do.

## 0. Merge the release pull requests

**Why:** merging was blocked by Claude Code's auto-mode safety check ("Merge Without Review"). Each release is a pull request whose CI must be green first; merge them in order, then Claude Code tags the merge commit and checks the live site.

- 1.10.0: https://github.com/Saifmaati/dose-curve/pull/12 (branch `v1.10.0`)
- 1.11.0: https://github.com/Saifmaati/dose-curve/pull/13 (branch `v1.11.0`)
- 1.12.0: the pull request from branch `v1.12.0` (it includes 1.10.0 and 1.11.0 until those merge)

```bash
/Users/saifmaati/.local/bin/gh pr merge 12 --repo Saifmaati/dose-curve --merge
```

To let Claude Code merge after green CI in future runs, allow `Bash(/Users/saifmaati/.local/bin/gh pr merge:*)` in `~/.claude/settings.json`.

## 1. Create the GitHub Releases (the tags are already pushed)

**Why:** tags `v1.0.0` to `v1.9.0` were pushed on 2026-09-30 on the merge commits below, but creating the Releases themselves was blocked by Claude Code's auto-mode safety check ("Create Public Surface"). Zenodo archives a release, not a tag, so no DOI exists until these are created. Create them oldest first, so the newest is the one Zenodo archives last and GitHub marks as latest.

| Tag | Commit | Tag | Commit |
| --- | --- | --- | --- |
| v1.0.0 | c0a0f69 | v1.5.0 | d4d0290 |
| v1.1.0 | a584978 | v1.6.0 | 0845417 |
| v1.2.0 | 2d50c74 | v1.7.0 | b1ae2f3 |
| v1.3.0 | e178f31 | v1.8.0 | b31ff5e |
| v1.4.0 | 36e3abf | v1.9.0 | da05093 |
| v1.4.1 | fadf6bd | v1.10.0 – v1.12.0 | their merge commits (tagged when they merge) |

From the repository folder, this creates each one with its CHANGELOG section as the notes:

```bash
for v in 1.0.0 1.1.0 1.2.0 1.3.0 1.4.0 1.4.1 1.5.0 1.6.0 1.7.0 1.8.0 1.9.0 1.10.0 1.11.0 1.12.0; do awk -v H="## $v " 'index($0,H)==1{f=1;next} /^## /{f=0} f' CHANGELOG.md > /tmp/dc-notes-$v.md; gh release create v$v --verify-tag --title "DoseCurve $v" --notes-file /tmp/dc-notes-$v.md; done
```

To let Claude Code do it in future runs, allow `Bash(/Users/saifmaati/.local/bin/gh release create:*)` in `~/.claude/settings.json`.

## 2. Zenodo: DOI expected with the first release

**Status:** Zenodo is enabled for the repository (Saif, 2026-09-30). The repository id is 1343327284; `https://zenodo.org/badge/latestdoi/1343327284` returned 404 on 2026-09-30 because no Release exists yet. Once step 1 is done, Zenodo archives each release and mints a DOI; each later release checks the badge again and, when it resolves, adds the DOI badge and a "Cite" section to the README and the app footer, and a `doi:` line to `CITATION.cff`.

## 3. Turn on visit counting (optional)

**Why:** it needs a GoatCounter account.

1. Sign up at https://www.goatcounter.com and choose a site code, for example `dosecurve`.
2. In `index.html`, set `const ANALYTICS_SITE_ID="dosecurve";` (search for `ANALYTICS_SITE_ID`).
3. Commit the change.

The footer then says "Visit counting: on". GoatCounter is cookie-free and receives only the page's path, never a link's settings. The privacy note in the footer already describes what is counted and what isn't.

## 4. License

The license is MIT, confirmed by Saif on 2026-09-30. Nothing to do.

## 5. Values a pharmacist or a textbook could confirm

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
- **Sheiner–Tozer:** the CrCl threshold for the end-stage kidney variant. References disagree (under 10 or under 20 mL/min), so it is left to the user.

If you have Winter's *Basic Clinical Pharmacokinetics* or Bauer's *Applied Clinical Pharmacokinetics*, you can confirm the textbook values. Add a reference entry in `pk-engine.js` (`SOURCES` and the drug's `refs`), with chapter or page, and the "unverified" label goes away.

## 6. Delete the merged branches

**Why:** deleting branches on GitHub was blocked by the auto-mode safety check ("Git Destructive"). Every branch below is fully merged into `main` (checked with `git merge-base --is-ancestor` on 2026-09-30):

```bash
git push origin --delete two-compartment v1.0 v1.2 v1.3 v1.4 v1.4.1 v1.5.0 v1.6.0 v1.7.0 v1.8.0 v1.9.0
```

Later release branches (`v1.10.0` onward) are listed in the build log as they merge. To let Claude Code delete them after each merge, allow `Bash(git push origin --delete:*)`.

## 7. The build plan files on `main`

`docs/BUILD_PLAN_V2.md` and `docs/OUTREACH.md` were not on `main` (locally or on GitHub) when 1.10.0 was prepared, and Claude Code's auto-mode check blocked it from copying them in from Downloads. From the repository folder:

```bash
cp ~/Downloads/DOSECURVE-BUILD-PLAN-V2.md docs/BUILD_PLAN_V2.md && cp ~/Downloads/DOSECURVE-OUTREACH-EMAILS.md docs/OUTREACH.md && git add docs/BUILD_PLAN_V2.md docs/OUTREACH.md && git commit -m "docs: build plan v2 and outreach drafts" && git push origin main
```

## 8. After merging

Check that the **Tests** badge on the README is green: the workflow runs on every push.
