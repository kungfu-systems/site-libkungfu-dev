// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  createCoreSiteExperience,
  previewOutputPath,
} = require("./core-site-experience.cjs");

const repoRoot = process.cwd();
const packageRoot = path.resolve(process.env.KUNGFU_SITE_PACKAGE_ROOT || "");
if (!process.env.KUNGFU_SITE_PACKAGE_ROOT || !fs.existsSync(packageRoot)) {
  throw new Error("KUNGFU_SITE_PACKAGE_ROOT must identify the generated local package");
}

const siteApi = require(packageRoot);
const corePackage = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
);
const bundle = siteApi.loadBundle();
const experience = createCoreSiteExperience(siteApi);
const experienceReceipt = siteApi.verifySiteExperience(experience);
const outputRoot = path.join(repoRoot, "dist");

for (const file of experience.files) {
  const output = path.join(outputRoot, previewOutputPath(file.route));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, file.body);
}

const receiptOutput = path.join(outputRoot, "core-preview", "local-pickup.json");
fs.writeFileSync(
  receiptOutput,
  `${JSON.stringify({
    contract: "core.libkungfu.dev/local-site-bundle-pickup/v1",
    sourceKind: "local-generated",
    package: {
      name: corePackage.name,
      version: corePackage.version,
    },
    source: bundle.source,
    bundleContentRoot: bundle.contentRoot,
    experienceContentRoot: experienceReceipt.contentRoot,
    files: experience.files.map((file) => ({
      route: file.route,
      kind: file.kind,
      contentType: file.contentType,
      byteLength: file.byteLength,
      contentRoot: file.contentRoot,
    })),
    nonClaims: [
      "This local pickup is not an npm publication.",
      "This local pickup is not a site deployment.",
    ],
  }, null, 2)}\n`,
);

console.log(
  `local site bundle rendered; files=${experienceReceipt.files}; experience=${experienceReceipt.contentRoot}`,
);
