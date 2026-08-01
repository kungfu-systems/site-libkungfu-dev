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
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.0/index.html": "20cca537bed2bdf3f3b41b87bdb988e6c2738b789fc5b0179d73a65c583ba59e",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.1/index.html": "879c30461ec73e03fbe3fa6a52e6575c115097b66898c036409a26355584098c",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.2/index.html": "dbac92b8dcda5bc018d32c394748a45713409ba8f0798ed77f77341ab594ef5e",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.3/index.html": "4ad0a622b6afb08de1796cd31e6316ebe9fe1c2164e82535a358b9ebeefe1ab4",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.4/index.html": "dcde1910c90d63056cefc045ec293695474b5a3907d5dc3bfb5115e3e5e3568e",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.5/index.html": "f9f1376ae339f647d0f37eee48d0602edbf569574a29c9e766c08c8905b31208",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.6/index.html": "d755d1a841de1fae7296bb36c68014bbcb3c159ccc72c3fe4e8824420ed47ed1",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.7/index.html": "4fb42a255d8b067d3e183a0a177b301ed027dc13c238f6eec96f7d8e8d14d5a1",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.8/index.html": "b66c5b316e4f96e463d9795ae061a59751657c097dc50b5966f97a7003a6c722",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.9/index.html": "e2dea88490af72d4bf2213e524789027f90913019ec9223531c72d3593353e77",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.10/index.html": "657de7684f118a49cdbbfbc0f473f794bedf47bd6766eeb2932973f64c94bebd",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.11/index.html": "e04c2d783181048678138728ccafe7b4367f1cd540fc5148b8eecd180d8eb74a",
  "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.12/index.html": "08cf197d939823dcd7d35aa535d4249c930ef88290b0fb6f5a585e513775cbb7",
  "src/immutable-publication-pages/kfd-foundation-real-world-agent-work/v0.1.0-alpha.8/index.html": "bddba85c34fa25ea13c0607b36340b941b13aaa54c5b31720f70a32e406ba3f2",
  "src/immutable-publication-pages/observer-declared-timelines/v0.1.0-alpha.9/index.html": "919626b319231a676741d044d37d9a83f1231c31149577b5627e89010284de4f",
  "src/immutable-publication-pages/episodes-to-primitives/v0.1.0-alpha.2/index.html": "989251febddc66d51d9a9785a93ddbc9a259bf5f1ac251f834e298af07cbf4bb",
  "src/immutable-publication-pages/kfd-machine-life-roadmap/v0.1.0-alpha.2/index.html": "06243cab16e296fe55e66b68f64e1d305eda97373d7ce9a79916b473baf85777",
  "src/immutable-publication-pages/kfd-machine-life-roadmap/v0.1.0-alpha.0/index.html": "ebab5260501a033b5335e1a0886de24899f4b079c2a89d00796825b543e8f6e1",
  "src/immutable-publication-pages/kfd-machine-life-roadmap/v0.1.0-alpha.1/index.html": "e071ade43a45080f1b700ef9882711799e81854331a6fe4db3e47531b7d37d84",
  "src/immutable-publication-pages/kfd-machine-life-roadmap/v0.1.0-alpha.3/index.html": "4adc76f909b96925b884d191aea7dd1736a0308e072fcfcb023379d5596daba9",
  "src/immutable-publication-pages/kfd-machine-life-roadmap/v0.1.0-alpha.4/index.html": "6aaf14a128350864383fd46d1ab37d1ca7841647cafe9a43dfcf58d50b2d8459",
  "src/immutable-publication-pages/kfd-machine-life-roadmap/v0.1.0-alpha.5/index.html": "c5f0470f4f1adb4e02177289f95ee6e3f625bc3c8106275051d394867d5e30a6",
})) {
  const actualSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, file))).digest("hex");
  assert.equal(actualSha256, expectedSha256, `frozen immutable publication snapshot drifted: ${file}`);
}

const legacyStagingPageSha256 = {
  "episodes-to-primitives/v0.1.0-alpha.2/index.html": "20057177f2072c2ad1f394225a8b782dfe69d58d82df1f0e6f3b01fc7fcb1a23",
  "kfd-foundation-real-world-agent-work/v0.1.0-alpha.8/index.html": "a620b67716070a93c65bcf223fd6bf96dfe0538b6162f2093f4ed7f98655f29f",
  "kfd-machine-life-roadmap/v0.1.0-alpha.2/index.html": "e1473a4fb135958be07ff8a26891a0035115054d1e34acab88e1bbac431de1ac",
  "kungfu-product-white-paper/v0.1.0-alpha.10/index.html": "30e914720f46b16e3c1befa46e5f2e2db5b123273d2e4f63ff3fd15a481d79d7",
  "observer-declared-timelines/v0.1.0-alpha.9/index.html": "a728901f5011430b6637e4423990431607c80449d3e3630f1ccbf89036d276b0",
};
if (process.env.SITE_SURFACE_CHANNEL === "staging") {
  for (const [relativePath, expectedSha256] of Object.entries(legacyStagingPageSha256)) {
    const file = path.join(repoRoot, "dist", "papers", "archive", relativePath);
    const actualSha256 = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert.equal(actualSha256, expectedSha256, `legacy staging immutable publication page drifted: ${relativePath}`);
  }
}

process.stdout.write("paper propagation qualification and immutable page checks passed\n");
