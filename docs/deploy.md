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

The AWS resource contract is owned by the private
`kungfu-systems/infra-kungfu-sites` repository and mirrored into this repository
as `infra/outputs.json`. Site changes may update content, Buildchain wiring, and
the mirrored outputs after an infra change, but CloudFormation templates and AWS
resource lifecycle decisions belong in the infra repository.

## Current State

- The repository builds a static `dist/` artifact.
- Buildchain validation and preview, cleanup, staging, and production planning
  are enabled through the shared web-surface workflow.
- The workflow consumes Buildchain through the floating `@v2` workflow ref and
  records the accepted runtime contract in `buildchain.contract-lock.json`.
  The build checks that lock before rendering so `@v2` movement is audited as
  compatible drift or blocked as breaking drift.
- Preview, preview cleanup, and staging apply are enabled in the repository
  workflow so same-repository pull requests publish short-lived preview
  surfaces, closed pull requests clean them up, and `main` pushes publish the
  protected staging channel.
- The workflow uses the Buildchain v2 first-class surface host mappings, so each
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
kungfu -> @kungfu-tech/spec -> site-libkungfu-dev -> core.libkungfu.dev
buildchain -> @kungfu-tech/buildchain docs/site bundle -> site-libkungfu-dev -> buildchain.libkungfu.dev
kfd -> @kungfu-tech/kfd site bundle -> site-libkungfu-dev -> kfd.libkungfu.dev
```

For now, hub/core still use `src/fixtures/` as explicit contract fixtures.
Buildchain already uses the pinned `@kungfu-tech/buildchain@2.10.0` npm package
and its exported `dist/site` bundle. KFD uses the pinned `@kungfu-tech/kfd`
package and its exported site bundle.

Do not store AWS credentials in this repository.

## Production Readiness

The workflow carries the planned production role reference so Buildchain can
plan the production channel with the same contract shape as other sites.
`production-apply` stays wired to the mirrored infrastructure contract: when the
production channel is active, `pnpm run check` requires production apply and the
release-PR gate to stay enabled.

Production readiness must remain true:

- `libkungfu.dev`, `core.libkungfu.dev`, `buildchain.libkungfu.dev`, and
  `kfd.libkungfu.dev` are configured as production aliases on the serving
  distribution;
- DNS for all production surface hosts resolves to the intended distribution;
- the GitHub OIDC role exists in AWS Global and is scoped to the production
  bucket and distribution;
- a Buildchain production plan binds the source SHA, artifact hash, target
  bucket, CloudFront distribution, actor, run id, and rollback pointer.
