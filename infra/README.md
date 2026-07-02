# Infrastructure Contract

`outputs.json` is copied from the private
`kungfu-systems/infra-kungfu-sites` repository.

It records the expected AWS infrastructure outputs for this site. The local
check compares it with `buildchain.toml` and the Buildchain GitHub Actions
workflow so deployment targets do not drift silently.

This repository does not own AWS infrastructure. Infrastructure changes belong
in `infra-kungfu-sites`.
