# site-libkungfu-dev

This repository owns the reader contract and renders the `libkungfu.dev`
developer and agent substrate hub.

## Product Use

- Use `docs/MAP.md` for the site map and stable machine entry points.
- Use `/llms.txt` and `/manifest.json` in the generated artifact for agent
  consumption.
- Use `src/fixtures/site-manifest.json#readerContract` as the site-owned
  contract for first-screen framing, audience, cross-surface synthesis, reading
  order, progressive disclosure, navigation, and visual composition.

## Development

- Run `npm run build` before checking generated output.
- Run `npm run check` before opening a pull request.
- Render bundle-declared KFD candidates, candidate formal children, decision
  usage children, and decision formal reference children as governed pages.
  Preserve each declared parent as authority, keep candidates explicitly
  non-normative, and expose every page's relationship, status, model metadata,
  and source path.
- Before a stable Buildchain promotion, manually dispatch `Buildchain Stable Canary`
  with the exact alpha tag or SHA. Its workflow shell stays on stable `v2` while
  the explicit runtime ref follows the alpha candidate; preview, staging, and
  production apply stay fixed to `false`.
- Keep generated product facts sourced from manifests under `src/fixtures/` or
  pinned upstream package artifacts. Buildchain facts currently come from
  `@kungfu-tech/buildchain@2.14.13`; KFD facts currently come from
  `@kungfu-tech/kfd@1.0.0-alpha.40`.
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

This repository owns first-screen propositions, audience framing,
cross-surface synthesis, reading order, progressive disclosure, navigation,
visual composition, rendering, and page structure. Site-authored synthesis is
non-normative and must cite exact upstream sources.

This repository must not hand-write or reinterpret core runtime semantics, KFD
decisions or protocol semantics, Buildchain CLI facts, workflow inputs, release
state machines, artifact schemas, qualification results, or provenance facts.
Those remain owned by pinned upstream evidence, manifests, and packages.

Generated human pages, `/llms.txt`, `/manifest.json`, and stable machine
entries must expose the same reader layers, claim classes, source references,
claim boundaries, and down-level authority routes. A concise first screen may
hide detail, but it may not delete the upstream content or strengthen a claim.
Keep the primary homepages bounded and route complete detail to their stable
depth owners: `/architecture/`, Core `/runtime/`, Buildchain `/mechanism/`, KFD
`/decisions/`, and Papers `/archive/`. Do not render the same complete detail on
both the overview and its depth page; `scripts/check-site.sh` owns the homepage
word budgets and required detail-route assertions.

The repository itself is a Kungfu product surface. Treat changes here as work
governed by the current KFD registry: keep source boundaries explicit, expose
audit and integrity facts for generated pages, preserve matching human and
agent entrypoints, and make perspective-bearing timeline or release views state
their observer. A future renderer npm package from this repository must carry
the same standard for any Kungfu-compliant site bundle it renders.
