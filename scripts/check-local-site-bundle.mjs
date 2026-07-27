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
const bundleReceipt = siteApi.verifyBundle();
const experience = createCoreSiteExperience(siteApi);
const experienceReceipt = siteApi.verifySiteExperience(experience);

for (const file of experience.files) {
  const output = path.join(repoRoot, "dist", previewOutputPath(file.route));
  if (!fs.existsSync(output)) {
    throw new Error(`local site bundle preview is missing ${file.route}`);
  }
  const expected = Buffer.isBuffer(file.body)
    ? file.body
    : Buffer.from(file.body);
  if (!fs.readFileSync(output).equals(expected)) {
    throw new Error(`local site bundle preview drifted from ${file.route}`);
  }
}

const home = fs.readFileSync(
  path.join(repoRoot, "dist", "core-preview", "index.html"),
  "utf8",
);
for (const invariant of [
  "Kungfu UNGFU™",
  "Human first · Agent co-reading",
  "KFD-3 machine entry",
  '<details class="kungfu-technical">',
  '<link rel="alternate" type="application/json"',
  ".kungfu-brand{display:grid;gap:2px}",
  "overflow-wrap:anywhere",
  '<aside class="kungfu-sidebar-desktop" aria-label="Topic navigation">',
  '<details class="kungfu-sidebar-mobile">',
  "<span>Browse topics</span>",
  ".kungfu-sidebar-desktop{position:sticky",
  '<nav class="kungfu-topic-tree" aria-label="Product themes">',
  'class="kungfu-topic-node"',
  "@media(max-width:960px)",
]) {
  if (!home.includes(invariant)) {
    throw new Error(`local site bundle preview is missing ${invariant}`);
  }
}

if (experienceReceipt.documents !== 42) {
  throw new Error(
    `local site bundle preview expected 42 complete documents, got ${experienceReceipt.documents}`,
  );
}

const requiredRoutes = [
  "/format/guides/",
  "/format/guides/quickstart/",
  "/format/guides/api/",
  "/format/guides/cli/",
  "/format/guides/python-reader/",
  "/format/guides/conformance/",
  "/format/guides/reference/",
  "/format/overview/",
  "/format/handbooks/cli/",
  "/format/handbooks/node/",
  "/format/handbooks/python/",
  "/format/history/spec-0.1-draft/",
  "/docs/authority/fact-episode-action/",
  "/docs/authority/abi-guide/",
  "/docs/authority/node-sdk/",
  "/docs/authority/kfx-topology/",
  "/docs/authority/known-limits/",
  "/sources/abi-guide/libkungfu-abi-consumer.md",
  "/format/guides/index.md",
  "/format/manifest.json",
  "/format/vectors/index.json",
  "/format/vectors/v1/bytes/journal-v1-unknown-carrier.bin",
];
const experienceRoutes = new Set(experience.files.map((file) => file.route));
for (const route of requiredRoutes) {
  if (!experienceRoutes.has(route)) {
    throw new Error(`local site bundle preview is missing required route ${route}`);
  }
}

const agentIndex = JSON.parse(
  experience.files.find((file) => file.route === "/agent-index.json").body,
);
if (
  agentIndex.navigation?.tree?.length !== 11
  || agentIndex.navigation.tree[0]?.children[0]?.label !== "Overview"
) {
  throw new Error("local site bundle preview topic tree is incomplete");
}
for (const topic of agentIndex.navigation.tree) {
  if (!topic.children?.length) {
    throw new Error(`topic tree node ${topic.id} has no child pages`);
  }
  for (const child of topic.children) {
    if (!experienceRoutes.has(child.route)) {
      throw new Error(
        `topic tree node ${topic.id} links to missing route ${child.route}`,
      );
    }
  }
}

for (const route of [
  "/primitives/",
  "/runtime/",
  "/abi/",
  "/sdk/",
  "/extensions/",
  "/products/",
  "/qualification/",
  "/decisions/",
  "/horizons/",
]) {
  const html = fs.readFileSync(
    path.join(repoRoot, "dist", previewOutputPath(route)),
    "utf8",
  );
  if (
    !html.includes("Detailed documentation") ||
    !html.includes("/docs/authority/")
  ) {
    throw new Error(`${route} does not expose its detailed authority documents`);
  }
}

const humanFiles = experience.files.filter((file) =>
  ["human-page", "human-document"].includes(file.kind),
);
for (const file of humanFiles) {
  for (const invariant of [
    '<aside class="kungfu-sidebar-desktop" aria-label="Topic navigation">',
    '<details class="kungfu-sidebar-mobile">',
    'aria-label="Product themes"',
  ]) {
    if (!file.body.includes(invariant)) {
      throw new Error(`${file.route} is missing bundle-owned topic navigation`);
    }
  }
  for (const match of file.body.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
    const route = match[1];
    if (!experienceRoutes.has(route)) {
      throw new Error(`${file.route} links to missing local route ${route}`);
    }
  }
}

const formatLanding = fs.readFileSync(
  path.join(repoRoot, "dist", "core-preview", "format", "index.html"),
  "utf8",
);
for (const invariant of [
  "Learn the format one task at a time.",
  'href="/format/guides/"',
  'href="/format/" aria-current="page">.kungfu</a>',
  '<details class="kungfu-topic-node" open data-current-topic="true">\n        <summary>.kungfu</summary>',
  'href="/format/" aria-current="page">Overview</a>',
  "Start the journey",
  "Complete library",
]) {
  if (!formatLanding.includes(invariant)) {
    throw new Error(`format landing is missing ${invariant}`);
  }
}

const abiGuide = fs.readFileSync(
  path.join(
    repoRoot,
    "dist",
    "core-preview",
    "docs",
    "authority",
    "abi-guide",
    "index.html",
  ),
  "utf8",
);
if (
  !abiGuide.includes(
    '<details class="kungfu-topic-node" open data-current-topic="true">\n        <summary>Native ABI</summary>',
  )
  || !abiGuide.includes(
    'href="/docs/authority/abi-guide/" aria-current="page">Consume the KFD-7 libkungfu ABI',
  )
) {
  throw new Error("ABI authority document does not preserve its active topic");
}

const conformanceGuide = fs.readFileSync(
  path.join(
    repoRoot,
    "dist",
    "core-preview",
    "format",
    "guides",
    "conformance",
    "index.html",
  ),
  "utf8",
);
for (const invariant of [
  "Run and interpret the conformance corpus",
  "<table>",
  '<pre><code class="language-sh">',
  'href="/format/guides/reference/"',
  'href="/format/guides/conformance/" aria-current="page">',
  "Exact Markdown source",
]) {
  if (!conformanceGuide.includes(invariant)) {
    throw new Error(`conformance guide is missing ${invariant}`);
  }
}

const receipt = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "dist", "core-preview", "local-pickup.json"),
    "utf8",
  ),
);
if (
  receipt.sourceKind !== "local-generated"
  || receipt.package?.name !== "@kungfu-tech/site"
  || receipt.bundleContentRoot !== bundleReceipt.contentRoot
  || receipt.experienceContentRoot !== experience.contentRoot
  || receipt.experienceContentRoot !== experienceReceipt.contentRoot
) {
  throw new Error("local site bundle pickup receipt does not bind the generated experience");
}

console.log(
  `local site bundle preview passing; pages=${experienceReceipt.pages}; documents=${experienceReceipt.documents}; files=${experienceReceipt.files}; bundle=${bundleReceipt.contentRoot}; experience=${experienceReceipt.contentRoot}`,
);
