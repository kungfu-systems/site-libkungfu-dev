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
