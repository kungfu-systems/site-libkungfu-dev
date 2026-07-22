# site-libkungfu-dev Map

## Use The Site

- Start at `https://libkungfu.dev` for the site-owned builder proposition and
  guided continuity-stack synthesis.
- Use `https://libkungfu.dev/runtime.json` for the exact runtime source,
  package availability, quickstart, KFD Runtime 100, qualification, and
  claim-boundary projection.
- Use `https://core.libkungfu.dev` to understand the libkungfu runtime
  substrate: one mmap journal as retained evidence and local observation bus,
  its qualification frontiers, and the secondary spec/source contract.
- Use `https://buildchain.libkungfu.dev` for Buildchain release-governance and
  deployment-operation facts.
- Use `https://buildchain.libkungfu.dev/badges/v1/{badge}/{state}.svg` for
  Buildchain-owned hosted README badges and
  `https://buildchain.libkungfu.dev/badges/v1/{badge}/{state}.json` for the
  matching Shields-compatible payload.
- Use `https://kfd.libkungfu.dev` for Kung Fu Decisions, KFD-owned standard
  metadata, schemas, and stable decision pages.
- Use `https://papers.libkungfu.dev` for publication archive registry pages:
  human paper entries, PDFs, mutable latest routes, immutable version artifact
  prefixes, and agent-readable archive manifests.
- Use `/llms.txt` and `/manifest.json` as stable machine entries on each owning
  surface, including the Core subdomain.

## Reading Layers

The stable reading order is:

1. **First-screen proposition** — site-owned audience framing and reason to
   continue.
2. **Guided synthesis** — site-owned, non-normative connections across cited
   Kungfu, KFD, and Buildchain facts.
3. **Upstream authority** — exact runtime semantics, protocol decisions,
   commands, workflows, schemas, and release facts.
4. **Machine evidence** — source refs, versions, digests, qualification,
   claim boundaries, and stable routes.

On the hub, read the continuity stack before the detailed action-world and
plural-Hub diagrams. On Core, KFD, and Buildchain, the first screen states the
reader question and links directly to the package- or fixture-owned authority
below it. No down-level content is removed by this ordering.

## Work In This Repository

- `src/fixtures/` contains temporary contract fixtures for the hub and an
  evidence-linked Core presentation bundle. The Core fixture must pin every
  runtime claim to an immutable Kungfu source ref and keep the future spec
  package handoff secondary.
- `src/fixtures/libkungfu-runtime-surface.json` projects the exact public
  Kungfu PR, source commit, Project Cut, quickstart paths, KFD suite root,
  observed qualification, package availability, and known limits. The site
  renders this projection but does not become the runtime or conformance
  authority.
- `src/fixtures/buildchain-badge-endpoint-registry.json` and
  `src/fixtures/badges/v1/**/*.json` temporarily exercise the Buildchain hosted
  badge endpoint contract until the same files are published in the Buildchain
  `dist/site` bundle.
- `src/publication-packages.json` declares the exact paper packages rendered by
  the papers surface; `scripts/publication-packages.cjs` verifies and aggregates
  their package-local publication registries and artifacts.
- `@kungfu-tech/buildchain@2.14.13` supplies the Buildchain `dist/site` bundle.
- `@kungfu-tech/kfd@1.0.0-alpha.40` supplies the KFD site bundle, registry,
  standards and terminology metadata, schemas, reference pages, and decision
  markdown.
- `scripts/render-site.mjs` renders pages from fixtures and pinned upstream
  package artifacts.
- `scripts/build-site.sh` writes `dist/`.
- `scripts/check-site.sh` enforces basic policy and source-boundary checks.
- `docs/versioning.md` registers the KFD-1 impact classes and reader/machine
  faces for site changes.
- `.buildchain/buildchain.toml` declares the web-surface channels and deployment planning
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

This repository authors the reader contract, not the technical contract. It
owns first-screen framing, cross-surface synthesis, reading order, progressive
disclosure, navigation, visual composition, and routing. It does not author or
reinterpret the spec, runtime semantics, CLI, workflow, release model, KFD
decision text, schemas, qualification, or artifact evidence facts.

Every technical clause in site-authored synthesis must declare a claim class
and cite an exact entry in
`src/fixtures/site-manifest.json#readerContract.sources`. The checker validates
those source refs against the pinned Kungfu commit and installed KFD and
Buildchain package documents, then verifies human/agent projection parity.

Publication archive pages are renderer-owned, but archive facts are not. The
site consumes each exact paper package for canonical reader, latest, immutable
version, artifact hash, source bundle, manifest, and passport facts. Buildchain
owns the shared publication mechanism and contracts; paper packages own the
release-specific facts.
