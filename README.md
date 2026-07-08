# site-libkungfu-dev

<!-- buildchain:badges:start -->
[![KFD-1: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-1/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-2: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-2/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-3: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-3/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![KFD-4: planned](https://buildchain.libkungfu.dev/badges/v1/kfd-4/planned.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![Buildchain Release Passport: declared](https://buildchain.libkungfu.dev/badges/v1/buildchain-release-passport/declared.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/releases/latest/download/buildchain.release.json)
[![Buildchain Web Surface](https://github.com/kungfu-systems/site-libkungfu-dev/actions/workflows/buildchain-web-surface.yml/badge.svg)](https://github.com/kungfu-systems/site-libkungfu-dev/actions/workflows/buildchain-web-surface.yml)
<!-- buildchain:badges:end -->

Source for the planned Kungfu developer and agent substrate hub at
`https://libkungfu.dev`.

This repository is a rendering layer. It may own visual structure, routing,
homepage narrative, and static generation code, but it must not become a second
source of truth for core specs, CLI flags, workflow inputs, release state
machines, artifact schemas, or provenance facts.

## Surfaces

- `https://libkungfu.dev` is the open developer and agent substrate hub.
- `https://core.libkungfu.dev` presents libkungfu, yijinjing, runtime fact
  ledger, spec, schema registry, vectors, and stable docs URLs.
- `https://buildchain.libkungfu.dev` presents Buildchain as the Kungfu CI/CD and
  release-governance product surface.
- `https://kfd.libkungfu.dev` presents Kung Fu Decisions as the organization
  decision registry, standards metadata, schemas, and stable decision pages.
- `https://kungfu.tech` remains the end-user, buyer, and Kungfu Rewind product
  home.

## Source Boundary

The generated hub and core pages currently consume fixture manifests under
`src/fixtures/`. The Buildchain page consumes the pinned npm package artifact
`@kungfu-tech/buildchain@2.10.4` through its exported `dist/site` bundle.
The hosted Buildchain README badge endpoints are rendered at
`/badges/v1/{badge}/{state}.svg` and `/badges/v1/{badge}/{state}.json`. They
prefer the future Buildchain bundle registry
`@kungfu-tech/buildchain/dist/site/badge-endpoint-registry.json` and payloads
under `@kungfu-tech/buildchain/dist/site/badges/v1/**/*.json`; until that bundle
is published, the same contract is exercised through
`src/fixtures/buildchain-badge-endpoint-registry.json` and
`src/fixtures/badges/v1/**/*.json`.
The KFD page consumes the pinned npm package artifact
`@kungfu-tech/kfd@1.0.0-alpha.19` through `site/kfd-site.json`,
`registry.json`, `standards.json`, and decision markdown exports.

Expected upstream flow:

```text
kungfu -> @kungfu-tech/spec -> site-libkungfu-dev -> core.libkungfu.dev
buildchain -> @kungfu-tech/buildchain docs/site bundle -> site-libkungfu-dev -> buildchain.libkungfu.dev
buildchain -> @kungfu-tech/buildchain badge endpoint registry -> site-libkungfu-dev -> buildchain.libkungfu.dev/badges/v1
kfd -> @kungfu-tech/kfd site bundle -> site-libkungfu-dev -> kfd.libkungfu.dev
```

Do not hand-write upstream facts in this repository. When more upstream
packages publish real manifests, replace the remaining fixture inputs with
pinned package artifacts.

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
adds `buildchain.upstreams/kfd.release.json`, run
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
runs through the floating Buildchain `@v2` workflow ref and checks
`buildchain.contract-lock.json` before rendering. The lock records the accepted
Buildchain runtime SHA and contract digests; `@v2` is allowed to move only when
the current contract remains compatible with that accepted contract world. The
workflow runs `pnpm install` from the official npm registry before building so the
generated Buildchain page is based on `@kungfu-tech/buildchain@2.10.4` and the
generated KFD page is based on `@kungfu-tech/kfd@1.0.0-alpha.19`.

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

KFD release propagation writes `buildchain.upstreams/kfd.release.json`. The
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
`buildchain.toml` and the GitHub Actions role assumptions still match that
contract, wires all declared role references, keeps the workflow shell on
Buildchain `@v2`, and fails closed if the production release gate drifts.

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
