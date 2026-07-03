# Deploy

The intended public URL is `https://libkungfu.dev`.

Channel model:

- Preview:
  - `https://{alias}.preview.libkungfu.dev`
  - `https://core-{alias}.preview.libkungfu.dev`
  - `https://buildchain-{alias}.preview.libkungfu.dev`
- Staging:
  - `https://staging.libkungfu.dev`
  - `https://core.staging.libkungfu.dev`
  - `https://buildchain.staging.libkungfu.dev`
- Production:
  - `https://libkungfu.dev`
  - `https://core.libkungfu.dev`
  - `https://buildchain.libkungfu.dev`

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
- Preview, preview cleanup, staging, and production apply are disabled in the
  repository workflow by default. Enabling live apply requires a separate
  reviewed change and explicit approval.
- The workflow uses Buildchain v2.4 first-class surface host mappings, so each
  surface has a host-level preview and staging URL instead of only a path
  fallback under the hub URL.
- Production apply remains disabled until production promotion is explicitly
  approved and the production channel status is active in the infrastructure
  contract.
- Staging is modeled as managed-network protected, matching the current Kungfu
  site policy. Do not add Basic Auth secrets to this repository.

## Source Boundary

Deployment must not turn this repository into a fact source. The artifact should
render pinned upstream bundles:

```text
kungfu -> @kungfu-tech/spec -> site-libkungfu-dev -> core.libkungfu.dev
buildchain -> @kungfu-tech/buildchain docs/site bundle -> site-libkungfu-dev -> buildchain.libkungfu.dev
```

For now, hub/core still use `src/fixtures/` as explicit contract fixtures.
Buildchain already uses the pinned `@kungfu-tech/buildchain@2.4.1` npm package
and its exported `dist/site` bundle.

Do not store AWS credentials in this repository.

## Production Readiness

The workflow carries the planned production role reference so Buildchain can
plan the production channel with the same contract shape as other sites.
However, `production-apply` stays `false` while the infrastructure contract
marks production as `pending`.

Before enabling production apply, verify:

- `libkungfu.dev`, `core.libkungfu.dev`, and `buildchain.libkungfu.dev` are
  configured as production aliases on the serving distribution;
- DNS for all production surface hosts resolves to the intended distribution;
- the GitHub OIDC role exists in AWS Global and is scoped to the production
  bucket and distribution;
- a Buildchain production plan binds the source SHA, artifact hash, target
  bucket, CloudFront distribution, actor, run id, and rollback pointer.
