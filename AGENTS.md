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
  with the exact alpha tag or SHA. Its workflow shell stays on stable `v3` while
  the explicit runtime ref follows the alpha candidate; preview, staging, and
  production apply stay fixed to `false`.
- Keep generated product facts sourced from manifests under `src/fixtures/` or
  pinned upstream package artifacts. Core product facts come from
  `@kungfu-tech/site@4.0.0-alpha.1`; Buildchain facts come from
  `@kungfu-tech/buildchain@3.0.6-alpha.0`; KFD facts come from
  `@kungfu-tech/kfd@1.0.0-alpha.66`.
- Render the package-owned KFD Self-Conformance Profile as a first-class,
  non-normative verification lane. Preserve exact machine assets and terminal
  roots, keep Candidate and live-case status reciprocal, and never convert a
  verifier result into numbering, activation, merge, certification, or release
  authority.
- Buildchain and Kungfu Core are high-frequency code upstreams. Their package
  publications never trigger Site work. Start every requested Site upstream
  outcome through the explicit, read-only `pnpm run site:update -- plan
  <intent> [alpha|release] --json`; the entry selects the established automatic
  Paper/KFD handoff or downstream-manual Buildchain/Core policy. Only a
  user-requested downstream session may create, claim, and apply manual paused
  Work before reusing the protected Site delivery path.
- Keep content packages separate from execution authority. The direct
  `@kungfu-tech/buildchain` dependency supplies rendered Buildchain content;
  `@kungfu-tech/buildchain-runtime` supplies the exact manual-pickup runtime;
  workflow refs and `.buildchain/contract-lock.json` remain independent
  reviewed contract locks. Kungfu Core production facts must come only from a
  published `@kungfu-tech/site` package.
- Paper and KFD retain their release-owned automatic capture semantics. Do not
  route Buildchain or Kungfu Core through those upstream-triggered paths.
- Consume the Core bundle from the exact public npm coordinate. Verify pnpm
  integrity plus the package source and content roots, and render the packaged
  Spec authority instead of retaining a parallel local interpretation.
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
depth owners: `/architecture/`, Core product bundle routes, Buildchain
`/mechanism/`, KFD `/decisions/`, and Papers `/archive/`. Do not render the same
complete detail on both the overview and its depth page;
`scripts/check-site.sh` owns the homepage word budgets and required detail-route
assertions.

The repository itself is a Kungfu product surface. Treat changes here as work
governed by the current KFD registry: keep source boundaries explicit, expose
audit and integrity facts for generated pages, preserve matching human and
agent entrypoints, and make perspective-bearing timeline or release views state
their observer. A future renderer npm package from this repository must carry
the same standard for any Kungfu-compliant site bundle it renders.
