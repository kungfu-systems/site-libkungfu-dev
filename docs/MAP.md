---
status: active
period: ongoing
theme: site-reader-contract
doc_type: reference
source_level: local-files
confidence: high
sensitivity: public
evidence_grade: A
review_state: self-reviewed
last_reviewed: 2026-07-24
ai_provenance:
  model_family: GPT-5
  product: Codex
  generated_at: 2026-07-24
  limits: No access to hidden model build or checkpoint identifiers.
---

# site-libkungfu-dev Map

## Use The Site

- Start at `https://libkungfu.dev` for the site-owned builder proposition and
  guided continuity-stack synthesis.
- Continue to `https://libkungfu.dev/architecture/` for the detailed action
  world, plural-Hub topology, quickstarts, qualification, release-trust map,
  and source boundary.
- Use `https://libkungfu.dev/runtime.json` for the exact runtime source,
  package availability, quickstart, KFD Runtime 100, qualification, and
  claim-boundary projection.
- Use `https://libkungfu.dev/skills/` for the user-facing Skills value,
  comparison, release example, and no-code path. Continue to `/skills/spec/`
  for exact technical evidence and `/skills/roadmap/` for current, next, and
  future delivery horizons. Its machine peers remain `/skills/manifest.json`,
  `/skills/llms.txt`, `/skills/architecture.json`, and
  `/skills/capability-map.json`.
- Use `https://core.libkungfu.dev` for the complete Kungfu product and adoption
  map. Stable depth routes cover `.kungfu` format, primitives, runtime, ABI,
  SDKs, extensions, products, qualification, ADR navigation, and domain
  horizons. Use `/site-bundle.json`, `/agent-index.json`, and `/adr-map.json`
  for the corresponding package-owned machine projections.
- Use `https://buildchain.libkungfu.dev` to see how KFD-3 value surfaces and
  KFD-2 trust evidence become one release-bound Hub admission surface; use
  `https://buildchain.libkungfu.dev/mechanism/` for Buildchain-owned Release
  Passport, CLI, workflow, release-governance, and deployment-operation facts.
- Use `https://buildchain.libkungfu.dev/badges/v1/{badge}/{state}.svg` for
  Buildchain-owned hosted README badges and
  `https://buildchain.libkungfu.dev/badges/v1/{badge}/{state}.json` for the
  matching Shields-compatible payload.
- Use `https://kfd.libkungfu.dev` for the KFD continuity question and foundation
  triad; use `https://kfd.libkungfu.dev/decisions/` for KFD-owned standard
  metadata, schemas, candidates, and stable decision navigation.
- Use `https://papers.libkungfu.dev` for the paper reading shelf and PDF-first
  entries; use `https://papers.libkungfu.dev/archive/` for source revisions,
  versions, immutable artifact prefixes, passports, and archive manifests.
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

Each primary homepage stops after the proposition, minimum synthesis, and one
clear continuation choice. Detailed action-world, runtime, package, decision,
and publication-evidence content lives at the stable depth routes listed above.
No down-level content is removed: the overview chooses what a first-time reader
must understand, while the depth page preserves the complete cited authority.

## Work In This Repository

- `@kungfu-tech/site@4.0.0-alpha.1` supplies the complete Core product bundle,
  exact authority roots, agent index, schema, and ADR map. The site copies its
  machine artifacts byte-for-byte and only owns their human rendering. The
  exact public npm coordinate, pnpm integrity, embedded clean source revision,
  and content roots bind that artifact to Kungfu. Package transport does not
  transfer semantic ownership to this repository.
- `core.libkungfu.dev/format/` opens with a site-owned explanation of what the
  portable work format is, why a fresh agent needs it, and how preservation,
  inspection, and action differ. The bundle's exact Spec authority projection
  remains complete inside a closed implementer and auditor disclosure:
  pickup coordinate, normative root, required-reader behavior, compatibility
  axes, retained vectors, rooted routes, and non-claims. The corresponding
  `dist/site/format/**` package files are published byte-for-byte under the same
  Core machine paths.
- `src/fixtures/libkungfu-runtime-surface.json` projects the exact public
  Kungfu PR, source commit, Project Cut, quickstart paths, KFD suite root,
  observed qualification, package availability, and known limits. The site
  renders this projection but does not become the runtime or conformance
  authority.
- `src/fixtures/skills-site.json` is the single Site-owned Skills reader source.
  It pins exact protected Kungfu documents, keeps partial implementation and
  known-limit boundaries visible, and drives the human page plus all four Agent
  endpoints without claiming a released Skill runtime.
- `src/fixtures/buildchain-badge-endpoint-registry.json` and
  `src/fixtures/badges/v1/**/*.json` temporarily exercise the Buildchain hosted
  badge endpoint contract until the same files are published in the Buildchain
  `dist/site` bundle.
- `src/publication-packages.json` declares the exact paper packages rendered by
  the papers surface; `scripts/publication-packages.cjs` verifies and aggregates
  their package-local publication registries and artifacts.
- `@kungfu-tech/buildchain@3.0.6-alpha.0` supplies the Buildchain `dist/site` bundle.
- `.buildchain/manual-code-upstreams.json` declares the downstream-only manual
  pickup profiles for Buildchain and Kungfu Core. Its runtime pin is distinct
  from the Buildchain content package and from workflow contract locks.
- `scripts/code-upstream-pickup.cjs` plans and captures exact published package
  coordinates without an upstream trigger, and applies only claimed Family
  State v2 / Warrant-bound Work. Paper and KFD automatic capture remain owned
  by their existing release propagation surfaces.
- `@kungfu-tech/kfd@1.0.0-alpha.61` supplies the KFD site bundle, registry,
  standards and terminology metadata, KFD-11 through KFD-13 draft activation
  discovery contracts and schemas, reference pages, decision markdown, and the
  package-owned Self-Conformance Profile, terminal evidence, and recursive live
  case projection.
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
