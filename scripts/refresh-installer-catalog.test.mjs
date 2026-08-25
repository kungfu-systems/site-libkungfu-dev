import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseRequests, refreshCatalog, resolveVersionEntry } from "./refresh-installer-catalog.mjs";
import { releaseDownloadPrefix } from "./installer-release-model.mjs";

const root = process.cwd();
const canonicalCatalog = JSON.parse(fs.readFileSync(path.join(root, "src", "install", "installer-catalog.json"), "utf8"));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const gitSha = (value) => hash(value).slice(0, 40);

function releaseFixture(productId, version) {
  const assets = [];
  const bytesByUrl = new Map();
  const base = `https://github.com/kungfu-systems/${productId}/releases/download/v${version}`;
  const addStatic = (name, size = 128, digest = hash(name)) => {
    assets.push({ name, size, digest: `sha256:${digest}`, browser_download_url: `${base}/${name}` });
    return { name, size, sha256: digest };
  };
  const addJson = (name, value) => {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
    const asset = addStatic(name, bytes.length, hash(bytes));
    bytesByUrl.set(`${base}/${name}`, bytes);
    return asset;
  };
  return {
    addJson,
    addStatic,
    loadAssetBytes: async (asset) => bytesByUrl.get(asset.url),
    release: {
      repository: `kungfu-systems/${productId}`,
      tag_name: `v${version}`,
      draft: false,
      published_at: "2026-08-15T00:00:00Z",
      assets,
    },
  };
}

function kfdFixture(version, salt = "a") {
  const fixture = releaseFixture("kfd", version);
  const sourceSha = gitSha(`kfd-source-${version}`);
  for (const triple of ["aarch64-apple-darwin", "x86_64-apple-darwin", "aarch64-unknown-linux-gnu", "x86_64-unknown-linux-gnu", "x86_64-pc-windows-msvc"]) {
    const archiveName = `kfd-${version}-${triple}.${triple.endsWith("windows-msvc") ? "zip" : "tar.gz"}`;
    const archiveSha = hash(`${salt}-${archiveName}`);
    fixture.addStatic(archiveName, 512, archiveSha);
    fixture.addJson(`kfd-${version}-${triple}.provenance.json`, {
      schema: "kfd.native-release-provenance/v1",
      identity: { name: "kfd", version, target: triple, sourceSha },
      artifacts: {
        executable: { name: triple.endsWith("windows-msvc") ? "kfd.exe" : "kfd", sha256: hash(`${salt}-${triple}-binary`) },
        archive: { name: archiveName, sha256: archiveSha },
      },
    });
  }
  return fixture;
}

function buildchainFixture(version) {
  const fixture = releaseFixture("buildchain", version);
  const sourceSha = gitSha(`buildchain-source-${version}`);
  for (const triple of ["aarch64-apple-darwin", "x86_64-unknown-linux-gnu", "x86_64-pc-windows-msvc"]) {
    fixture.addStatic(`buildchain-${triple}.${triple.endsWith("windows-msvc") ? "zip" : "tar.gz"}`, 1024);
    fixture.addJson(`buildchain-${triple}.json`, {
      contract: "kungfu-buildchain-standalone-binary",
      name: "buildchain",
      version: `v${version}`,
      platform: triple,
      sourceSha,
      executableFiles: [{ path: triple.endsWith("windows-msvc") ? "buildchain.exe" : "buildchain", sha256: hash(`${triple}-binary`) }],
    });
  }
  return fixture;
}

function agentHubFixture(version) {
  const fixture = releaseFixture("agent-hub-demo", version);
  const sourceSha = gitSha(`agent-hub-source-${version}`);
  fixture.addJson("artifact-evidence.json", {
    contract: "kungfu-buildchain-artifact-evidence",
    repository: "kungfu-systems/agent-hub-demo",
    release: { tag: `v${version}`, sourceSha },
  });
  for (const platform of ["macos-arm64", "linux-x64", "windows-x64"]) {
    const artifactName = `agent-hub-demo-${platform}${platform === "windows-x64" ? ".exe" : ""}`;
    const artifactSha = hash(artifactName);
    fixture.addStatic(artifactName, 2048, artifactSha);
    fixture.addJson(`binary-${platform}.json`, {
      contract: "agent-hub-demo.binary-artifact/v1",
      platform,
      sha256: artifactSha,
      size: 2048,
      signing: platform === "macos-arm64" ? { state: "signed" } : undefined,
    });
  }
  return fixture;
}

function kungfuFixture(version, publicationSalt = "") {
  const fixture = releaseFixture("kungfu", version);
  const sourceCommit = gitSha(`kungfu-source-${version}`);
  const manifestDigest = hash(`kungfu-inner-manifest-${version}`);
  const installerSha = hash(`kungfu-installer-${version}-${publicationSalt}`);
  const powershellInstallerSha = hash(`kungfu-powershell-installer-${version}-${publicationSalt}`);
  fixture.manifestDigest = manifestDigest;
  fixture.addStatic("kungfu-install.sh", 4096, installerSha);
  fixture.addStatic("kungfu-install.ps1", 6144, powershellInstallerSha);
  fixture.addStatic("kungfu-episodes-cli-darwin-arm64.tar.gz", 8192);
  fixture.addStatic("kungfu-episodes-cli-linux-arm64.tar.gz", 12288);
  fixture.addStatic("kungfu-episodes-cli-linux-x64.tar.gz", 16384);
  fixture.addStatic("kungfu-episodes-cli-windows-x64.zip", 32768);
  const immutablePath = `installers/v1/alpha/${version}/${hash(version)}`;
  fixture.addJson("kungfu-installer-publication-bundle.json", {
    schema: "kungfu.installer-publication-bundle/v1",
    manifestDigest: `sha256:${manifestDigest}`,
    identity: { version, releaseTag: `v${version}`, sourceCommit },
    distribution: { repository: "kungfu-systems/kungfu" },
    routes: { immutablePath },
    assets: [
      {
        path: `${immutablePath}/install.sh`,
        role: "immutable-installer",
        size: 4096,
        digest: `sha256:${installerSha}`,
        releaseAsset: "kungfu-install.sh",
      },
      {
        path: `${immutablePath}/install.ps1`,
        role: "immutable-installer",
        size: 6144,
        digest: `sha256:${powershellInstallerSha}`,
        releaseAsset: "kungfu-install.ps1",
      },
    ],
  });
  return fixture;
}

test("Kungfu provenance binds the publication bundle bytes rather than its inner manifest digest", async () => {
  const version = "4.0.0-alpha.9";
  const fixture = kungfuFixture(version);
  const entry = await resolveVersionEntry({
    productId: "kungfu",
    version,
    release: fixture.release,
    loadAssetBytes: fixture.loadAssetBytes,
  });
  const bundleAsset = fixture.release.assets.find((asset) => asset.name === "kungfu-installer-publication-bundle.json");
  assert.ok(bundleAsset);
  assert.equal(entry.targets[0].provenance.sha256, bundleAsset.digest.slice("sha256:".length));
  assert.notEqual(entry.targets[0].provenance.sha256, fixture.manifestDigest);
});

test("Kungfu releases without Linux arm64 retain their historical target set", async () => {
  const version = "4.0.0-alpha.2";
  const fixture = kungfuFixture(version);
  fixture.release.assets = fixture.release.assets.filter(
    (asset) => asset.name !== "kungfu-episodes-cli-linux-arm64.tar.gz",
  );
  const entry = await resolveVersionEntry({
    productId: "kungfu",
    version,
    release: fixture.release,
    loadAssetBytes: fixture.loadAssetBytes,
  });
  assert.deepEqual(
    entry.targets.map((target) => target.platform),
    ["darwin-arm64", "linux-x64", "windows-x64"],
  );
});

test("exact release adapters derive all four product entries from verified metadata", async () => {
  const cases = [
    ["kfd", "1.0.0-alpha.99", kfdFixture],
    ["buildchain", "4.1.0", buildchainFixture],
    ["kungfu", "4.0.0-alpha.9", kungfuFixture],
    ["agent-hub-demo", "0.3.0", agentHubFixture],
  ];
  for (const [productId, version, createFixture] of cases) {
    const fixture = createFixture(version);
    const entry = await resolveVersionEntry({
      productId,
      version,
      release: fixture.release,
      loadAssetBytes: fixture.loadAssetBytes,
    });
    assert.equal(entry.version, version);
    assert.match(entry.sourceSha, /^[0-9a-f]{40}$/u);
    const expectedTargetCount = productId === "kfd" ? 5 : productId === "kungfu" ? 4 : 3;
    assert.equal(entry.targets.length, expectedTargetCount);
    const releasePrefix = releaseDownloadPrefix(productId, entry.tag);
    for (const target of entry.targets) {
      for (const asset of [target.artifact, target.provenance, target.delegate].filter(Boolean)) {
        assert.ok(asset.url.startsWith(releasePrefix), `${productId} adapter escaped its exact GitHub Release`);
      }
    }
  }
});

test("one refresh can update several products while retaining history", async () => {
  const fixtures = {
    kfd: kfdFixture("1.0.0-alpha.99"),
    buildchain: buildchainFixture("4.1.0"),
  };
  const requests = [
    { productId: "kfd", version: "1.0.0-alpha.99" },
    { productId: "buildchain", version: "4.1.0" },
  ];
  const result = await refreshCatalog({
    catalog: canonicalCatalog,
    requests,
    loadRelease: async (productId) => fixtures[productId].release,
    loadAssetBytes: async (asset) => {
      for (const fixture of Object.values(fixtures)) {
        const bytes = await fixture.loadAssetBytes(asset);
        if (bytes) return bytes;
      }
      return undefined;
    },
  });
  assert.deepEqual(result.changes.map((entry) => entry.action), ["added", "added"]);
  assert.equal(result.catalog.products[0].defaultVersion, "1.0.0-alpha.99");
  assert.ok(result.catalog.products[0].versions.some((entry) => entry.version === "1.0.0-alpha.63"));
  assert.equal(result.catalog.products[1].defaultVersion, "4.1.0");
  assert.ok(result.catalog.products[1].versions.some((entry) => entry.version === "3.0.6"));
});

test("an already catalogued coordinate is immutable", async () => {
  const version = "1.0.0-alpha.99";
  const originalFixture = kfdFixture(version, "original");
  const initial = await refreshCatalog({
    catalog: canonicalCatalog,
    requests: [{ productId: "kfd", version }],
    loadRelease: async () => originalFixture.release,
    loadAssetBytes: originalFixture.loadAssetBytes,
  });
  const mutatedFixture = kfdFixture(version, "mutated");
  await assert.rejects(
    refreshCatalog({
      catalog: initial.catalog,
      requests: [{ productId: "kfd", version }],
      loadRelease: async () => mutatedFixture.release,
      loadAssetBytes: mutatedFixture.loadAssetBytes,
    }),
    /immutable-catalog-drift/,
  );
});

test("an explicit Kungfu publication rebind changes only final publication evidence", async () => {
  const version = "4.0.0-alpha.9";
  const originalFixture = kungfuFixture(version, "original");
  const initial = await refreshCatalog({
    catalog: canonicalCatalog,
    requests: [{ productId: "kungfu", version }],
    loadRelease: async () => originalFixture.release,
    loadAssetBytes: originalFixture.loadAssetBytes,
  });
  const recoveredFixture = kungfuFixture(version, "recovered");
  const rebound = await refreshCatalog({
    catalog: initial.catalog,
    requests: [{ productId: "kungfu", version }],
    loadRelease: async () => recoveredFixture.release,
    loadAssetBytes: recoveredFixture.loadAssetBytes,
    rebindExisting: true,
  });
  assert.equal(rebound.changes[0].action, "rebound");
  const before = initial.catalog.products.find((entry) => entry.id === "kungfu").versions[0];
  const after = rebound.catalog.products.find((entry) => entry.id === "kungfu").versions[0];
  assert.deepEqual(after.targets.map((target) => target.artifact), before.targets.map((target) => target.artifact));
  assert.notEqual(after.targets[0].provenance.sha256, before.targets[0].provenance.sha256);
  assert.notEqual(after.targets[0].delegate.sha256, before.targets[0].delegate.sha256);
});

test("a Kungfu publication rebind rejects changed CLI archive bytes", async () => {
  const version = "4.0.0-alpha.9";
  const originalFixture = kungfuFixture(version, "original");
  const initial = await refreshCatalog({
    catalog: canonicalCatalog,
    requests: [{ productId: "kungfu", version }],
    loadRelease: async () => originalFixture.release,
    loadAssetBytes: originalFixture.loadAssetBytes,
  });
  const recoveredFixture = kungfuFixture(version, "recovered");
  const archive = recoveredFixture.release.assets.find((asset) => asset.name === "kungfu-episodes-cli-linux-x64.tar.gz");
  archive.digest = `sha256:${hash("changed-cli-archive")}`;
  await assert.rejects(
    refreshCatalog({
      catalog: initial.catalog,
      requests: [{ productId: "kungfu", version }],
      loadRelease: async () => recoveredFixture.release,
      loadAssetBytes: recoveredFixture.loadAssetBytes,
      rebindExisting: true,
    }),
    /publication-rebind-artifact-drift/,
  );
});

test("the catalog rejects a product adapter that points at another release authority", async () => {
  const catalog = structuredClone(canonicalCatalog);
  catalog.products.find((entry) => entry.id === "kungfu").releaseAdapter.repository = "kungfu-systems/not-kungfu";
  const fixture = kungfuFixture("4.0.0-alpha.1");
  await assert.rejects(
    refreshCatalog({
      catalog,
      requests: [{ productId: "kungfu", version: "4.0.0-alpha.1" }],
      loadRelease: async () => fixture.release,
      loadAssetBytes: fixture.loadAssetBytes,
    }),
    /release-adapter-mismatch/,
  );
});

test("the CLI accepts exact batched coordinates and rejects moving selectors", () => {
  assert.deepEqual(parseRequests(["--", "kfd@1.0.0-alpha.65", "kungfu@4.0.0-alpha.1", "--write", "--json"]), {
    json: true,
    rebindExisting: false,
    requests: [
      { productId: "kfd", version: "1.0.0-alpha.65" },
      { productId: "kungfu", version: "4.0.0-alpha.1" },
    ],
    write: true,
  });
  assert.equal(parseRequests(["kungfu@4.0.0-alpha.2", "--rebind-existing"]).rebindExisting, true);
  assert.throws(() => parseRequests(["kfd@latest"]), /release-version-invalid/);
  assert.throws(() => parseRequests(["kfd@1.0.0", "kfd@1.0.1"]), /product-coordinate-duplicate/);
});
