# site-libkungfu-dev Map

## Use The Site

- Start at `https://libkungfu.dev` for the developer and agent substrate hub.
- Use `https://core.libkungfu.dev` for libkungfu, yijinjing, runtime fact
  ledger, specs, schemas, vectors, and stable docs URLs.
- Use `https://buildchain.libkungfu.dev` for Buildchain release-governance and
  deployment-operation facts.
- Use `/llms.txt` and `/manifest.json` as stable machine entries.

## Work In This Repository

- `src/fixtures/` contains temporary contract fixtures for hub/core.
- `@kungfu-tech/buildchain@2.4.0` supplies the Buildchain `dist/site` bundle.
- `scripts/render-site.mjs` renders pages from fixtures and pinned upstream
  package artifacts.
- `scripts/build-site.sh` writes `dist/`.
- `scripts/check-site.sh` enforces basic policy and source-boundary checks.
- `buildchain.toml` declares the web-surface channels and deployment planning
  targets.

## Source Boundary

This repository renders upstream facts. It does not author the spec, CLI,
workflow, release model, or artifact evidence facts.
