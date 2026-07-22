# site-libkungfu-dev

<!-- buildchain:badges:start -->
[![KFD-1: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-1/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-2: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-2/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-3: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-3/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-4: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-4/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-5: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-5/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-6: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-6/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-7: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-7/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![Buildchain Release Passport: declared](https://buildchain.libkungfu.dev/badges/v1/buildchain-release-passport/declared.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![Buildchain Web Surface](https://github.com/kungfu-systems/site-libkungfu-dev/actions/workflows/buildchain-web-surface.yml/badge.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/actions/workflows/buildchain-web-surface.yml)
<!-- buildchain:badges:end -->

Source for the planned Kungfu developer and agent substrate hub at
`https://libkungfu.dev`.

This repository owns the site's reader contract: first-screen propositions,
audience framing, cross-surface synthesis, reading order, progressive
disclosure, navigation, visual composition, and static generation. It is not a
second source of truth for runtime semantics, KFD decisions, CLI flags,
workflow inputs, release state machines, artifact schemas, qualification, or
provenance facts.

## Reader Contract

Every primary surface follows the same four-layer reading model:

1. a site-owned first screen answers why the surface matters to its reader;
2. site-owned guided synthesis connects the relevant Kungfu, KFD, and
   Buildchain facts without becoming normative;
3. pinned upstream pages and packages remain the technical authority; and
4. manifests, agent indexes, source refs, versions, digests, qualification,
   and claim boundaries expose the machine evidence.

The human pages, `/llms.txt`, `/manifest.json`, and surface manifests must carry
the same reader paths and claim boundaries. Every site-authored technical
synthesis clause must cite a source from
`src/fixtures/site-manifest.json#readerContract.sources`. Progressive
disclosure may move detail down-level; it may not delete upstream content,
break a stable route, or upgrade an alpha contract, reference implementation,
or future picture into a present ecosystem claim.

## Surfaces

- `https://libkungfu.dev` is the open developer and agent substrate hub.
- `https://core.libkungfu.dev` presents the libkungfu runtime substrate: the
  mmap journal as retained evidence and local observation bus, its explicit
  visibility/durability boundaries, and the secondary spec/source contract.
- `https://buildchain.libkungfu.dev` presents Buildchain as the Kungfu CI/CD and
  release-governance product surface.
- `https://kfd.libkungfu.dev` presents Kung Fu Decisions as the organization
  decision registry, standards metadata, schemas, and stable decision pages.
- `https://papers.libkungfu.dev` presents Kungfu product and research papers,
  PDF-first reader entrypoints, mutable latest routes, immutable versioned
  artifact prefixes, and agent-readable publication evidence.
- `https://kungfu.tech` remains the end-user, buyer, and Kungfu Rewind product
  home.

## Source Boundary

The site owns how readers enter and traverse the evidence, while upstream
projects own what the evidence means. The generated hub page consumes fixture
manifests under `src/fixtures/`. Its
`/runtime.json` projection pins the reviewed Kungfu source, Project Cut, KFD
Runtime 100 suite root, package availability, qualification, and claim
boundary; it does not publish packages or become the runtime/conformance
authority. The Core page consumes `core-runtime-surface.json`, an
evidence-linked presentation fixture whose mmap and recovery claims are pinned
to one exact Kungfu source ref. It owns the homepage hierarchy and wording, not
the runtime facts; the previous `@kungfu-tech/spec` placeholder remains a
secondary source contract inside that fixture instead of determining the
homepage. The Buildchain page consumes the pinned npm package artifact
`@kungfu-tech/buildchain@2.14.13` through its exported `dist/site` bundle.
The hosted Buildchain README badge endpoints are rendered at
`/badges/v1/{badge}/{state}.svg` and `/badges/v1/{badge}/{state}.json`. They
prefer the future Buildchain bundle registry
`@kungfu-tech/buildchain/dist/site/badge-endpoint-registry.json` and payloads
under `@kungfu-tech/buildchain/dist/site/badges/v1/**/*.json`; until that bundle
is published, the same contract is exercised through
`src/fixtures/buildchain-badge-endpoint-registry.json` and
`src/fixtures/badges/v1/**/*.json`.
The KFD page consumes the pinned npm package artifact
`@kungfu-tech/kfd@1.0.0-alpha.40` through `site/kfd-site.json`,
`registry.json`, `standards.json`, and decision markdown exports. Bundle-declared
foundation, formal-model, and terminology references are rendered as first-class
pages; the terminology contract and schema remain available as machine-readable
JSON endpoints. Bundle-declared usage and non-normative formal reference
children are rendered under
`/{number}/usage/` and `/{number}/formal/`; the decision remains their authority
and the site does not promote a formal reference into a new decision.
Bundle-declared formal candidate children are rendered under
`/drafts/{id}/formal/`; their parent candidate remains the non-normative
authority and both human and agent surfaces expose the declared relationship.
Bundle-declared pre-number candidates are rendered under `/drafts/` with their
non-normative status, claim boundary, and machine registry preserved.
The papers surface consumes the exact `@kungfu-tech/paper-*` packages declared
in `src/publication-packages.json`. Package-local publication registries and
manifests own titles, abstracts, authors, routes, versions, PDFs, passports,
source bundles, and digests; the local package set owns only which published
papers appear on this site.

Expected upstream flow:

```text
kungfu evidence -> evidence-linked Core surface fixture -> core.libkungfu.dev
kungfu -> future @kungfu-tech/spec or Core site bundle -> replace the fixture source contract
buildchain -> @kungfu-tech/buildchain docs/site bundle -> site-libkungfu-dev -> buildchain.libkungfu.dev
buildchain -> @kungfu-tech/buildchain badge endpoint registry -> site-libkungfu-dev -> buildchain.libkungfu.dev/badges/v1
paper repositories -> @kungfu-tech/paper-* publication packages -> site-libkungfu-dev -> papers.libkungfu.dev
kfd -> @kungfu-tech/kfd site bundle -> site-libkungfu-dev -> kfd.libkungfu.dev
```

Do not invent upstream facts in this repository. Until Kungfu publishes a Core
site bundle, every runtime claim in the temporary Core fixture must cite an
immutable Kungfu source ref, preserve its qualification/non-claim boundary,
and appear identically in the Core human and machine surfaces. Replace that
fixture with a pinned package artifact when the upstream bundle exists.

## KFD Compliance

This repository is itself a Kungfu product surface and must follow the current
KFD registry:

- KFD-1: every rendered product fact must identify its upstream source package,
  fixture, version, and ownership boundary.
- KFD-2: generated pages and machine entries must expose enough package,
  integrity, renderer-contract, and release-propagation facts for another agent
  to audit why the page changed.
- KFD-3: human pages, `/manifest.json`, `/llms.txt`, and stable subdomain paths
  must all describe the same product mechanism so humans and agents consume the
  same release surface.
- KFD-4: perspective-bearing timeline or release views must expose their
  observer and projection boundary instead of presenting mixed-source order as
  a view from nowhere.

The long-term renderer package from this repository should therefore render any
Kungfu-compliant site bundle as a governed product surface, not as detached
Markdown-to-HTML output.

## Local Check

```bash
pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org/
pnpm run build
pnpm run check
```

The build writes `dist/`. The `pnpm install` step makes the pinned Buildchain site
bundle available from `node_modules/`. When a Buildchain release propagation PR
adds `.buildchain/upstreams/kfd.release.json`, run
`node scripts/prepare-kfd-upstream.mjs` before `pnpm install --lockfile-only`;
it pins `@kungfu-tech/kfd` to the exact upstream release version from the lock.
The same preparation step refreshes the exact `minimumReleaseAgeExclude` entry
in `pnpm-workspace.yaml`, so newly published KFD alpha packages can be rendered
without disabling the age policy for unrelated dependencies.

## Buildchain

This site is a Buildchain `web-surface` project. Pull requests and manual
dispatches use the shared Buildchain v2 web-surface workflow for
preview, cleanup, staging, and production plans. Same-repository pull requests
apply short-lived preview deployments, pull request closure applies preview
cleanup, ordinary `main` pushes apply the protected staging deployment, and
merged release pull requests can apply the public production deployment. The
release-PR gate requires the `buildchain-release` label and a `release/` source
branch so production cannot drift from a reviewed release intent. Trusted manual
dispatch can still apply production with `production_approved=true`. The workflow
runs through the floating Buildchain `@v2-alpha` workflow ref and checks
`.buildchain/contract-lock.json` before rendering. The lock records the accepted
Buildchain runtime SHA and contract digests; `@v2-alpha` is allowed to move only when
the current contract remains compatible with that accepted contract world. The
workflow runs `pnpm install` from the official npm registry before building so the
generated Buildchain page is based on `@kungfu-tech/buildchain@2.14.13` and the
generated KFD page is based on the exact `@kungfu-tech/kfd` release recorded in
`.buildchain/upstreams/kfd.release.json`.

The site does not override Buildchain's own transitive dependencies. If a
Buildchain package declares its own `@kungfu-tech/kfd` dependency, that version
belongs to Buildchain's published npm metadata. The site only pins the direct
KFD artifact it consumes for rendering `kfd.libkungfu.dev`.

Buildchain-owned README badges use stable hosted URLs such as
`https://buildchain.libkungfu.dev/badges/v1/kfd-1/passed.svg`. The site owns the
SVG renderer and the placeholder logo policy
`logoPolicy.placeholder = "buildchain-monogram"`; consumers should not encode a
logo asset in README URLs. When Buildchain publishes the formal badge endpoint
registry and payloads in its site bundle, this repository can switch from the
fixture data to the package data without changing consumer README links. A later
official Buildchain logo change is handled by redeploying or purging the site
asset/renderer, not by regenerating downstream README badges.

Publication archives follow the same source-boundary rule. The site renders the
archive UI and static files, but canonical reader URLs, latest aliases,
immutable version prefixes, artifact hashes, source bundles, passports, and
release registry entries come from each pinned paper package. Buildchain owns
the publication contracts and release mechanism; it does not own the changing
facts of every paper release. `scripts/publication-packages.cjs` verifies and
aggregates the package-local registries without copying paper facts into site
source.
`pnpm run check` fails if a declared immutable version artifact disappears,
if a digest drifts, or if the generated manifests omit the immutable route
semantics.

KFD release propagation writes `.buildchain/upstreams/kfd.release.json`. The
workflow consumes that lock before install, updates the local package pin and
pnpm lockfile inside the build workspace, and verifies that the rendered
`kfd.libkungfu.dev` pages match the exact KFD release version and integrity.

Preview and staging are modeled as managed-network protected, not edge Basic
Auth protected. This lets Buildchain verify deploy health from deployment
evidence or S3 object checks when public HTTP access is intentionally blocked.
The AWS deployment targets are modeled in the private infrastructure contract.
Production is active and remains gated by Buildchain release intent or trusted
manual approval.

The AWS delivery contract is mirrored in `infra/outputs.json` from the private
`kungfu-systems/infra-kungfu-sites` repository. `pnpm run check` verifies that
`.buildchain/buildchain.toml` and the GitHub Actions role assumptions still match that
contract, wires all declared role references, keeps the workflow shell on
Buildchain `@v2-alpha`, and fails closed if the production release gate drifts.

```bash
BUILDCHAIN_DIR=/path/to/buildchain
pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org/
pnpm run build
pnpm run check
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode validate --cwd .
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel preview --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel staging --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel production --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode cleanup-plan --cwd . --channel preview --pull-number 123 --source-sha "$(git rev-parse HEAD)"
```
