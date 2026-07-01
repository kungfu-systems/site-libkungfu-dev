# Rollback

Until the live `https://libkungfu.cc/dev` route is connected, rollback is simply
reverting this repository.

When production routing is added, the rollback record must include:

- the DNS or proxy resource changed;
- the previous target/origin;
- any S3 object versions involved;
- the cache invalidation ID;
- live verification commands for `https://libkungfu.cc/dev` and the existing
  `https://www.libkungfu.cc` root.

