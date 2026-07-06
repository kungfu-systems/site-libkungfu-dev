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
  `@kungfu-tech/buildchain@2.8.1`.

## Boundary

This repository may own rendering, navigation, and page structure. It must not
hand-write core spec facts, Buildchain CLI facts, workflow inputs, release state
machines, artifact schemas, or provenance facts.
