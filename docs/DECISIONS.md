# Decisions during the v1.0 build

Each entry records one judgment call made during the unattended v1.0 run: what was decided, why (one line), and the alternative that was rejected.

| # | Phase | Decision | Why | Rejected alternative |
| --- | --- | --- | --- | --- |
| 1 | – | Follow the v1.0 plan, including Michaelis–Menten kinetics, population variability and a two-compartment stretch goal. | The plan is the owner's latest written direction, and it supersedes the earlier pause on nonlinear and population models. | Keeping the earlier pause and skipping Phases 2 and 6. |
| 2 | – | Push the `v1.0` branch through GitHub's web "Upload files" page. Hashes in `BUILD_LOG.md` are local commits; GitHub gets one upload commit per folder per phase. | This machine has no git push credentials, and the web upload is the write path that already deploys `main`. | Asking for credentials; skipping the branch backups. |
| 3 | – | Put dev tools (Lighthouse 12, numpy, scipy) in a scratch folder outside the repo. | They are for measuring and validation only; the site gains no runtime dependency. | A `package.json` with dev dependencies. |
| 4 | 0 | Stop the font-swap layout shift with metric-matched fallback faces (`size-adjust` and ascent/descent overrides on Arial and Courier New). | CLS fell from 0.144 to 0.01, the fonts look the same, and no new files are needed. | Self-hosting the fonts (more bytes to cache); `font-display: optional` (first visits would often show system fonts). |
| 5 | 0 | Decide the quick-start strip's visibility in the head script, before the first paint. | Un-hiding it from the app script moved the chart after it had been drawn. | Always reserving its space (an empty gap for returning visitors). |
