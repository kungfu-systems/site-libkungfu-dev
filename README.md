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

The generated pages currently consume fixture manifests under `src/fixtures/`.
Those fixtures define the integration contract while the real upstream bundles
are not available yet.

Expected upstream flow:

```text
kungfu -> @kungfu-tech/spec -> site-libkungfu-dev -> core.libkungfu.dev
buildchain -> @kungfu-tech/buildchain docs/site bundle -> site-libkungfu-dev -> buildchain.libkungfu.dev
```

When upstream packages start publishing real manifests, replace the fixture
inputs with pinned package artifacts. Do not hand-write upstream facts in this
repository.

## Local Check

```bash
npm run build
npm run check
```

The build uses only Node.js built-in modules and writes `dist/`.

## Buildchain

This site is a Buildchain `web-surface` project. Pull requests use the shared
Buildchain v2 web-surface workflow for preview plans, PR-close cleanup plans,
main-merge staging plans, and explicitly gated production plans.

Staging is modeled as managed-network protected, not edge Basic Auth protected.
The AWS deployment targets are placeholders until the `libkungfu.dev` static
delivery resources are explicitly provisioned.

```bash
BUILDCHAIN_DIR=/path/to/buildchain
npm run build
npm run check
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode validate --cwd .
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel preview --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode deploy-plan --cwd . --channel staging --source-sha "$(git rev-parse HEAD)"
node "$BUILDCHAIN_DIR/scripts/web-surface.mjs" --mode cleanup-plan --cwd . --channel preview --pull-number 123 --source-sha "$(git rev-parse HEAD)"
```
