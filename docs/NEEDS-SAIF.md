# What needs Saif

Only these steps need your accounts or your judgment; everything else in Build Plan V2 is done (see [BUILD_REPORT_V2.md](BUILD_REPORT_V2.md)). The license is MIT, as you confirmed; nothing to do there.

## First: the domain maatirx.com (done 2026-10-04)

**Switched.** On 2026-10-04, right after Pages published 2.20, the custom domain was set with `gh api -X PUT repos/Saifmaati/dose-curve/pages -f cname=maatirx.com`, and GitHub committed the `CNAME` file to main. Once the certificate was approved (maatirx.com and www.maatirx.com, until 2027-01-02) HTTPS was enforced with `gh api -X PUT repos/Saifmaati/dose-curve/pages -F https_enforced=true`. The domain is registered at Spaceship; its four A records point at GitHub Pages, and `www` is a CNAME for `saifmaati.github.io`.

Checked then:
- https://maatirx.com/ serves the site with a valid certificate. `www` and plain HTTP redirect to it.
- Every address under https://saifmaati.github.io/dose-curve/ redirects to the same path at maatirx.com.
- A share link sent with the old address opens its scenario at the new one.

To check again:

```
curl -sI https://saifmaati.github.io/dose-curve/ | grep -i '^location'
```

That should print `location: https://maatirx.com/`.

**The name is DoseCurve again (2.21).** 2.20.0 called the app MaatiRx. On 2026-10-06 you chose to go back to DoseCurve and keep the address. Should you later want an address that matches the name (dosecurve.com, say), the steps are the same. The saved-work move (ui-move.js) would need its new address changed first, and a week or two at the current address before the switch.

Don't rename the repository: a renamed repository's old Pages address stops resolving instead of redirecting. Optionally, verify the domain under GitHub Settings → Pages → Verified domains (one TXT record), so no other repository can claim it.

**Saved work at the old address.** A browser keeps saved work per address. The domain was switched within an hour of 2.20 going live, so only browsers that opened 2.20 at the old address in that hour are offered the move: on the first old link, "MaatiRx has moved" (their offline copy is 2.20's), with **Bring it to maatirx.com**. Everyone else lands on maatirx.com without their saved scenarios and progress, which stay in their browser's storage for saifmaati.github.io.

That storage belongs to the whole of saifmaati.github.io, not only the project's folder. So a one-page user site in a new repository named `Saifmaati/saifmaati.github.io` could still read it and hand it to maatirx.com, which already takes it in (ui-move.js). maatirx.com could then link to it ("Used DoseCurve before 4 October? Bring your saved work"). Creating that repository is your call; ask Claude Code to build the page.

## Google: "founded by Saif Maati" (2.21)

Once 2.21 is merged, the site states it in three places Google reads:
- the footer's first line ("DoseCurve — Founded by Saif Maati", with a hairline where the dash is);
- the page description, which Google often shows under the title;
- the page's structured data (JSON-LD): Saif Maati as a Person, DoseCurve's founder, and the app's author and creator.

It is also on the educator page, in Model and methods and in the README. An `author` meta tag carries it for other tools; Google itself ignores that tag.

Google decides what it shows and when. These steps make it look again sooner:

1. Open https://search.google.com/search-console and add a **Domain** property for `maatirx.com`. Google gives you one TXT record; add it at Spaceship (the domain's DNS) and press Verify.
2. Sitemaps → submit `https://maatirx.com/sitemap.xml`.
3. URL inspection → `https://maatirx.com/` → **Request indexing**.
4. Optionally, check the founder data at https://validator.schema.org/ with `https://maatirx.com/`. Google's own Rich Results Test (and Search Console's enhancements report) will say the software-app item lacks `aggregateRating` or `review`. That is expected: those rich results need real ratings, and none should be invented.

Results usually update within days to a few weeks. A knowledge panel (the box beside results) isn't something a site can set; Google builds it from what it finds about a person, and a profile that names DoseCurve (for example your GitHub profile's bio) helps.

## 1. Merge the release pull requests

**Done to 2.20.0.** The release pull requests #12–#41 (1.10.0 to 2.20.0) were merged by 2026-10-04, and each has its GitHub Release. #42 (3.0.0, the name MaatiRX) was closed unmerged when the name went back to DoseCurve. Open: 2.21.0.

## 2. GitHub Releases

**Done for 1.10.0 to 2.15.0** (2026-10-01): each is tagged on its pull request's merge commit, with its CHANGELOG section as the notes, and 2.15.0 is marked as the latest. Claude Code makes each new release's Release once its pull request is merged. Tags v1.0.0 to v1.9.0 exist but have no Release. To add them too (Zenodo archives each one, with its own DOI), from the repository folder:

```bash
for v in 1.0.0 1.1.0 1.2.0 1.3.0 1.4.0 1.4.1 1.5.0 1.6.0 1.7.0 1.8.0 1.9.0; do awk -v H="## $v " 'index($0,H)==1{f=1;next} /^## /{f=0} f' CHANGELOG.md > /tmp/dc-notes-$v.md; gh release create v$v --verify-tag --latest=false --title "DoseCurve $v" --notes-file /tmp/dc-notes-$v.md; done
```

## 3. Zenodo DOI

**Minted.** The Releases gave the app its concept DOI, [10.5281/zenodo.23082408](https://doi.org/10.5281/zenodo.23082408), which covers all versions and resolves to the newest; each release also has its own version DOI on that page. 2.10.0 adds it to the README (a badge and How to cite), `CITATION.cff` and the app's footer. Nothing to do.

## 4. Turn on visit counting (optional)

**Why:** it needs a GoatCounter account.

1. Sign up at https://www.goatcounter.com and choose a site code, for example `dosecurve`.
2. In `index.html` and `methods.html`, set `const ANALYTICS_SITE_ID="dosecurve";` (search for `ANALYTICS_SITE_ID`; in `tools/methods.py` too, so a rebuild keeps it).
3. Commit the change.

Model and methods then says "Visit counting: on". GoatCounter is cookie-free and receives only the page's path, never a link's settings. The privacy note in the footer already describes what is counted and what isn't.

## 5. Delete the merged branches

Blocked for Claude Code ("Git Destructive"). GitHub now deletes a pull request's branch when it is merged (2.10.0 onward went that way), but the 30 older release branches (and `two-compartment`) are still on GitHub. All are merged into `main`, and every release's commit is kept by its tag. This deletes them on GitHub, then deletes the local branches already merged into `main`. It leaves `main` and whichever branch is checked out alone, and doesn't switch branches:

```bash
cd /Users/saifmaati/Desktop/dose-curve && git push origin --delete two-compartment v1.0 v1.2 v1.3 v1.4 v1.4.1 v1.5.0 v1.6.0 v1.7.0 v1.8.0 v1.9.0 v1.10.0 v1.11.0 v1.12.0 v1.13.0 v1.14.0 v1.15.0 v1.16.0 v1.17.0 v1.17.1 v2.0.0 v2.1.0 v2.2.0 v2.3.0 v2.4.0 v2.5.0 v2.6.0 v2.7.0 v2.8.0 v2.9.0 && git fetch --prune && git branch --merged origin/main --format='%(refname:lstrip=2)' | grep -vxE "main|$(git branch --show-current)" | xargs git branch -D
```

To let Claude Code delete a release branch after its merge in future runs, allow `Bash(git push origin --delete:*)`.

## 6. The build plan files on `main`

`docs/BUILD_PLAN_V2.md` and `docs/OUTREACH.md` were not on `main` (locally or on GitHub) when 1.10.0 was prepared, and Claude Code's auto-mode check blocked it from copying them in from Downloads. From the repository folder:

```bash
cp ~/Downloads/DOSECURVE-BUILD-PLAN-V2.md docs/BUILD_PLAN_V2.md && cp ~/Downloads/DOSECURVE-OUTREACH-EMAILS.md docs/OUTREACH.md && git add docs/BUILD_PLAN_V2.md docs/OUTREACH.md && git commit -m "docs: build plan v2 and outreach drafts" && git push origin main
```

The outreach drafts in Downloads describe the app as of 1.9, with counts that are now out of date ("10 clinical cases", "29 guided lessons"). The educator page, https://maatirx.com/educators.html, is a good link to send instead of the app itself. Before sending, update the numbers: as of 2.21 there are 16 clinical cases, 36 guided lessons, 43 kinds of practice problems and 12 library drugs, plus antimicrobial PK/PD (fT>MIC, Cmax/MIC, AUC24/MIC), indirect response models, hemodialysis, sensitivity analysis, Bayesian individualization from levels, and instructor tools (write a case, assignments, completion codes).

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
