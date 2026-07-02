# Rollback

For preview and staging, rollback is handled through Buildchain deployment and
cleanup evidence:

- close the pull request to trigger preview cleanup for the PR alias;
- revert the repository change and merge to `main` to republish staging;
- if edge routing breaks before a repository revert can deploy, roll back the
  `site-libkungfu-dev-web-surface` CloudFormation stack to the previous template.

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
