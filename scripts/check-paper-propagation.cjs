#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  loadPublicationPackageSet,
} = require("./publication-packages.cjs");
const {
  IMMUTABLE_PUBLICATION_PAGE_CONTRACT,
  renderImmutablePublicationPage,
} = require("./immutable-publication-page.cjs");
const {
  consumePaperPropagation,
  qualifyPaperPropagation,
  readPnpmLockPackage,
  stableJson,
} = require("./paper-propagation.cjs");

const repoRoot = path.resolve(__dirname, "..");
const source = loadPublicationPackageSet(repoRoot);
const publication = source.registry.publications.find((entry) => entry.id === "observer-declared-timelines");
const version = publication.versions.find((entry) => entry.version === publication.latest.version);
const packageFact = source.packages.find((entry) => entry.name === publication.package);
const lockPackage = readPnpmLockPackage(repoRoot, packageFact.name, packageFact.version);
const packageRoot = path.dirname(require.resolve(`${packageFact.name}/package.json`));
const registry = JSON.parse(
  fs.readFileSync(path.join(packageRoot, ".buildchain", "publication", "publication-registry.json"), "utf8"),
);
const primary = version.artifacts.find((entry) => entry.kind === "pdf") || version.artifacts[0];
const immutableVersionUrl = `https://papers.libkungfu.dev${version.immutablePath}`;
const propagationLock = {
  schemaVersion: 1,
  contract: "kungfu-buildchain-release-propagation-lock",
  upstream: {
    node: publication.id,
    repository: `kungfu-systems/paper-${publication.id}`,
    channel: "alpha",
    tag: `v${version.version}`,
    sourceSha: version.source.commit,
    package: {
      name: packageFact.name,
      version: packageFact.version,
      integrity: lockPackage.integrity,
    },
    publicationArtifact: {
      id: publication.id,
      kind: publication.kind,
      version: version.version,
      canonicalUrl: publication.canonicalReader.url,
      latestUrl: `https://papers.libkungfu.dev${publication.latest.path}`,
      immutableVersionUrl,
      registry: {
        url: `https://example.invalid/${publication.id}/publication-registry.json`,
        sha256: registry.registrySha256,
      },
      manifest: {
        url: `${immutableVersionUrl}${version.manifest.path}`,
        sha256: version.manifest.sha256,
      },
      passport: {
        url: `${immutableVersionUrl}${version.passport.path}`,
        sha256: version.passport.sha256,
      },
      primaryArtifact: {
        path: primary.source.path,
        url: `${immutableVersionUrl}${primary.path}`,
        sha256: primary.sha256,
      },
      sourceBundle: {
        path: version.source.bundle.source.path,
        url: `${immutableVersionUrl}${version.source.bundle.path}`,
        sha256: version.source.bundle.sha256,
      },
    },
    releasePassport: {
      url: `https://example.invalid/${publication.id}/buildchain.release.json`,
      sha256: "1".repeat(64),
    },
  },
  downstream: {
    node: "site-libkungfu-dev",
    repository: "kungfu-systems/site-libkungfu-dev",
    channel: "alpha",
    baseRef: "main",
    lockPath: `buildchain.upstreams/${publication.id}.release.json`,
  },
  propagation: {
    graphContract: "kungfu-buildchain-release-propagation-graph",
    edge: `${publication.id}-to-site`,
    channelPolicy: "preserve",
    releaseIdentity: {
      repository: `kungfu-systems/paper-${publication.id}`,
      version: version.version,
      channel: "alpha",
    },
    propagationKey: "",
    branch: `buildchain/release-propagation/paper-${publication.id}/${version.version}-alpha`,
    exact: true,
    floatingTags: false,
  },
  lockSha256: "",
};
propagationLock.propagation.propagationKey = crypto.createHash("sha256").update(stableJson({
  release: propagationLock.propagation.releaseIdentity,
  downstreamRepository: propagationLock.downstream.repository,
})).digest("hex");
propagationLock.lockSha256 = crypto.createHash("sha256").update(stableJson({
  ...propagationLock,
  lockSha256: undefined,
})).digest("hex");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "site-paper-propagation-"));
const lockPath = propagationLock.downstream.lockPath;
fs.mkdirSync(path.join(tempRoot, "buildchain.upstreams"), { recursive: true });
fs.writeFileSync(path.join(tempRoot, lockPath), `${JSON.stringify(propagationLock, null, 2)}\n`);
for (const file of ["package.json", "pnpm-lock.yaml", "src/publication-packages.json"]) {
  const target = path.join(tempRoot, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, file), target);
}

const changedFiles = [
  lockPath,
  "package.json",
  "pnpm-lock.yaml",
  "src/publication-packages.json",
];
fs.mkdirSync(path.join(repoRoot, "buildchain.upstreams"), { recursive: true });
const repoFixtureLock = path.join(repoRoot, "buildchain.upstreams", ".paper-propagation-check.release.json");
fs.writeFileSync(repoFixtureLock, `${JSON.stringify(propagationLock, null, 2)}\n`);
try {
  const exact = qualifyPaperPropagation({
    repoRoot,
    lockPath: path.relative(repoRoot, repoFixtureLock),
    changedFiles: [
      path.relative(repoRoot, repoFixtureLock),
      "package.json",
      "pnpm-lock.yaml",
      "src/publication-packages.json",
    ],
  });
  assert.equal(exact.qualified, true);
  assert.equal(exact.publicationFastPath.targetSurface, "papers");
  assert.deepEqual(exact.publicationFastPath.immutablePrefixes, [
    version.immutablePath.replace(/^\/+|\/+$/g, ""),
  ]);
  assert.equal(exact.states["package-published"].state, "complete");
  assert.equal(exact.states["alpha-complete"].state, "complete");
  assert.equal(exact.states["staging-visible"].state, "pending");
  assert.equal(exact.states["production-visible"].state, "not-requested");
  const fullSite = qualifyPaperPropagation({
    repoRoot,
    lockPath: path.relative(repoRoot, repoFixtureLock),
    changedFiles: [
      ...changedFiles.slice(1),
      path.relative(repoRoot, repoFixtureLock),
      "scripts/render-site.mjs",
    ],
  });
  assert.equal(fullSite.qualified, false);
  assert.equal(fullSite.reason, "changed-paths-require-full-site");
  assert.equal(fullSite.publicationFastPath, undefined);

  const nonPaperLock = qualifyPaperPropagation({
    repoRoot,
    lockPath: "buildchain.upstreams/kfd.release.json",
    changedFiles: [
      "buildchain.upstreams/kfd.release.json",
      "package.json",
      "pnpm-lock.yaml",
    ],
  });
  assert.equal(nonPaperLock.qualified, false);
  assert.equal(nonPaperLock.reason, "non-paper-release-lock-requires-full-site");
  assert.equal(nonPaperLock.publicationFastPath, undefined);

  const multipleLocks = qualifyPaperPropagation({
    repoRoot,
    changedFiles: [
      "buildchain.upstreams/kfd.release.json",
      path.relative(repoRoot, repoFixtureLock),
    ],
  });
  assert.equal(multipleLocks.qualified, false);
  assert.equal(multipleLocks.reason, "multiple-release-locks-require-full-site");
  assert.equal(multipleLocks.publicationFastPath, undefined);
} finally {
  fs.unlinkSync(repoFixtureLock);
}

const consumeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "site-paper-consume-"));
for (const file of ["package.json", "src/publication-packages.json", lockPath]) {
  const sourceFile = file === lockPath ? path.join(tempRoot, lockPath) : path.join(repoRoot, file);
  const target = path.join(consumeRoot, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(sourceFile, target);
}
const consumed = consumePaperPropagation({ repoRoot: consumeRoot, lockPath });
assert.equal(consumed.package, packageFact.name);
assert.equal(
  JSON.parse(fs.readFileSync(path.join(consumeRoot, "package.json"), "utf8")).dependencies[packageFact.name],
  packageFact.version,
);

const frozenObserverFixture = {
  publication: {
    id: "observer-declared-timelines",
    title: "Observer-Declared Timelines for Real-World Agent Work",
  },
  version: {
    version: "0.1.0-alpha.9",
    immutablePath: "/archive/observer-declared-timelines/v0.1.0-alpha.9/",
    renderedArtifacts: [
      {
        kind: "pdf",
        path: "observer-declared-timelines.pdf",
        sha256: "sha256:014cae132b50753b60428b3998311e6efa8107d91fe7fce905795de3f1486046",
      },
      {
        kind: "manifest",
        path: "publication-artifact.json",
        sha256: "sha256:8cc7291a6a4677f0641b125491bdf766074be3c7138adebaf8c08f9beac00f99",
      },
      {
        kind: "source",
        path: "source.tar.gz",
        sha256: "sha256:8a2a97895c9c76d1e1f292ee718e463138b6371002fc39408a9e8f51a97b5d02",
      },
      {
        kind: "passport",
        path: "publication-artifact-passport.json",
        sha256: "sha256:4e24d4e888a6ebee102ea42419c50ce7c469acb4c468b025df8273b8dff95d70",
      },
    ],
  },
};
const immutablePage = renderImmutablePublicationPage(frozenObserverFixture);
const immutablePageSha256 = crypto.createHash("sha256").update(immutablePage).digest("hex");
assert.equal(IMMUTABLE_PUBLICATION_PAGE_CONTRACT, "libkungfu-dev-immutable-publication-page-v1");
assert.equal(immutablePageSha256, "24c3f9e0e768b9d782aba3f6fe0cf5825b630b2061ec88a052727e2b7f7bf28b");
assert.equal(immutablePage.includes("main-site-link"), false);
assert.equal(immutablePage.includes("/assets/site.css"), false);

for (const [file, expectedSha256] of Object.entries({
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.10/index.html": "657de7684f118a49cdbbfbc0f473f794bedf47bd6766eeb2932973f64c94bebd",
  "src/immutable-publication-pages/kfd-foundation-real-world-agent-work/v0.1.0-alpha.8/index.html": "bddba85c34fa25ea13c0607b36340b941b13aaa54c5b31720f70a32e406ba3f2",
  "src/immutable-publication-pages/observer-declared-timelines/v0.1.0-alpha.9/index.html": "919626b319231a676741d044d37d9a83f1231c31149577b5627e89010284de4f",
  "src/immutable-publication-pages/episodes-to-primitives/v0.1.0-alpha.2/index.html": "989251febddc66d51d9a9785a93ddbc9a259bf5f1ac251f834e298af07cbf4bb",
  "src/immutable-publication-pages/kfd-machine-life-roadmap/v0.1.0-alpha.2/index.html": "06243cab16e296fe55e66b68f64e1d305eda97373d7ce9a79916b473baf85777",
})) {
  const actualSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, file))).digest("hex");
  assert.equal(actualSha256, expectedSha256, `legacy immutable publication snapshot drifted: ${file}`);
}

process.stdout.write("paper propagation qualification and immutable page checks passed\n");
