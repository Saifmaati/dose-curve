# What needs Saif

A few steps need your accounts or your judgment. Each one says why it wasn't done during the build and exactly what to do.

## 1. Create the GitHub Release and the tag

**Why:** this machine has no git push credentials and no authenticated `gh`, so a tag can't be pushed from here.

1. Open https://github.com/Saifmaati/dose-curve/releases/new.
2. Under **Choose a tag**, type `v1.1.0` and choose **Create new tag: v1.1.0 on publish**, with target `main`.
3. Title: `DoseCurve 1.1.0`.
4. Paste the "1.1.0" and "1.0.0" sections of `CHANGELOG.md` as the description. To tag 1.0.0 separately, create `v1.0.0` first with target commit `c0a0f69`.
5. Click **Publish release**.

## 2. Mint a DOI on Zenodo

**Why:** it needs your Zenodo login. `.zenodo.json` already holds the title, description, creator, license and keywords.

1. Sign in at https://zenodo.org with GitHub.
2. Under **Account → GitHub**, switch on `Saifmaati/dose-curve`.
3. Publish the release (step 1) after switching it on. Zenodo archives it and mints a DOI. (If the release already exists, publish a new one, for example `v1.0.1`, or upload the release zip by hand.)
4. Put the DOI badge in `README.md` and add a `doi:` line to `CITATION.cff`.

## 3. Turn on visit counting (optional)

**Why:** it needs a GoatCounter account.

1. Sign up at https://www.goatcounter.com and choose a site code, for example `dosecurve`.
2. In `index.html`, set `const ANALYTICS_SITE_ID="dosecurve";` (search for `ANALYTICS_SITE_ID`).
3. Commit the change.

The footer then says "Visit counting: on". GoatCounter is cookie-free and receives only the page's path, never a link's settings. The privacy note in the footer already describes what is counted and what isn't.

## 4. Confirm the license

The repository had no license. **MIT** was chosen, as permissive and common for teaching tools. If you want another one (for example CC BY for the content, or GPL), change `LICENSE`, `CITATION.cff` and `.zenodo.json` together.

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
- **Sheiner–Tozer:** the CrCl threshold for the end-stage kidney variant. References disagree (under 10 or under 20 mL/min), so it is left to the user.

If you have Winter's *Basic Clinical Pharmacokinetics* or Bauer's *Applied Clinical Pharmacokinetics*, you can confirm the textbook values. Add a reference entry in `pk-engine.js` (`SOURCES` and the drug's `refs`), with chapter or page, and the "unverified" label goes away.

## 6. After merging

- Check that the **Tests** badge on the README is green: the workflow runs on every push.
- The branch `v1.0` can be deleted once `main` has everything.
