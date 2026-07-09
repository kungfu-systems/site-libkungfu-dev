import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const lockCandidates = [
  path.join(repoRoot, ".buildchain", "upstreams", "kfd.release.json"),
  path.join(repoRoot, "buildchain.upstreams", "kfd.release.json"),
];
const lockPath = lockCandidates.find((candidate) => fs.existsSync(candidate)) || lockCandidates[0];
const packagePath = path.join(repoRoot, "package.json");
const workspacePath = path.join(repoRoot, "pnpm-workspace.yaml");
const packageName = "@kungfu-tech/kfd";

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureMinimumReleaseAgeExclude(version) {
  const entry = `${packageName}@${version}`;
  const current = fs.existsSync(workspacePath) ? fs.readFileSync(workspacePath, "utf8") : "";
  const pattern = /^minimumReleaseAgeExclude:\n((?:  - .+\n)*)/m;
  const match = current.match(pattern);
  const existing = match
    ? match[1]
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^- /, "").replace(/^"|"$/g, ""))
        .filter(Boolean)
    : [];
  const entries = Array.from(new Set([...existing, entry])).sort();
  const nextBlock = `minimumReleaseAgeExclude:\n${entries.map((item) => `  - "${item}"`).join("\n")}\n`;
  const next = match
    ? current.replace(pattern, nextBlock)
    : `${current.replace(/\s*$/, "")}${current.trim() ? "\n\n" : ""}${nextBlock}`;
  if (next !== current) {
    fs.writeFileSync(workspacePath, next);
    console.log(`prepare-kfd-upstream: allowed ${packageName}@${version} through pnpm minimumReleaseAge`);
  }
}

if (!fs.existsSync(lockPath)) {
  console.log("prepare-kfd-upstream: no Buildchain KFD release lock; keeping package.json pin");
  process.exit(0);
}

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
if (lock.contract !== "kungfu-buildchain-release-propagation-lock") {
  throw new Error(`unsupported KFD release lock contract: ${lock.contract}`);
}
if (lock.upstream?.package?.name !== packageName) {
  throw new Error(`KFD release lock must target ${packageName}`);
}
if (lock.downstream?.repository !== "kungfu-systems/site-libkungfu-dev") {
  throw new Error("KFD release lock downstream repository mismatch");
}
const version = String(lock.upstream.package.version || "").trim();
const integrity = String(lock.upstream.package.integrity || "").trim();
if (!version || !integrity) {
  throw new Error("KFD release lock must include upstream package version and integrity");
}

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.dependencies = pkg.dependencies || {};
if (pkg.dependencies[packageName] !== version) {
  pkg.dependencies[packageName] = version;
  writeJson(packagePath, pkg);
  console.log(`prepare-kfd-upstream: pinned ${packageName}@${version}`);
} else {
  console.log(`prepare-kfd-upstream: ${packageName}@${version} already pinned`);
}
ensureMinimumReleaseAgeExclude(version);
