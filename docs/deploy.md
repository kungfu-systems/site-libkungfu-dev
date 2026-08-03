# Deploy

The intended public URL is `https://libkungfu.dev`.

Channel model:

- Preview:
  - `https://{alias}.preview.libkungfu.dev`
  - `https://core-{alias}.preview.libkungfu.dev`
  - `https://buildchain-{alias}.preview.libkungfu.dev`
  - `https://kfd-{alias}.preview.libkungfu.dev`
- Staging:
  - `https://staging.libkungfu.dev`
  - `https://core.staging.libkungfu.dev`
  - `https://buildchain.staging.libkungfu.dev`
  - `https://kfd.staging.libkungfu.dev`
- Production:
  - `https://libkungfu.dev`
  - `https://core.libkungfu.dev`
  - `https://buildchain.libkungfu.dev`
  - `https://kfd.libkungfu.dev`

The site artifact is static today, but the channel model must stay compatible
with future dynamic adapters. Buildchain remains the deployment state machine:
the release object is source commit plus build artifact plus deploy target plus
channel plus deployment manifest.

Every site build resolves the public dogfood latest alias to its matching
immutable snapshot, verifies the repository evidence contract and identical
bytes, and embeds that admitted snapshot in `/dogfood/`. The retained fixture
is used only when the public latest/immutable pair cannot be verified. This
keeps the initial HTML useful to no-JavaScript readers and records the selected
immutable URL and SHA-256 in the site manifest; browser-side refresh may advance
the view but must never replace the embedded observation with an older one.
Published builds fail closed if the latest/immutable pair cannot be admitted;
local builds may retain the repository fixture as an explicit offline fallback.

The AWS resource contract is owned by the private
`kungfu-systems/infra-kungfu-sites` repository and mirrored into this repository
as `infra/outputs.json`. Site changes may update content, Buildchain wiring, and
the mirrored outputs after an infra change, but CloudFormation templates and AWS
resource lifecycle decisions belong in the infra repository.

## Current State

- The repository builds a static `dist/` artifact.
- Buildchain validation and preview, cleanup, staging, and production planning
  are enabled through the shared web-surface workflow.
- The workflow consumes Buildchain through the floating `@v3-alpha` workflow ref and
  records the accepted runtime contract in `.buildchain/contract-lock.json`.
  The build checks that lock before rendering so `@v3-alpha` movement is audited as
  compatible drift or blocked as breaking drift.
- Preview, preview cleanup, and staging apply are enabled in the repository
  workflow so same-repository pull requests publish short-lived preview
  surfaces, closed pull requests clean them up, and `main` pushes publish the
  protected staging channel.
- The workflow uses the Buildchain v3 first-class surface host mappings, so each
  surface has a host-level preview and staging URL instead of only a path
  fallback under the hub URL.
- Production apply is enabled because the production channel status is active in
  the infrastructure contract. Buildchain still gates production on trusted
  manual approval or a merged release pull request with the `buildchain-release`
  label and a `release/` source branch.
- Staging is modeled as managed-network protected, matching the current Kungfu
  site policy. Do not add Basic Auth secrets to this repository.

## Source Boundary

Deployment must not turn this repository into a fact source. The artifact should
render pinned upstream bundles:

```text
kungfu evidence -> framework/site -> @kungfu-tech/site exact npm pickup -> core.libkungfu.dev
buildchain -> @kungfu-tech/buildchain docs/site bundle -> site-libkungfu-dev -> buildchain.libkungfu.dev
kfd -> @kungfu-tech/kfd site bundle -> site-libkungfu-dev -> kfd.libkungfu.dev
paper repositories -> @kungfu-tech/paper-* publication packages -> site-libkungfu-dev -> papers.libkungfu.dev
```

The Core surface consumes the exact pinned `@kungfu-tech/site` package generated
by Kungfu's `framework/site` package, and the hub routes readers to that
package-backed Core surface. The package carries the complete product map,
qualification boundaries, authority-source inventory, ADR map, source revision,
and content roots; the renderer must reproduce its machine artifacts
byte-for-byte and must not maintain a parallel Core claim fixture. The exact
public npm coordinate, package integrity, clean source revision, and bundle
roots bind the rendered content to Kungfu. Consuming the package is repository
integration, not an npm publication or a production release; each release
action remains a separate, explicitly admitted step.
The Core `/format/` human page is generated from the package's
`formatAuthority` projection, while the complete packaged `dist/site/format/**`
tree is copied byte-for-byte to the matching Core machine routes.
Buildchain uses the pinned `@kungfu-tech/buildchain@3.0.6-alpha.0` npm package
and its exported `dist/site` bundle. KFD uses the pinned
`@kungfu-tech/kfd@1.0.0-alpha.47` package and its exported site bundle. Papers
use the exact package set in
`src/publication-packages.json`; deploys must preserve declared immutable
version prefixes while allowing canonical and latest pages to advance.
For an exact paper package-pin propagation, the build runs
`scripts/paper-propagation.cjs qualify` after dependency installation. A
qualified `package-pin-only` envelope narrows Buildchain to the Papers surface,
the newly declared immutable version prefix, and the bounded mutable
index/registry/latest files. Any non-pin change omits that envelope and retains
the full deployment path. Qualification does not promote channels:
package-published, alpha-complete, staging-visible, and production-visible are
separate facts.

### Manual code-upstream pickup

Buildchain and Kungfu Core package publication is intentionally inert for Site:
there is no webhook, scheduled poll, generated pull request, or automatic Work
capture for those two high-frequency code repositories. A user-requested Agent
session runs `pnpm run upstream:pickup -- plan ... --json`, freezes an exact
eligible published npm package with registry provenance via `create`, claims
the paused Work under Family State v2 and an active Warrant, and only then runs
`apply`. A current coordinate is an explicit no-op and creates no Work.

After materialization, the normal Buildchain web-surface stages remain
unchanged: protected branch, pull request, preview, independent review,
protected merge, staging, release pull request, production deployment, and
exact online readback. Production Kungfu Core content can come only from the
published `@kungfu-tech/site` package; local Core builds are preview-only and
cannot qualify merge, deployment, or completion evidence.

The direct `@kungfu-tech/buildchain` package supplies Site content. The exact
`@kungfu-tech/buildchain-runtime` alias performs registry resolution and Work
materialization. The workflow ref and `.buildchain/contract-lock.json` remain
separate execution and contract authorities, so a content update cannot
silently move the workflow runtime.

The infrastructure contract publishes Papers as a first-class surface in every
channel: `papers-{alias}.preview.libkungfu.dev`,
`papers.staging.libkungfu.dev`, and `papers.libkungfu.dev`.

Do not store AWS credentials in this repository.

## Production Readiness

The workflow carries the planned production role reference so Buildchain can
plan the production channel with the same contract shape as other sites.
`production-apply` stays wired to the mirrored infrastructure contract as a
production capability switch. It does not approve production for every event:
Buildchain keeps ordinary `main` pushes on staging and only admits production
after a matching reviewed release PR merge or a trusted manual approval. When
the production channel is active, `pnpm run check` requires the capability,
manual-approval scope, and release-PR gate to stay enabled.

Production readiness must remain true:

- `libkungfu.dev`, `core.libkungfu.dev`, `buildchain.libkungfu.dev`,
  `kfd.libkungfu.dev`, and `papers.libkungfu.dev` are configured as production
  aliases on the serving distribution;
- DNS for all production surface hosts resolves to the intended distribution;
- the GitHub OIDC role exists in AWS Global and is scoped to the production
  bucket and distribution;
- a Buildchain production plan binds the source SHA, artifact hash, target
  bucket, CloudFront distribution, actor, run id, and rollback pointer.
