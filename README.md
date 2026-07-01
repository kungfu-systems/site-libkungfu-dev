# site-libkungfu-dev

Source for the planned core-library technical release surface at
`https://libkungfu.cc/dev`.

The current repository provides a minimal static landing page at
`public/dev/index.html`. The live `libkungfu.cc` root is currently served by an
existing production WordPress/Elastic Beanstalk path, so this repository should
not be deployed to `https://libkungfu.cc/dev` until the routing choice is made.

## Purpose

- Publish technical release facts for the libkungfu core.
- Provide a future home for release manifests, checksums, provenance links, and
  machine-readable install/verify metadata.
- Keep the technical site separate from the `kungfu.tech` product home.

## Local Check

```bash
bash scripts/check-site.sh
```

