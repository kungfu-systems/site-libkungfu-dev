# Deploy

The intended public URL is `https://libkungfu.dev`.

Channel model:

- Preview: `https://{alias}.preview.libkungfu.dev`
- Staging: `https://staging.libkungfu.dev`
- Production: `https://libkungfu.dev`

The site artifact is static today, but the channel model must stay compatible
with future dynamic adapters. Buildchain remains the deployment state machine:
the release object is source commit plus build artifact plus deploy target plus
channel plus deployment manifest.

## Current State

- The repository builds a static `dist/` artifact.
- Buildchain validation and deployment planning are enabled through the shared
  web-surface workflow.
- Live AWS apply is not enabled here because the `libkungfu.dev` CloudFront and
  S3 targets are still placeholders in `buildchain.toml`.
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
