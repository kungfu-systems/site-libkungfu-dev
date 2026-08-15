import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import {
  installerProductAdapters,
  installerProductIds,
  releaseAdapterRecord,
} from "./installer-release-model.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(repoRoot, "src", "install", "installer-catalog.json");
const digestPattern = /^sha256:([0-9a-f]{64})$/u;
const gitShaPattern = /^[0-9a-f]{40}$/u;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/u;
function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function requireGitSha(value, label) {
  if (!gitShaPattern.test(value || "")) fail("release-source-invalid", `${label} must be an exact Git SHA`);
  return value;
}

function requireVersion(value) {
  if (!versionPattern.test(value || "") || value === "latest") {
    fail("release-version-invalid", "use an exact version such as 1.0.0-alpha.65; moving selectors are forbidden");
  }
  return value;
}

function releaseAsset(release, name) {
  const asset = release.assets?.find((candidate) => candidate.name === name);
  if (!asset) fail("release-asset-missing", `${release.tag_name} does not contain ${name}`);
  const match = digestPattern.exec(asset.digest || "");
  if (!match) fail("release-asset-digest-missing", `${name} has no GitHub SHA-256 digest`);
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0) fail("release-asset-size-invalid", name);
  if (!String(asset.browser_download_url || "").startsWith("https://github.com/")) {
    fail("release-asset-url-invalid", name);
  }
  return {
    name,
    url: asset.browser_download_url,
    size: asset.size,
    sha256: match[1],
  };
}

async function verifiedJson(asset, loadAssetBytes) {
  const bytes = Buffer.from(await loadAssetBytes(asset));
  if (bytes.length !== asset.size) fail("release-metadata-size-mismatch", asset.name);
  if (sha256(bytes) !== asset.sha256) fail("release-metadata-digest-mismatch", asset.name);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("release-metadata-json-invalid", asset.name);
  }
}

function provenanceReference(kind, asset) {
  return { kind, url: asset.url, size: asset.size, sha256: asset.sha256 };
}

function assertRelease(release, repository, version) {
  const expectedTag = `v${version}`;
  if (release.tag_name !== expectedTag) fail("release-tag-mismatch", `${release.tag_name} != ${expectedTag}`);
  if (release.draft) fail("release-draft-forbidden", expectedTag);
  if (!release.published_at) fail("release-published-at-missing", expectedTag);
  if (release.repository !== repository) {
    fail("release-repository-mismatch", release.repository || "unknown");
  }
}

async function resolveKfd({ version, release, loadAssetBytes }) {
  let sourceSha = "";
  const targets = [];
  for (const [platform, triple] of installerProductAdapters.kfd.targets) {
    const archiveType = platform === "windows-x64" ? "zip" : "tar.gz";
    const artifact = releaseAsset(release, `kfd-${version}-${triple}.${archiveType}`);
    const provenanceAsset = releaseAsset(release, `kfd-${version}-${triple}.provenance.json`);
    const provenance = await verifiedJson(provenanceAsset, loadAssetBytes);
    if (provenance.schema !== "kfd.native-release-provenance/v1") fail("kfd-provenance-contract-mismatch", triple);
    if (provenance.identity?.name !== "kfd" || provenance.identity?.version !== version || provenance.identity?.target !== triple) {
      fail("kfd-provenance-identity-mismatch", triple);
    }
    if (provenance.artifacts?.archive?.name !== artifact.name || provenance.artifacts?.archive?.sha256 !== artifact.sha256) {
      fail("kfd-archive-evidence-mismatch", triple);
    }
    const candidateSourceSha = requireGitSha(provenance.identity.sourceSha, `kfd@${version}`);
    if (sourceSha && sourceSha !== candidateSourceSha) fail("release-source-divergence", `kfd@${version}`);
    sourceSha = candidateSourceSha;
    const binarySha256 = provenance.artifacts?.executable?.sha256;
    if (!/^[0-9a-f]{64}$/u.test(binarySha256 || "")) fail("kfd-binary-digest-missing", triple);
    targets.push({
      platform,
      kind: "archive",
      archiveType,
      binaryPath: `kfd-${version}-${triple}/${platform === "windows-x64" ? "kfd.exe" : "kfd"}`,
      binarySha256,
      artifact,
      provenance: provenanceReference(provenance.schema, provenanceAsset),
    });
  }
  return { sourceSha, targets };
}

async function resolveBuildchain({ version, release, loadAssetBytes }) {
  let sourceSha = "";
  const targets = [];
  for (const [platform, triple] of installerProductAdapters.buildchain.targets) {
    const archiveType = platform === "windows-x64" ? "zip" : "tar.gz";
    const artifact = releaseAsset(release, `buildchain-${triple}.${archiveType}`);
    const provenanceAsset = releaseAsset(release, `buildchain-${triple}.json`);
    const provenance = await verifiedJson(provenanceAsset, loadAssetBytes);
    if (provenance.contract !== "kungfu-buildchain-standalone-binary") {
      fail("buildchain-provenance-contract-mismatch", triple);
    }
    if (provenance.name !== "buildchain" || provenance.version !== `v${version}` || provenance.platform !== triple) {
      fail("buildchain-provenance-identity-mismatch", triple);
    }
    const candidateSourceSha = requireGitSha(provenance.sourceSha, `buildchain@${version}`);
    if (sourceSha && sourceSha !== candidateSourceSha) fail("release-source-divergence", `buildchain@${version}`);
    sourceSha = candidateSourceSha;
    const binaryPath = platform === "windows-x64" ? "buildchain.exe" : "buildchain";
    const executable = provenance.executableFiles?.find((entry) => entry.path === binaryPath);
    if (!executable || !/^[0-9a-f]{64}$/u.test(executable.sha256 || "")) {
      fail("buildchain-binary-digest-missing", triple);
    }
    targets.push({
      platform,
      kind: "archive",
      archiveType,
      binaryPath,
      binarySha256: executable.sha256,
      artifact,
      provenance: provenanceReference(provenance.contract, provenanceAsset),
    });
  }
  return { sourceSha, targets };
}

async function resolveAgentHubDemo({ version, release, loadAssetBytes }) {
  const evidenceAsset = releaseAsset(release, "artifact-evidence.json");
  const evidence = await verifiedJson(evidenceAsset, loadAssetBytes);
  if (evidence.contract !== "kungfu-buildchain-artifact-evidence"
      || evidence.repository !== "kungfu-systems/agent-hub-demo"
      || evidence.release?.tag !== `v${version}`) {
    fail("agent-hub-release-evidence-mismatch", version);
  }
  const sourceSha = requireGitSha(evidence.release.sourceSha, `agent-hub-demo@${version}`);
  const targets = [];
  for (const [platform, releasePlatform] of installerProductAdapters["agent-hub-demo"].targets) {
    const suffix = releasePlatform;
    const artifactName = platform === "windows-x64"
      ? `agent-hub-demo-${suffix}.exe`
      : `agent-hub-demo-${suffix}`;
    const artifact = releaseAsset(release, artifactName);
    const provenanceAsset = releaseAsset(release, `binary-${suffix}.json`);
    const provenance = await verifiedJson(provenanceAsset, loadAssetBytes);
    if (provenance.contract !== "agent-hub-demo.binary-artifact/v1"
        || provenance.platform !== releasePlatform
        || provenance.sha256 !== artifact.sha256
        || provenance.size !== artifact.size) {
      fail("agent-hub-binary-evidence-mismatch", releasePlatform);
    }
    const target = {
      platform,
      kind: "binary",
      binaryPath: platform === "windows-x64" ? "agent-hub-demo.exe" : "agent-hub-demo",
      binarySha256: provenance.sha256,
      artifact,
      provenance: provenanceReference(provenance.contract, provenanceAsset),
    };
    if (platform === "darwin-arm64") {
      if (provenance.signing?.state !== "signed") fail("agent-hub-signing-evidence-missing", releasePlatform);
      target.platformTrust = "codesign";
    }
    targets.push(target);
  }
  return { sourceSha, targets };
}

async function resolveKungfu({ version, release, loadAssetBytes }) {
  const provenanceAsset = releaseAsset(release, "kungfu-installer-publication-bundle.json");
  const bundle = await verifiedJson(provenanceAsset, loadAssetBytes);
  if (bundle.schema !== "kungfu.installer-publication-bundle/v1"
      || bundle.identity?.version !== version
      || bundle.identity?.releaseTag !== `v${version}`
      || bundle.distribution?.repository !== "kungfu-systems/kungfu") {
    fail("kungfu-installer-bundle-mismatch", version);
  }
  const sourceSha = requireGitSha(bundle.identity.sourceCommit, `kungfu@${version}`);
  const delegateFor = (installerName) => {
    const immutableInstaller = bundle.assets?.find((asset) => asset.path === `${bundle.routes?.immutablePath}/${installerName}`);
    if (!immutableInstaller || immutableInstaller.role !== "immutable-installer") {
      fail("kungfu-immutable-installer-missing", `${version}/${installerName}`);
    }
    const installerAsset = releaseAsset(release, immutableInstaller.releaseAsset);
    const installerDigest = digestPattern.exec(immutableInstaller.digest || "")?.[1];
    if (installerDigest !== installerAsset.sha256 || immutableInstaller.size !== installerAsset.size) {
      fail("kungfu-installer-release-mismatch", `${version}/${installerName}`);
    }
    return {
      url: installerAsset.url,
      size: immutableInstaller.size,
      sha256: installerDigest,
    };
  };
  const shellDelegate = delegateFor("install.sh");
  const powershellDelegate = delegateFor("install.ps1");
  const artifactNames = {
    "darwin-arm64": "kungfu-episodes-cli-darwin-arm64.tar.gz",
    "linux-x64": "kungfu-episodes-cli-linux-x64.tar.gz",
    "windows-x64": "kungfu-episodes-cli-windows-x64.zip",
  };
  const targets = installerProductAdapters.kungfu.targets.map(([platform]) => ({
    platform,
    kind: "delegated-installer",
    artifact: releaseAsset(release, artifactNames[platform]),
    provenance: provenanceReference(bundle.schema, provenanceAsset),
    delegate: platform === "windows-x64" ? powershellDelegate : shellDelegate,
  }));
  return { sourceSha, targets };
}

const resolvers = {
  kfd: resolveKfd,
  buildchain: resolveBuildchain,
  kungfu: resolveKungfu,
  "agent-hub-demo": resolveAgentHubDemo,
};

export async function resolveVersionEntry({ productId, version, release, loadAssetBytes }) {
  requireVersion(version);
  const adapter = installerProductAdapters[productId];
  if (!adapter) fail("product-unsupported", productId);
  assertRelease(release, adapter.repository, version);
  const resolved = await resolvers[productId]({ version, release, loadAssetBytes });
  return {
    version,
    tag: `v${version}`,
    publishedAt: release.published_at,
    sourceSha: resolved.sourceSha,
    targets: resolved.targets,
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function refreshCatalog({ catalog, requests, loadRelease, loadAssetBytes }) {
  const updated = structuredClone(catalog);
  const changes = [];
  for (const request of requests) {
    const product = updated.products.find((entry) => entry.id === request.productId);
    if (!product) fail("product-unsupported", request.productId);
    const expectedAdapter = releaseAdapterRecord(request.productId);
    if (!isDeepStrictEqual(product.releaseAdapter, expectedAdapter)) {
      fail("release-adapter-mismatch", request.productId);
    }
    const release = await loadRelease(request.productId, request.version, expectedAdapter.repository);
    const resolved = await resolveVersionEntry({ ...request, release, loadAssetBytes });
    const existingIndex = product.versions.findIndex((entry) => entry.version === request.version);
    let expanded = false;
    if (existingIndex >= 0) {
      const existing = product.versions[existingIndex];
      const comparableResolved = {
        ...resolved,
        targets: existing.targets.map((target) => resolved.targets.find((candidate) => candidate.platform === target.platform)),
      };
      if (!isDeepStrictEqual(existing, comparableResolved)) {
        fail("immutable-catalog-drift", `${request.productId}@${request.version}`);
      }
      if (resolved.targets.length > existing.targets.length) {
        product.versions[existingIndex] = resolved;
        expanded = true;
      }
    } else {
      product.versions.unshift(resolved);
    }
    const previousDefault = product.defaultVersion;
    product.defaultVersion = request.version;
    changes.push({
      product: request.productId,
      version: request.version,
      action: existingIndex < 0 ? "added" : expanded ? "expanded" : previousDefault === request.version ? "verified" : "promoted",
      retainedVersions: product.versions.map((entry) => entry.version),
    });
  }
  return { catalog: updated, changes };
}

export function parseRequests(argv) {
  const write = argv.includes("--write");
  const json = argv.includes("--json");
  const specs = argv.filter((argument) => argument !== "--" && !argument.startsWith("--"));
  const unknownFlags = argv.filter((argument) => argument.startsWith("--") && !["--", "--write", "--json"].includes(argument));
  if (unknownFlags.length) fail("argument-unsupported", unknownFlags.join(", "));
  if (!specs.length) fail("refresh-request-missing", "provide one or more exact product@version coordinates");
  const seen = new Set();
  const requests = specs.map((spec) => {
    const separator = spec.indexOf("@");
    const productId = spec.slice(0, separator);
    const version = spec.slice(separator + 1);
    if (separator <= 0 || !installerProductIds.includes(productId)) fail("product-coordinate-invalid", spec);
    requireVersion(version);
    if (seen.has(productId)) fail("product-coordinate-duplicate", productId);
    seen.add(productId);
    return { productId, version };
  });
  return { json, requests, write };
}

async function fetchResponse(url, token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "site-libkungfu-dev-installer-refresh" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) fail("github-request-failed", `${response.status} ${url}`);
  return response;
}

async function main() {
  const options = parseRequests(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const loadRelease = async (_productId, version, repository) => {
    const response = await fetchResponse(`https://api.github.com/repos/${repository}/releases/tags/v${version}`, token);
    return { ...(await response.json()), repository };
  };
  const loadAssetBytes = async (asset) => Buffer.from(await (await fetchResponse(asset.url, token)).arrayBuffer());
  const originalBytes = fs.readFileSync(catalogPath);
  const original = JSON.parse(originalBytes.toString("utf8"));
  const result = await refreshCatalog({ catalog: original, requests: options.requests, loadRelease, loadAssetBytes });
  const nextBytes = Buffer.from(stableJson(result.catalog));
  const changed = !originalBytes.equals(nextBytes);
  if (options.write && changed) fs.writeFileSync(catalogPath, nextBytes);
  const output = {
    schemaVersion: 1,
    contract: "libkungfu.installer-catalog-refresh/v1",
    mode: options.write ? "write" : "plan",
    source: "exact-github-release",
    movingSelectorsUsed: false,
    changed,
    catalogPath: path.relative(repoRoot, catalogPath),
    changes: result.changes,
  };
  process.stdout.write(options.json ? stableJson(output) : `${output.mode}: ${result.changes.map((entry) => `${entry.product}@${entry.version}=${entry.action}`).join(" ")} changed=${changed}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`installer-catalog-refresh failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
