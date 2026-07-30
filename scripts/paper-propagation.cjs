#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { loadPublicationPackageSet } = require("./publication-packages.cjs");

const PROPAGATION_LOCK_CONTRACT = "kungfu-buildchain-release-propagation-lock";
const PROPAGATION_RECEIPT_CONTRACT = "kungfu-buildchain-release-propagation-receipt";
const QUALIFICATION_CONTRACT = "libkungfu-dev-paper-propagation-qualification";
const FAST_PATH_CONTRACT = "kungfu-buildchain-publication-package-pin-fast-path";
const SITE_REPOSITORY = "kungfu-systems/site-libkungfu-dev";
const DEFAULT_OUTPUT = ".buildchain/paper-propagation-qualification.json";
const LOCK_PATH_PATTERN = /^(?:buildchain\.upstreams|\.buildchain\/upstreams)\/[^/]+\.release\.json$/;
const PACKAGE_PIN_PATHS = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "src/publication-packages.json",
]);

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}

function stableJson(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sha256Json(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stableJson(value));
}

function writePrettyJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function packageRoot(packageName) {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

function normalizeDigest(value, label) {
  const normalized = String(value || "").trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`${label} must be an exact SHA-256 digest`);
  }
  return normalized;
}

function normalizeIntegrity(value, label) {
  const normalized = String(value || "").trim();
  if (!/^sha512-[A-Za-z0-9+/=_-]+$/.test(normalized)) {
    throw new Error(`${label} must be an exact sha512 package integrity`);
  }
  return normalized;
}

function normalizeRepoPath(value, label = "repository path") {
  const normalized = String(value || "").trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`invalid ${label}: ${value}`);
  }
  return normalized;
}

function readPnpmLockPackage(repoRoot, packageName, version) {
  const lockText = fs.readFileSync(path.join(repoRoot, "pnpm-lock.yaml"), "utf8");
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^  '${escapedName}@${escapedVersion}':\\n(?:    .+\\n)*?    resolution: \\{integrity: ([^}]+)\\}`, "m");
  const match = lockText.match(pattern);
  if (match) return { version, integrity: match[1].trim() };
  const localPattern = new RegExp(
    `^  '${escapedName}@file:[^']+':\\n    resolution: \\{integrity: ([^,}]+)[^\\n]*\\}\\n    version: ${escapedVersion}$`,
    "m",
  );
  const localMatch = lockText.match(localPattern);
  if (!localMatch) throw new Error(`pnpm-lock.yaml missing ${packageName}@${version}`);
  return { version, integrity: localMatch[1].trim() };
}

function assertPaperLock(lock) {
  if (lock?.contract !== PROPAGATION_LOCK_CONTRACT || lock?.schemaVersion !== 1) {
    throw new Error("paper propagation lock contract mismatch");
  }
  if (lock.downstream?.repository !== SITE_REPOSITORY || lock.propagation?.exact !== true || lock.propagation?.floatingTags !== false) {
    throw new Error("paper propagation lock must target the exact Site repository without floating tags");
  }
  const packageFact = lock.upstream?.package;
  const publication = lock.upstream?.publicationArtifact;
  if (
    !packageFact?.name?.startsWith("@kungfu-tech/paper-")
    || !packageFact.version
    || packageFact.version !== publication?.version
  ) {
    throw new Error("paper propagation lock must bind one exact paper package and publication version");
  }
  normalizeIntegrity(packageFact.integrity, "paper package integrity");
  normalizeDigest(lock.lockSha256, "paper propagation lock root");
  normalizeDigest(lock.upstream?.releasePassport?.sha256, "paper release passport");
  compareDigest(
    lock.lockSha256,
    sha256Json({ ...lock, lockSha256: undefined }),
    "paper propagation lock root",
  );
  compareDigest(
    lock.propagation?.propagationKey,
    sha256Json({
      release: {
        repository: lock.upstream.repository,
        version: packageFact.version,
        channel: lock.upstream.channel,
      },
      downstreamRepository: lock.downstream.repository,
    }),
    "paper propagation key",
  );
  return { packageFact, publication };
}

function consumePaperPropagation({ repoRoot = process.cwd(), lockPath } = {}) {
  const absoluteLockPath = path.resolve(repoRoot, lockPath);
  const lock = readJson(absoluteLockPath);
  const { packageFact, publication } = assertPaperLock(lock);
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageSetPath = path.join(repoRoot, "src", "publication-packages.json");
  const packageJson = readJson(packageJsonPath);
  const packageSet = readJson(packageSetPath);
  if (!Object.hasOwn(packageJson.dependencies || {}, packageFact.name)) {
    throw new Error(`package.json does not declare paper dependency ${packageFact.name}`);
  }
  const packageEntry = packageSet.packages?.find((entry) => entry.name === packageFact.name);
  if (!packageEntry) {
    throw new Error(`src/publication-packages.json does not declare ${packageFact.name}`);
  }
  const expectedId = packageFact.name.slice("@kungfu-tech/paper-".length);
  if (publication.id && publication.id !== expectedId) {
    throw new Error(`paper publication id does not match package: ${publication.id}`);
  }
  const previousVersion = packageJson.dependencies[packageFact.name];
  packageJson.dependencies[packageFact.name] = packageFact.version;
  packageEntry.version = packageFact.version;
  writePrettyJson(packageJsonPath, packageJson);
  writePrettyJson(packageSetPath, packageSet);
  return {
    schemaVersion: 1,
    contract: "libkungfu-dev-paper-propagation-consume-result",
    package: packageFact.name,
    previousVersion,
    version: packageFact.version,
    lockPath: normalizeRepoPath(path.relative(repoRoot, absoluteLockPath), "propagation lock path"),
    lockSha256: `sha256:${normalizeDigest(lock.lockSha256, "paper propagation lock root")}`,
    nextAction: "refresh pnpm-lock.yaml with pnpm install --lockfile-only, then run paper propagation qualification",
  };
}

function compareDigest(actual, expected, label) {
  if (normalizeDigest(actual, label) !== normalizeDigest(expected, label)) {
    throw new Error(`${label} does not match the exact propagation lock`);
  }
}

function compareText(actual, expected, label) {
  if (String(actual || "").trim() !== String(expected || "").trim()) {
    throw new Error(`${label} does not match the exact propagation lock`);
  }
}

function qualifyPublicationFacts({ repoRoot, lock, source }) {
  const { packageFact, publication: locked } = assertPaperLock(lock);
  const packageInfo = source.packages.find((entry) => entry.name === packageFact.name);
  const publication = source.registry.publications.find((entry) => entry.package === packageFact.name);
  if (!packageInfo || packageInfo.version !== packageFact.version || !publication) {
    throw new Error(`installed publication package does not match ${packageFact.name}@${packageFact.version}`);
  }
  const version = publication.versions.find((entry) => entry.version === packageFact.version);
  if (!version) throw new Error(`publication registry is missing ${packageFact.name}@${packageFact.version}`);

  const packageJson = readJson(path.join(repoRoot, "package.json"));
  if (packageJson.dependencies?.[packageFact.name] !== packageFact.version) {
    throw new Error(`package.json does not exactly pin ${packageFact.name}@${packageFact.version}`);
  }
  const lockPackage = readPnpmLockPackage(repoRoot, packageFact.name, packageFact.version);
  compareText(lockPackage.integrity, packageFact.integrity, "paper package integrity");

  compareText(publication.id, locked.id || publication.id, "paper publication id");
  compareText(publication.canonicalReader.url, locked.canonicalUrl, "paper canonical URL");
  compareText(publication.latest.path, new URL(locked.latestUrl).pathname, "paper latest URL");
  compareText(version.immutablePath, new URL(locked.immutableVersionUrl).pathname, "paper immutable version URL");

  const root = packageRoot(packageFact.name);
  const localRegistry = readJson(path.join(root, ".buildchain", "publication", "publication-registry.json"));
  compareDigest(localRegistry.registrySha256, locked.registry?.sha256, "paper publication registry root");
  compareDigest(version.manifest.sha256, locked.manifest?.sha256, "paper publication manifest");
  compareDigest(version.passport.sha256, locked.passport?.sha256, "paper publication passport");
  const primary = version.artifacts.find((entry) => entry.kind === "pdf") || version.artifacts[0];
  if (!primary) throw new Error("paper publication version has no primary artifact");
  compareDigest(primary.sha256, locked.primaryArtifact?.sha256, "paper primary artifact");
  compareText(primary.source.path, locked.primaryArtifact?.path, "paper primary artifact source path");
  compareText(`${locked.immutableVersionUrl}${primary.path}`, locked.primaryArtifact?.url, "paper primary artifact URL");
  compareDigest(version.source.bundle.sha256, locked.sourceBundle?.sha256, "paper source bundle");
  compareText(version.source.bundle.source.path, locked.sourceBundle?.path, "paper source bundle path");
  compareText(`${locked.immutableVersionUrl}${version.source.bundle.path}`, locked.sourceBundle?.url, "paper source bundle URL");

  return {
    packageFact,
    publication,
    version,
    lockPackage,
  };
}

function normalizeChangedFiles(values) {
  return [...new Set((values || [])
    .map((entry) => normalizeRepoPath(entry, "changed file"))
    .filter(Boolean))]
    .sort();
}

function classifyChangedFiles({ changedFiles, lockPath }) {
  const normalizedLockPath = normalizeRepoPath(lockPath, "propagation lock path");
  const allowed = new Set([...PACKAGE_PIN_PATHS, normalizedLockPath]);
  const unexpected = changedFiles.filter((entry) => !allowed.has(entry));
  const missing = [...PACKAGE_PIN_PATHS, normalizedLockPath].filter((entry) => !changedFiles.includes(entry));
  return {
    mode: unexpected.length === 0 && missing.length === 0 ? "package-pin-only" : "full-site",
    allowed: [...allowed].sort(),
    unexpected,
    missing,
  };
}

function qualifyPaperPropagation({
  repoRoot = process.cwd(),
  lockPath,
  receiptPath = "",
  changedFiles = [],
} = {}) {
  const normalizedChangedFiles = normalizeChangedFiles(changedFiles);
  const changedLocks = normalizedChangedFiles.filter((entry) => LOCK_PATH_PATTERN.test(entry));
  const selectedLockPath = lockPath
    ? normalizeRepoPath(lockPath, "propagation lock path")
    : (changedLocks.length === 1 ? changedLocks[0] : "");
  if (!selectedLockPath) {
    if (changedLocks.length > 1) throw new Error("paper propagation qualification found multiple changed release locks");
    const body = {
      schemaVersion: 1,
      contract: QUALIFICATION_CONTRACT,
      qualified: false,
      reason: "no-single-paper-propagation-lock",
      changedFiles: normalizedChangedFiles,
    };
    return { ...body, qualificationRoot: sha256Json(body) };
  }

  const lock = readJson(path.resolve(repoRoot, selectedLockPath));
  const classification = classifyChangedFiles({ changedFiles: normalizedChangedFiles, lockPath: selectedLockPath });
  const source = loadPublicationPackageSet(repoRoot);
  const facts = qualifyPublicationFacts({ repoRoot, lock, source });
  let controllerReceipt;
  if (receiptPath) {
    controllerReceipt = readJson(path.resolve(repoRoot, receiptPath));
    if (
      controllerReceipt.contract !== PROPAGATION_RECEIPT_CONTRACT
      || controllerReceipt.propagationKey !== lock.propagation.propagationKey
      || controllerReceipt.downstream?.lockSha256 !== lock.lockSha256
    ) {
      throw new Error("release propagation receipt does not bind the selected paper lock");
    }
  }

  const prefix = facts.version.immutablePath.replace(/^\/+|\/+$/g, "");
  const mutableFiles = [
    "archive/index.html",
    `${facts.publication.id}/index.html`,
    `${facts.publication.id}/latest/index.html`,
    "index.html",
    "llms.txt",
    "manifest.json",
    "registry.json",
  ].sort();
  const invalidationPaths = [
    "/",
    "/archive/",
    `/${facts.publication.id}/`,
    `/${facts.publication.id}/latest/`,
    `/${prefix}*`,
    "/llms.txt",
    "/manifest.json",
    "/registry.json",
  ].sort();
  const states = {
    "package-published": {
      state: "complete",
      evidence: {
        name: facts.packageFact.name,
        version: facts.packageFact.version,
        integrity: facts.lockPackage.integrity,
      },
    },
    "alpha-complete": {
      state: lock.upstream.channel === "alpha" ? "complete" : "not-applicable",
      evidence: lock.upstream.channel === "alpha"
        ? {
            tag: lock.upstream.tag,
            releasePassportSha256: `sha256:${normalizeDigest(lock.upstream.releasePassport.sha256, "paper release passport")}`,
          }
        : null,
    },
    "staging-visible": {
      state: controllerReceipt?.states?.["staging-visible"]?.state || "pending",
    },
    "production-visible": {
      state: controllerReceipt?.states?.["production-visible"]?.state || "not-requested",
    },
  };
  const body = {
    schemaVersion: 1,
    contract: QUALIFICATION_CONTRACT,
    qualified: classification.mode === "package-pin-only",
    reason: classification.mode === "package-pin-only" ? "exact-package-pin-only" : "changed-paths-require-full-site",
    changedFiles: normalizedChangedFiles,
    classification,
    propagation: {
      key: lock.propagation.propagationKey,
      branch: lock.propagation.branch,
      lockPath: selectedLockPath,
      lockSha256: `sha256:${normalizeDigest(lock.lockSha256, "paper propagation lock root")}`,
      controllerReceiptSha256: controllerReceipt?.receiptSha256
        ? `sha256:${normalizeDigest(controllerReceipt.receiptSha256, "paper propagation receipt")}`
        : undefined,
    },
    publication: {
      package: facts.packageFact.name,
      version: facts.packageFact.version,
      integrity: facts.lockPackage.integrity,
      id: facts.publication.id,
      immutablePath: facts.version.immutablePath,
    },
    states,
  };
  const qualificationRoot = sha256Json(body);
  return {
    ...body,
    qualificationRoot,
    publicationFastPath: classification.mode === "package-pin-only"
      ? {
          contract: FAST_PATH_CONTRACT,
          mode: "package-pin-only",
          targetSurface: "papers",
          qualificationRoot,
          immutablePrefixes: [prefix],
          mutableFiles,
          invalidationPaths,
        }
      : undefined,
  };
}

function verifyPaperPropagationQualification(qualification) {
  if (qualification?.contract !== QUALIFICATION_CONTRACT || qualification?.schemaVersion !== 1) {
    throw new Error("paper propagation qualification contract mismatch");
  }
  const {
    qualificationRoot,
    publicationFastPath,
    ...body
  } = qualification;
  if (qualificationRoot !== sha256Json(body)) {
    throw new Error("paper propagation qualification root mismatch");
  }
  if (qualification.qualified === true) {
    if (
      publicationFastPath?.contract !== FAST_PATH_CONTRACT
      || publicationFastPath.mode !== "package-pin-only"
      || publicationFastPath.targetSurface !== "papers"
      || publicationFastPath.qualificationRoot !== qualificationRoot
    ) {
      throw new Error("paper propagation fast-path envelope mismatch");
    }
  } else if (publicationFastPath !== undefined) {
    throw new Error("unqualified paper propagation must not expose a fast path");
  }
  return qualification;
}

function autoChangedFiles(repoRoot) {
  const output = execFileSync(
    "git",
    ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "HEAD"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return output.split(/\r?\n/).filter(Boolean);
}

function parseArgs(argv) {
  const command = argv[0] || "";
  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith("--")) throw new Error(`unexpected argument: ${flag}`);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      values[flag.slice(2)] = true;
    } else {
      values[flag.slice(2)] = next;
      index += 1;
    }
  }
  return { command, values };
}

function changedFilesFromArgs(repoRoot, values) {
  if (values["changed-files-json"]) return JSON.parse(values["changed-files-json"]);
  if (values["changed-files-file"]) {
    return fs.readFileSync(path.resolve(repoRoot, values["changed-files-file"]), "utf8").split(/\r?\n/).filter(Boolean);
  }
  return autoChangedFiles(repoRoot);
}

function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(values.cwd || process.cwd());
  if (command === "consume") {
    if (!values.lock) throw new Error("paper-propagation consume requires --lock");
    process.stdout.write(stableJson(consumePaperPropagation({ repoRoot, lockPath: values.lock })));
    return;
  }
  if (command === "qualify") {
    const output = path.resolve(repoRoot, values.output || DEFAULT_OUTPUT);
    const qualification = qualifyPaperPropagation({
      repoRoot,
      lockPath: values.lock || "",
      receiptPath: values.receipt || "",
      changedFiles: changedFilesFromArgs(repoRoot, values),
    });
    writeJson(output, qualification);
    process.stdout.write(stableJson({ ...qualification, output: path.relative(repoRoot, output) }));
    return;
  }
  throw new Error("usage: paper-propagation <consume|qualify> [--lock PATH] [--receipt PATH] [--changed-files-file PATH] [--output PATH]");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${String(error.message || error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  FAST_PATH_CONTRACT,
  QUALIFICATION_CONTRACT,
  classifyChangedFiles,
  consumePaperPropagation,
  qualifyPaperPropagation,
  readPnpmLockPackage,
  stableJson,
  verifyPaperPropagationQualification,
};
