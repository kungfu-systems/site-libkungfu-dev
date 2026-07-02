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

## Current State

- The repository builds a static `dist/` artifact.
- Buildchain validation, preview apply, preview cleanup apply, and staging apply
  are enabled through the shared web-surface workflow.
- The workflow uses Buildchain v2.3 first-class surface host mappings, so each
  surface has a host-level preview and staging URL instead of only a path
  fallback under the hub URL.
- Production apply remains disabled until production promotion is explicitly
  approved.
- Staging is modeled as managed-network protected, matching the current Kungfu
  site policy. Do not add Basic Auth secrets to this repository.

## Source Boundary

Deployment must not turn this repository into a fact source. The artifact should
render pinned upstream bundles:

```text
kungfu -> @kungfu-tech/spec -> site-libkungfu-dev -> core.libkungfu.dev
buildchain -> @kungfu-tech/buildchain docs/site bundle -> site-libkungfu-dev -> buildchain.libkungfu.dev
```

For now, `src/fixtures/` is the explicit contract fixture until real upstream
bundles exist.

Do not store AWS credentials in this repository.
