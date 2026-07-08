# site-libkungfu-dev

This repository renders the `libkungfu.dev` developer and agent substrate hub.

## Product Use

- Use `docs/MAP.md` for the site map and stable machine entry points.
- Use `/llms.txt` and `/manifest.json` in the generated artifact for agent
  consumption.

## Development

- Run `npm run build` before checking generated output.
- Run `npm run check` before opening a pull request.
- Keep generated product facts sourced from manifests under `src/fixtures/` or
  pinned upstream package artifacts. Buildchain facts currently come from
  `@kungfu-tech/buildchain@2.9.1`; KFD facts currently come from
  `@kungfu-tech/kfd@1.0.0-alpha.19`.
- Buildchain hosted README badge endpoints are generated under
  `/badges/v1/{badge}/{state}.svg` and `.json`. Prefer the Buildchain package
  `dist/site/badge-endpoint-registry.json` and `dist/site/badges/v1/**/*.json`
  when present; keep the same-structure fixtures only as the pre-release
  fallback.

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
