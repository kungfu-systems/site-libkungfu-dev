# site-libkungfu-dev Versioning

This site applies KFD-1 to public reader and machine contracts, not to visual
diff size. The repository does not currently publish a versioned renderer
package, so the decision log records compatibility impact for deployment and
future packaging without inventing a package version.

## Impact Classes

| Class | Site meaning |
| --- | --- |
| Patch | Compatible copy, style, accessibility, evidence refresh, or renderer repair inside an existing reader and machine contract. |
| Minor | A compatible new reader path, stable route, manifest field, agent projection, claim class, or source-bound synthesis contract. |
| Major | A removed stable route, incompatible manifest meaning, newly required consumer behavior, or stronger claim that invalidates an existing boundary. |

The final impact is the highest impact across the affected public faces. An
additive machine field remains minor even when existing readers can ignore it;
removing or reinterpreting that field is major.

## Registered Faces

- the root and surface first-screen reader paths;
- `libkungfu-dev-reader-contract/v1` and its claim/source model;
- `/manifest.json`, `/runtime.json`, and `/llms.txt`;
- Core and KFD surface manifests and agent indexes;
- stable human routes, machine routes, and immutable publication routes.

## Decision Log

| Date | Action | Line | Faces | Class | Rationale | PR |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-22 | open-minor | `site-manifest/v1` | reader-contract, first-screen paths, guided synthesis, root/runtime/Core/KFD agent projections | additive | The site adds a public reader contract, source-bound claim classes, and additive machine projections while preserving all existing routes, upstream content, and claim boundaries. | |
| 2026-08-03 | open-minor | `kfd-activation-contract-discovery/v1` | KFD overview, Agent Hub, KFD agent manifest, root manifest, activation discovery and schema routes | additive | The site publishes package-owned KFD-11 through KFD-13 draft activation interfaces while preserving their non-normative status, authority, and non-claim boundaries. | |
| 2026-08-10 | open-minor | `kfx-developer-surface/v1` | primary navigation, `kfx.libkungfu.dev`, KFX reader path, KFX manifest, llms, architecture, capability map, root manifest | additive | The site adds a source-pinned KFX reader synthesis on a dedicated host, labels it Extensions in reader navigation, and preserves equivalent human and Agent graphs, every existing surface, upstream authority, and the boundary of consuming no unpublished npm package. | |
| 2026-08-11 | open-minor | `skills-preview-surface/v1` | primary navigation, `/skills/`, `/skills/spec/`, `/skills/roadmap/`, Skills manifest, llms, architecture, capability map, root manifest | additive | The site adds a value-first Skills overview plus stable spec and roadmap depth routes from one source-pinned fixture, preserves Human/Agent parity and explicit current/future/non-claim boundaries, and stays on the existing hub preview without claiming a released Skill runtime. | |
| 2026-08-14 | open-minor | `multi-product-installer-publication/v1` | `/install.sh`, installer manifest, friendly and immutable catalog routes, immutable installer route, root manifest, llms | additive | The site adds a content-addressed POSIX installer projection for exact KFD, Buildchain, Kungfu, and Agent Hub Demo releases while upstream releases retain product, artifact, provenance, signing, and qualification authority. | |
| 2026-08-15 | open-minor | `multi-product-installer-publication/v1` | `/install.sh`, `/install.ps1`, shared installer catalog and manifest, friendly and immutable installer routes | additive | Both public installers now default to Kungfu when no product is supplied; the same exact-release catalog adds verified Windows x64 targets and a content-addressed PowerShell installer without changing upstream release authority. | |
| 2026-08-15 | open-minor | `kfd-conceptual-compression/v1` | KFD first screen, `/concepts/`, `/kfd/concepts/`, KFD manifest, KFD llms | additive | The site projects the Alpha.66 Work-centered reader model into a prominent Human path and equivalent Agent discovery fields while keeping the package document non-normative and the exact KFD source authoritative. | |
