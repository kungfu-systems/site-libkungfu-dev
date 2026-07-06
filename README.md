# site-libkungfu-dev

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
`@kungfu-tech/buildchain@2.4.1` through its exported `dist/site` bundle.
The KFD page consumes the pinned npm package artifact
`@kungfu-tech/kfd@1.0.0-alpha.3` through `site/kfd-site.json`,
`registry.json`, `standards.json`, and decision markdown exports.

Expected upstream flow:

```text
kungfu -> @kungfu-tech/spec -> site-libkungfu-dev -> core.libkungfu.dev
buildchain -> @kungfu-tech/buildchain docs/site bundle -> site-libkungfu-dev -> buildchain.libkungfu.dev
kfd -> @kungfu-tech/kfd site bundle -> site-libkungfu-dev -> kfd.libkungfu.dev
```

Do not hand-write upstream facts in this repository. When more upstream
packages publish real manifests, replace the remaining fixture inputs with
pinned package artifacts.

## Local Check

```bash
npm ci --ignore-scripts --registry=https://registry.npmjs.org/
npm run build
npm run check
```

The build writes `dist/`. The `npm ci` step makes the pinned Buildchain site
bundle available from `node_modules/`. When a Buildchain release propagation PR
adds `buildchain.upstreams/kfd.release.json`, run
`node scripts/prepare-kfd-upstream.mjs` before `npm ci`; it pins
`@kungfu-tech/kfd` to the exact upstream release version from the lock.

## Buildchain

This site is a Buildchain `web-surface` project. Pull requests and manual
dispatches use the shared Buildchain v2.4 web-surface workflow for
preview, cleanup, staging, and production plans. Same-repository pull requests
apply short-lived preview deployments, pull request closure applies preview
cleanup, and `main` pushes apply the protected staging deployment. The workflow
runs `npm ci` from the official npm registry before building so the generated
Buildchain page is based on `@kungfu-tech/buildchain@2.4.1` and the generated
KFD page is based on `@kungfu-tech/kfd@1.0.0-alpha.3`. Production apply remains
disabled.

KFD release propagation writes `buildchain.upstreams/kfd.release.json`. The
workflow consumes that lock before install, updates the local package pin and
lockfile inside the build workspace, and verifies that the rendered
`kfd.libkungfu.dev` pages match the exact KFD release version and integrity.

Staging is modeled as managed-network protected, not edge Basic Auth protected.
The AWS deployment targets are modeled in the private infrastructure contract.
Production remains `pending` until the public host aliases and DNS for all
declared surfaces are ready.

The AWS delivery contract is mirrored in `infra/outputs.json` from the private
`kungfu-systems/infra-kungfu-sites` repository. `npm run check` verifies that
`buildchain.toml` and the GitHub Actions role assumptions still match that
contract, wires all declared role references, and keeps production apply off
while production is pending.

```bash
BUILDCHAIN_DIR=/path/to/buildchain
npm ci --ignore-scripts --registry=https://registry.npmjs.org/
npm run build
npm run check
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode validate --cwd .
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel preview --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel staging --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel production --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode cleanup-plan --cwd . --channel preview --pull-number 123 --source-sha "$(git rev-parse HEAD)"
```
