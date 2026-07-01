# site-libkungfu-dev

Source for the planned core-library technical release surface at
`https://libkungfu.cc/dev`.

The current repository provides a minimal static landing page at
`public/dev/index.html`. The live `libkungfu.cc` root is currently served by an
existing production WordPress/Elastic Beanstalk path, so this repository should
not be deployed to `https://libkungfu.cc/dev` until the routing choice is made.

## Purpose

- Publish technical release facts for the libkungfu core.
- Provide a future home for release manifests, checksums, provenance links, and
  machine-readable install/verify metadata.
- Keep the technical site separate from the `kungfu.tech` product home.

## Local Check

```bash
bash scripts/build-site.sh
bash scripts/check-site.sh
```

## Buildchain

This site is a Buildchain `web-surface` project. Buildchain validation and
deployment planning are dry-run only until the `libkungfu.cc/dev` route and
non-production preview/staging resources are explicitly approved.

```bash
BUILDCHAIN_DIR=/path/to/buildchain
bash scripts/build-site.sh
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode validate --cwd .
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel preview --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode cleanup-plan --cwd . --aliases pr-123,sha-abcdef123456
```
