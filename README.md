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
- `https://kungfu.tech` remains the end-user, buyer, and Kungfu Rewind product
  home.

## Source Boundary

The generated hub and core pages currently consume fixture manifests under
`src/fixtures/`. The Buildchain page consumes the pinned npm package artifact
`@kungfu-tech/buildchain@2.3.0` through its exported `dist/site` bundle.

Expected upstream flow:

```text
kungfu -> @kungfu-tech/spec -> site-libkungfu-dev -> core.libkungfu.dev
buildchain -> @kungfu-tech/buildchain docs/site bundle -> site-libkungfu-dev -> buildchain.libkungfu.dev
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
bundle available from `node_modules/`.

## Buildchain

This site is a Buildchain `web-surface` project. Pull requests use the shared
Buildchain v2.3 web-surface workflow for preview plans, PR-close cleanup plans,
main-merge staging plans, and explicitly gated production plans. The workflow
runs `npm ci` from the official npm registry before building so the generated
Buildchain page is based on `@kungfu-tech/buildchain@2.3.0`.

Staging is modeled as managed-network protected, not edge Basic Auth protected.
The AWS deployment targets are placeholders until the `libkungfu.dev` static
delivery resources are explicitly provisioned.

The AWS delivery contract is mirrored in `infra/outputs.json` from the private
`kungfu-systems/infra-kungfu-sites` repository. `npm run check` verifies that
`buildchain.toml` and the GitHub Actions role assumptions still match that
contract.

```bash
BUILDCHAIN_DIR=/path/to/buildchain
npm ci --ignore-scripts --registry=https://registry.npmjs.org/
npm run build
npm run check
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode validate --cwd .
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel preview --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel staging --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode cleanup-plan --cwd . --channel preview --pull-number 123 --source-sha "$(git rev-parse HEAD)"
```
