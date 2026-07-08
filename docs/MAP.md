# site-libkungfu-dev Map

## Use The Site

- Start at `https://libkungfu.dev` for the developer and agent substrate hub.
- Use `https://core.libkungfu.dev` for libkungfu, yijinjing, runtime fact
  ledger, specs, schemas, vectors, and stable docs URLs.
- Use `https://buildchain.libkungfu.dev` for Buildchain release-governance and
  deployment-operation facts.
- Use `https://buildchain.libkungfu.dev/badges/v1/{badge}/{state}.svg` for
  Buildchain-owned hosted README badges and
  `https://buildchain.libkungfu.dev/badges/v1/{badge}/{state}.json` for the
  matching Shields-compatible payload.
- Use `https://kfd.libkungfu.dev` for Kung Fu Decisions, KFD-owned standard
  metadata, schemas, and stable decision pages.
- Use `/llms.txt` and `/manifest.json` as stable machine entries.

## Work In This Repository

- `src/fixtures/` contains temporary contract fixtures for hub/core.
- `src/fixtures/buildchain-badge-endpoint-registry.json` and
  `src/fixtures/badges/v1/**/*.json` temporarily exercise the Buildchain hosted
  badge endpoint contract until the same files are published in the Buildchain
  `dist/site` bundle.
- `@kungfu-tech/buildchain@2.10.1` supplies the Buildchain `dist/site` bundle.
- `@kungfu-tech/kfd@1.0.0-alpha.19` supplies the KFD site bundle, registry,
  standards metadata, schemas, and decision markdown.
- `scripts/render-site.mjs` renders pages from fixtures and pinned upstream
  package artifacts.
- `scripts/build-site.sh` writes `dist/`.
- `scripts/check-site.sh` enforces basic policy and source-boundary checks.
- `buildchain.toml` declares the web-surface channels and deployment planning
  targets.

## KFD Compliance

This repository is also a KFD-governed product surface:

- KFD-1 source boundary: product facts come from pinned upstream bundles or
  explicit fixtures, never from copied downstream prose.
- KFD-2 auditability: generated surfaces expose package versions, integrity,
  renderer contracts, manifests, and release-propagation locks.
- KFD-3 consumption: human pages and agent entries must lead to the same stable
  mechanism, pages, and machine-readable facts.
- KFD-4 perspective: timeline, release, sync, or mixed-source work-state views
  must declare their observer and projection boundary.

Future `site-libkungfu-dev` npm package exports should preserve these rules so
any Kungfu-standard site bundle can be rendered by the same governed renderer.

## Source Boundary

This repository renders upstream facts. It does not author the spec, CLI,
workflow, release model, KFD decision text, schemas, or artifact evidence
facts.
