# Deploy

The intended public URL is `https://libkungfu.cc/dev`.

Current live-state note:

- `libkungfu.cc` redirects to `www.libkungfu.cc` and is served by the existing
  production WordPress/Elastic Beanstalk path.
- `https://www.libkungfu.cc/dev` currently returns `404`.
- Existing `libkungfu.cc` DNS and delivery resources are production assets and
  must not be overwritten by this site repository without a separate routing
  decision.

Safe deployment options to evaluate:

1. Add `/dev` as a WordPress page that links to a static technical release
   surface.
2. Put a CDN or reverse proxy in front of `www.libkungfu.cc` and route `/dev/*`
   to static storage while leaving the existing origin unchanged.
3. Use a subdomain such as `dev.libkungfu.cc` if path routing on the root domain
   is too risky.

Do not store AWS credentials in this repository.

