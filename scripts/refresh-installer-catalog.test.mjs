import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseRequests, refreshCatalog, resolveVersionEntry } from "./refresh-installer-catalog.mjs";

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
  for (const triple of ["aarch64-apple-darwin", "x86_64-apple-darwin", "aarch64-unknown-linux-gnu", "x86_64-unknown-linux-gnu"]) {
    const archiveName = `kfd-${version}-${triple}.tar.gz`;
    const archiveSha = hash(`${salt}-${archiveName}`);
    fixture.addStatic(archiveName, 512, archiveSha);
    fixture.addJson(`kfd-${version}-${triple}.provenance.json`, {
      schema: "kfd.native-release-provenance/v1",
      identity: { name: "kfd", version, target: triple, sourceSha },
      artifacts: {
        executable: { name: "kfd", sha256: hash(`${salt}-${triple}-binary`) },
        archive: { name: archiveName, sha256: archiveSha },
      },
    });
  }
  return fixture;
}

function buildchainFixture(version) {
  const fixture = releaseFixture("buildchain", version);
  const sourceSha = gitSha(`buildchain-source-${version}`);
  for (const triple of ["aarch64-apple-darwin", "x86_64-unknown-linux-gnu"]) {
    fixture.addStatic(`buildchain-${triple}.tar.gz`, 1024);
    fixture.addJson(`buildchain-${triple}.json`, {
      contract: "kungfu-buildchain-standalone-binary",
      name: "buildchain",
      version: `v${version}`,
      platform: triple,
      sourceSha,
      executableFiles: [{ path: "buildchain", sha256: hash(`${triple}-binary`) }],
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
  for (const platform of ["macos-arm64", "linux-x64"]) {
    const artifactName = `agent-hub-demo-${platform}`;
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

function kungfuFixture(version) {
  const fixture = releaseFixture("kungfu", version);
  const sourceCommit = gitSha(`kungfu-source-${version}`);
  const installerSha = hash(`kungfu-installer-${version}`);
  fixture.addStatic("kungfu-install.sh", 4096, installerSha);
  fixture.addStatic("kungfu-episodes-cli-darwin-arm64.tar.gz", 8192);
  fixture.addStatic("kungfu-episodes-cli-linux-x64.tar.gz", 16384);
  const immutablePath = `installers/v1/alpha/${version}/${hash(version)}`;
  fixture.addJson("kungfu-installer-publication-bundle.json", {
    schema: "kungfu.installer-publication-bundle/v1",
    identity: { version, releaseTag: `v${version}`, sourceCommit },
    distribution: { repository: "kungfu-systems/kungfu" },
    routes: { immutablePath },
    assets: [{
      path: `${immutablePath}/install.sh`,
      role: "immutable-installer",
      size: 4096,
      digest: `sha256:${installerSha}`,
      releaseAsset: "kungfu-install.sh",
    }],
  });
  return fixture;
}

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
    assert.equal(entry.targets.length, productId === "kfd" ? 4 : 2);
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

test("the CLI accepts exact batched coordinates and rejects moving selectors", () => {
  assert.deepEqual(parseRequests(["--", "kfd@1.0.0-alpha.65", "kungfu@4.0.0-alpha.1", "--write", "--json"]), {
    json: true,
    requests: [
      { productId: "kfd", version: "1.0.0-alpha.65" },
      { productId: "kungfu", version: "4.0.0-alpha.1" },
    ],
    write: true,
  });
  assert.throws(() => parseRequests(["kfd@latest"]), /release-version-invalid/);
  assert.throws(() => parseRequests(["kfd@1.0.0", "kfd@1.0.1"]), /product-coordinate-duplicate/);
});
