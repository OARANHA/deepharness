# Upstream source and synchronization

- Project: https://github.com/deepseek-ai/deepseek-harness
- License: MIT; keep upstream `LICENSE` and third-party notices.
- Origin branch: `master`.
- **Pinned import source commit:** `d743267388641bc76f17c45ce8b4c231aed1d32c`.
- Repository owned here: https://github.com/OARANHA/deepharness

This repository is a **tracked derivative**. Upstream code is imported as a single reproducible snapshot, not automatically rebased on every release. A future update must compare upstream changes, execute CI, and be reviewed before replacing `main`.

The one-time GitHub Actions import omits the original upstream `.github/workflows/` to prevent automatically executing unfamiliar CI in our repository; local workflows take precedence. It also preserves our own deployment notes under `deploy/` and project-specific authority docs.

**Packaging caveat:** initial `deploy/Dockerfile` deliberately installs the pinned **published npm distribution** for stable smoke testing; edits to the vendored source do not enter that image until a source-build release pipeline is explicitly added and verified. Do not claim otherwise.
