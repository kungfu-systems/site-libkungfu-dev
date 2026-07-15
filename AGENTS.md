# site-libkungfu-dev

This repository renders the `libkungfu.dev` developer and agent substrate hub.

## Product Use

- Use `docs/MAP.md` for the site map and stable machine entry points.
- Use `/llms.txt` and `/manifest.json` in the generated artifact for agent
  consumption.

## Development

- Run `npm run build` before checking generated output.
- Run `npm run check` before opening a pull request.
- Before a stable Buildchain promotion, manually dispatch `Buildchain Stable Canary`
  with the exact alpha tag or SHA. Its workflow shell stays on stable `v2` while
  the explicit runtime ref follows the alpha candidate; preview, staging, and
  production apply stay fixed to `false`.
- Keep generated product facts sourced from manifests under `src/fixtures/` or
  pinned upstream package artifacts. Buildchain facts currently come from
  `@kungfu-tech/buildchain@2.11.13`; KFD facts currently come from
  `@kungfu-tech/kfd@1.0.0-alpha.24`.
- Buildchain hosted README badge endpoints are generated under
  `/badges/v1/{badge}/{state}.svg` and `.json`. Prefer the Buildchain package
  `dist/site/badge-endpoint-registry.json` and `dist/site/badges/v1/**/*.json`
  when present; keep the same-structure fixtures only as the pre-release
  fallback.
- Publication archive routes are generated under `/papers/**`. Prefer the
  exact paper packages declared in `src/publication-packages.json`. Each paper
  package owns its publication registry, manifest, PDF, passport, source bundle,
  routes, and digests; this repository owns only package-set membership,
  aggregation, rendering, and deployment-environment links.

## Boundary

This repository may own rendering, navigation, and page structure. It must not
hand-write core spec facts, Buildchain CLI facts, workflow inputs, release state
machines, artifact schemas, or provenance facts.

The repository itself is a Kungfu product surface. Treat changes here as work
governed by the current KFD registry: keep source boundaries explicit, expose
audit and integrity facts for generated pages, preserve matching human and
agent entrypoints, and make perspective-bearing timeline or release views state
their observer. A future renderer npm package from this repository must carry
the same standard for any Kungfu-compliant site bundle it renders.
