# site-libkungfu-dev Map

## Use The Site

- Start at `https://libkungfu.dev` for the developer and agent substrate hub.
- Use `https://core.libkungfu.dev` for libkungfu, yijinjing, runtime fact
  ledger, specs, schemas, vectors, and stable docs URLs.
- Use `https://buildchain.libkungfu.dev` for Buildchain release-governance and
  deployment-operation facts.
- Use `https://kfd.libkungfu.dev` for Kung Fu Decisions, KFD-owned standard
  metadata, schemas, and stable decision pages.
- Use `/llms.txt` and `/manifest.json` as stable machine entries.

## Work In This Repository

- `src/fixtures/` contains temporary contract fixtures for hub/core.
- `@kungfu-tech/buildchain@2.8.1` supplies the Buildchain `dist/site` bundle.
- `@kungfu-tech/kfd@1.0.0-alpha.7` supplies the KFD site bundle, registry,
  standards metadata, schemas, and decision markdown.
- `scripts/render-site.mjs` renders pages from fixtures and pinned upstream
  package artifacts.
- `scripts/build-site.sh` writes `dist/`.
- `scripts/check-site.sh` enforces basic policy and source-boundary checks.
- `buildchain.toml` declares the web-surface channels and deployment planning
  targets.

## Source Boundary

This repository renders upstream facts. It does not author the spec, CLI,
workflow, release model, KFD decision text, schemas, or artifact evidence
facts.
