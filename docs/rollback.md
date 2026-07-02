# Rollback

Until live `libkungfu.dev` delivery resources are connected, rollback is simply
reverting this repository or closing the pull request that introduced the
change.

When production routing is added, each deployment record must include:

- the source commit;
- the Buildchain deployment manifest;
- the S3 bucket and object prefix;
- the CloudFront distribution and invalidation ID;
- the previous deployment manifest or rollback pointer;
- live verification commands for `https://libkungfu.dev`,
  `https://core.libkungfu.dev`, and `https://buildchain.libkungfu.dev`.

Preview cleanup should remove short-lived preview aliases and their deployment
manifests after the pull request is closed or merged.
