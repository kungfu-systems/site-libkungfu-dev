# site-libkungfu-dev

<!-- buildchain:badges:start -->
[![KFD-1: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-1/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-2: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-2/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-3: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-3/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-4: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-4/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-5: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-5/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-6: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-6/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-7: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-7/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-8: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-8/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-9: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-9/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-10: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-10/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-11: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-11/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-12: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-12/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-13: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-13/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
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

Primary homepages are bounded overview surfaces, not cumulative documentation
pages. Their stable depth routes own the material a reader only needs after the
first decision to continue:

- `https://libkungfu.dev/architecture/` — complete action-world, plural-Hub,
  qualification, quickstart, and release-trust architecture;
- `https://core.libkungfu.dev/` — complete Kungfu product and adoption-layer
  map; `/runtime/` retains the detailed runtime mechanism and `/decisions/`
  exposes the full ADR corpus;
- `https://buildchain.libkungfu.dev/mechanism/` — complete KFD-2/3 release-trust
  synthesis and package-owned Buildchain facts;
- `https://kfd.libkungfu.dev/decisions/` — complete KFD foundation, numbered
  authority, candidates, quickstart, and decision metadata; and
- `https://papers.libkungfu.dev/archive/` — publication source, versions,
  manifests, passports, and immutable archive evidence.

The checker enforces a visible-word budget for every primary homepage and
verifies that the removed detail still exists at its stable depth route.

The five-layer Agent Supply Chain composition retains the exact structured
snapshot from product White Paper `0.1.0-alpha.10`, pinned through an npm alias,
because `0.1.0-alpha.13` no longer exports that presentation contract. Current
White Paper pages, artifacts, metadata, and evidence use `0.1.0-alpha.13`.
The `0.1.0-alpha.13` npm tarball authenticates its current evidence bundle
inside the package-owned publication source archive even though the file is
absent from the top-level package tree. The renderer verifies the extracted
bytes against that version's publication-registry metadata and does not fall
back to an older unverified evidence bundle.
Buildchain, KFD, and Kungfu site package bundles remain authoritative for their
own mechanics and product facts.
This renderer publishes the shared composition at `/agent-supply-chain.json`
and keeps its human homepage projection aligned with that machine contract.

## Surfaces

- `https://libkungfu.dev` is the short builder entry to the open developer and
  agent substrate hub; `/architecture/` owns the full architecture.
- `https://kfx.libkungfu.dev` presents Kungfu Extensions to new readers while
  preserving KFX as the technical identity of its source-bound developer
  surface, manifest, architecture, and capability map.
- `https://libkungfu.dev/skills/` presents the user value of Kungfu Skills,
  compares them with familiar Agent Skills, explains no-code use, and shows a
  complex release example. Technical evidence moves to `/skills/spec/`; current,
  next, and future delivery horizons move to `/skills/roadmap/`. It remains a
  Site synthesis, not a released Skill runtime or catalog.
- `https://core.libkungfu.dev` presents the complete Kungfu product map:
  promise, `.kungfu` format, primitives, runtime, ABI, SDKs, KFX/Profile,
  CLI/TUI/GUI/App layers, qualification, ADR navigation, and domain horizons.
  Each depth route preserves its own maturity and non-claim boundary.
- `https://buildchain.libkungfu.dev` explains how KFD-3 value surfaces and
  KFD-2 trust evidence become release-bound facts that a Builder Hub can
  evaluate under its own admission policy; `/mechanism/` owns Buildchain's
  package-owned CI/CD, Release Passport, and release-governance facts.
- `https://kfd.libkungfu.dev` presents the continuity question and foundation
  triad; `/decisions/` owns the complete registry, standards metadata,
  candidates, schemas, and stable decision navigation.
- `https://papers.libkungfu.dev` presents Kungfu product and research papers,
  with PDF-first reader entrypoints; `/archive/` owns versions, immutable
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
authority. The Skills preview consumes `src/fixtures/skills-site.json`, whose
technical clauses bind to exact files and SHA-256 digests on one protected
Kungfu commit. The fixture preserves the upstream ADR's partial implementation
status and known limits; it does not convert source presence into a released or
qualified product claim. The Core page consumes the exact pinned
`@kungfu-tech/site@4.0.0-alpha.1` artifact generated by `framework/site` in the
Kungfu monorepo. The package owns the product facts, exact source roots,
maturity and non-claim boundaries, agent index, and ADR map; this repository
owns only reader framing, routing, and rendering. With registry publication now
available, the exact package coordinate is installed from the public npm
registry, locked by pnpm integrity, and verified against the package's embedded
source revision and content roots. The package transport is not a second
semantic authority. The Core `/format/` page first explains the portable work
handoff in human terms, then keeps the package-declared Spec pickup, normative
root, required-reader profiles, independent compatibility axes,
retained-vector qualification, and non-claims in a closed implementer and
auditor disclosure. Every packaged
`dist/site/format/**` artifact is copied byte-for-byte to the matching machine
route. The Buildchain page consumes
the pinned npm package artifact
`@kungfu-tech/buildchain@3.0.6-alpha.0` through its exported `dist/site` bundle.
The hosted Buildchain README badge endpoints are rendered at
`/badges/v1/{badge}/{state}.svg` and `/badges/v1/{badge}/{state}.json`. They
prefer the future Buildchain bundle registry
`@kungfu-tech/buildchain/dist/site/badge-endpoint-registry.json` and payloads
under `@kungfu-tech/buildchain/dist/site/badges/v1/**/*.json`; until that bundle
is published, the same contract is exercised through
`src/fixtures/buildchain-badge-endpoint-registry.json` and
`src/fixtures/badges/v1/**/*.json`.
The KFD page consumes the pinned npm package artifact
`@kungfu-tech/kfd@1.0.0-alpha.65` through `site/kfd-site.json`,
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
The package-owned Self-Conformance lane is rendered under
`/verify/self-conformance/`, with the reciprocal closed recursive case under
`/cases/live/recursive-normative-self-conformance/`. Exact Profile and terminal
evidence assets are copied byte-for-byte; the Site preserves the package's
no-new-KFD and non-authority boundaries.
The package-owned KFD-11 through KFD-13 draft activation discovery manifest and
its adopter-witness, qualification-report, and activation-record schemas are
published as stable machine entries. Their draft, non-normative status and
non-claim boundaries remain visible on the KFD reader and agent surfaces.
The papers surface consumes the exact `@kungfu-tech/paper-*` packages declared
in `src/publication-packages.json`. Package-local publication registries and
manifests own titles, abstracts, authors, routes, versions, PDFs, passports,
source bundles, and digests; the local package set owns only which published
papers appear on this site.

Expected upstream flow:

```text
kungfu framework/site -> @kungfu-tech/site exact npm pickup -> core.libkungfu.dev
buildchain -> @kungfu-tech/buildchain docs/site bundle -> site-libkungfu-dev -> buildchain.libkungfu.dev
buildchain -> @kungfu-tech/buildchain badge endpoint registry -> site-libkungfu-dev -> buildchain.libkungfu.dev/badges/v1
paper repositories -> @kungfu-tech/paper-* publication packages -> site-libkungfu-dev -> papers.libkungfu.dev
kfd -> @kungfu-tech/kfd site bundle -> site-libkungfu-dev -> kfd.libkungfu.dev
```

Do not invent upstream facts in this repository. Every Core product claim must
come from the pinned `@kungfu-tech/site` bundle, preserve its exact source,
maturity, qualification, and non-claim boundaries, and remain aligned across
human pages and machine entries.

### Upstream pickup modes

Paper and KFD releases keep their release-owned automatic capture path: an
exact published release can arrive as a paused downstream Work handoff. The
high-frequency Buildchain and Kungfu Core repositories are deliberately
different. Publishing an alpha or stable package there is inert for this
repository; it neither opens a pull request nor creates or mutates Site Work.

An Agent starts a code-upstream update only after an explicit downstream user
request:

```bash
pnpm run site:update -- plan "update the latest Buildchain content" alpha --json
pnpm run site:update -- plan kfd --handoff-work kfd-work.json --json
pnpm run site:update -- create buildchain alpha --output capture.json --json
pnpm run site:update -- apply capture.json claimed-work.json
pnpm run site:update -- work push-branch --work claimed-work.json --execute --json
```

`site:update` is the single Agent-facing entry for Paper, KFD, Buildchain, and
Kungfu Core. It reports the selected policy before any mutation: Paper and KFD
consume their exact release-owned paused Work handoff, while Buildchain and
Kungfu Core resolve a published package only after explicit downstream intent.
`plan` is read-only. Manual `create` freezes one exact published npm coordinate
and produces paused, unclaimed Work; it does not edit the repository. `apply`
requires that exact Work to have been claimed under Family State v2 and an
active execution Warrant, then updates only the declared package content and
release lock. `work push-branch` uses the released Buildchain executor, which
requires the exact repository, source `HEAD`, destination `refs/heads/*`, base
ancestry, and remote readback and never force-pushes. The existing protected
pull request, preview, review, staging, production, and online-readback stages
remain the delivery authority. Kungfu Core production accepts published
`@kungfu-tech/site` bytes only.

The direct `@kungfu-tech/buildchain` dependency is the content input rendered
on the Buildchain surface. The aliased `@kungfu-tech/buildchain-runtime`
dependency runs manual pickup. Neither replaces the independently reviewed
workflow revision or `.buildchain/contract-lock.json`.

### Preview an unpublished local Site bundle

An unpublished `framework/site` package can be rendered without changing the
production npm pin or pretending that local bytes have registry integrity.
Generate the package in a writable Kungfu worktree, then point this repository
at that exact package root:

```bash
cd /path/to/kungfu-worktree
./shifu --filter @kungfu-tech/site test

cd /path/to/site-libkungfu-dev-worktree
pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org/
KUNGFU_SITE_PACKAGE_ROOT=/path/to/kungfu-worktree/framework/site \
  pnpm run build:local-site-bundle
python3 -m http.server 4174 --directory dist/core-preview
```

Open `http://127.0.0.1:4174/`. The preview is generated entirely by
`renderProductSiteExperience()`: the first-screen Agent co-reading cue,
human-first sections, collapsed technical detail, KFD-3 machine entries, and
`Kungfu UNGFU™` brand/navigation all come from the local package. The generated
`local-pickup.json` binds the page bytes to the bundle and experience roots and
explicitly states that the pickup is neither an npm publication nor a
deployment.

Open `http://127.0.0.1:4174/format/` for the human format entry. Its visible
reading cards lead through all seven task guides and the complete overview,
CLI/Node/Python handbook, and historical-document library. Each rendered page
links to its exact Markdown source. The same preview also serves the packaged
`/format/manifest.json`, reader/compatibility/registry JSON routes, and retained
`/format/vectors/` corpus byte-for-byte; the local checker rejects missing
documents, missing evidence routes, broken internal links, and byte drift.
The primitives, runtime, ABI, SDK, extensions, products, qualification,
decisions, and horizons pages likewise expose a visible “Detailed
documentation” section. Together they render all thirty bundle-declared
product authorities under `/docs/authority/`, with exact raw bytes under
`/sources/`.

## Versioned multi-product installer

`https://libkungfu.dev/install/` is the human installation guide and
`https://libkungfu.dev/install.sh` is the public POSIX entry for KFD,
Buildchain, Kungfu, and Agent Hub Demo. No arguments prints help and makes no
machine changes. A person or Agent can select one exact version without writing
code:

```bash
curl -fsSL https://libkungfu.dev/install.sh | sh -s -- kfd
curl -fsSL https://libkungfu.dev/install.sh | sh -s -- buildchain --version 3.0.6
curl -fsSL https://libkungfu.dev/install.sh | sh -s -- all
```

KFD, Buildchain, and Kungfu are also available through the official Homebrew
tap when Homebrew should own installation, upgrades, and removal:

```bash
brew install kungfu-systems/tap/kfd
brew install kungfu-systems/tap/buildchain
brew install kungfu-systems/tap/kungfu
```

The single Site-maintained source catalog is `src/install/installer-catalog.json`. The build
publishes matching friendly and content-addressed routes at
`/install/v1/catalog.json`, `/install/v1/catalog/<sha256>.json`,
`/install/v1/manifest.json`, and `/installers/v1/<sha256>/install.sh`. It records
the exact upstream product, version, platform, byte size, SHA-256, provenance
URL, and release source SHA. The upstream GitHub Releases and Kungfu's signed
installer publication remain the release authorities; this site does not
create another release channel.

One Site refresh can admit one or several exact product releases:

```bash
pnpm run installer:refresh -- kfd@1.0.0-alpha.65
pnpm run installer:refresh -- kfd@1.0.0-alpha.65 kungfu@4.0.0-alpha.1 --write
```

The default mode is a read-only plan. `--write` verifies the exact GitHub
Release assets and product-owned provenance metadata before changing the
catalog, preserves every previously admitted version, and fails if an existing
`product@version` resolves to different bytes. It never follows `latest` or
mutates this repository from an upstream product release. After the reviewed
catalog change, the normal protected Site release updates the canonical
`https://libkungfu.dev/install.sh` and catalog routes together. Other web
surfaces can link to or redirect to that entry without maintaining installation
data of their own.

Installations use user-owned, content-addressed roots and bounded symlink
activation. The installer does not invoke `sudo`, edit shell startup files, or
write into Homebrew-owned prefixes. It rejects unrelated existing commands,
wrong sizes or digests, unsafe archives, unsupported targets, and partial
all-product activation. A previously activated managed version can be restored
with `install.sh PRODUCT --rollback`.

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
dispatches use the shared Buildchain v3 web-surface workflow for
preview, cleanup, staging, and production plans. Same-repository pull requests
apply short-lived preview deployments, pull request closure applies preview
cleanup, ordinary `main` pushes apply the protected staging deployment, and
merged release pull requests can apply the public production deployment. The
release-PR gate requires the `buildchain-release` label and a `release/` source
branch so production cannot drift from a reviewed release intent. Trusted manual
dispatch can still apply production with `production_approved=true`. Before either
production path enters Buildchain's publication authority, a production-only
preflight uses the organization governance auditor App and the exact selected
Buildchain runtime to collect a short-lived qualifying receipt for this repository
and target ref. The workflow
runs through an exact reviewed Buildchain v3 workflow revision and checks
`.buildchain/contract-lock.json` before rendering. The lock records the accepted
Buildchain runtime SHA and contract digests; changing the runtime is a reviewed
activation and must remain compatible with that accepted contract world. The
workflow runs `pnpm install` from the official npm registry before building so the
generated Buildchain page is based on `@kungfu-tech/buildchain@3.0.6-alpha.0` and the
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
Each immutable version `index.html` is itself recorded with a SHA-256 in the
publication manifest. The five version prefixes that predate this contract keep
their already-published legacy bytes; new paper versions are rendered by
`scripts/immutable-publication-page.cjs` under the frozen
`libkungfu-dev-immutable-publication-page-v1` contract. Mutable homepage,
navigation, and CSS changes therefore do not enter new immutable prefixes, and
the rollout does not rewrite historical objects.

Paper release propagation uses `scripts/paper-propagation.cjs`. `consume`
applies an exact release lock to `package.json` and
`src/publication-packages.json`; the caller must then refresh `pnpm-lock.yaml`.
`qualify` proves the installed package integrity and package-local publication
facts against that lock. It emits the Papers-only deployment fast path only
when the diff contains exactly the propagation lock and those three pin files.
Any extra changed path falls back to the full site deployment.

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
Buildchain `@v3-alpha`, and fails closed if the production release gate drifts.

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
