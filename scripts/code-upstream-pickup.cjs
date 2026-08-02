#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, ".buildchain", "manual-code-upstreams.json");
const packageJsonPath = path.join(repoRoot, "package.json");
const runtimeAlias = "@kungfu-tech/buildchain-runtime";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function flagValue(args, name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? "" : String(args[index + 1] || "").trim();
}

function runtimeBin() {
  const packagePath = require.resolve(`${runtimeAlias}/package.json`, { paths: [repoRoot] });
  return path.join(path.dirname(packagePath), "bin", "buildchain.mjs");
}

function runRuntime(args, { capture = false } = {}) {
  const result = spawnSync(process.execPath, [runtimeBin(), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
  return capture ? result.stdout : "";
}

function normalizedConfig() {
  const config = readJson(configPath);
  const packageJson = readJson(packageJsonPath);
  const expectedRuntime = `npm:${config.runtime.package}@${config.runtime.version}`;
  if (packageJson.devDependencies?.[runtimeAlias] !== expectedRuntime) {
    throw new Error(`${runtimeAlias} must pin the declared runtime ${expectedRuntime}`);
  }
  const installedRuntime = readJson(
    require.resolve(`${runtimeAlias}/package.json`, { paths: [repoRoot] }),
  );
  if (
    installedRuntime.name !== config.runtime.package ||
    installedRuntime.version !== config.runtime.version
  ) {
    throw new Error(`${runtimeAlias} installed bytes disagree with the declared runtime`);
  }
  return { config, packageJson };
}

function selectedSource(sourceId, channel) {
  const { config, packageJson } = normalizedConfig();
  const source = config.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new Error(`unknown manual code upstream: ${sourceId}`);
  if (!Object.hasOwn(source.distTags || {}, channel)) {
    throw new Error("channel must be alpha or release");
  }
  const currentVersion = packageJson.dependencies?.[source.package];
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(currentVersion || "")) {
    throw new Error(`${source.package} must be an exact dependency before pickup`);
  }
  return { config, packageJson, source, currentVersion };
}

function planOrCreate(command, args) {
  const sourceId = String(args[0] || "").trim();
  const channel = String(args[1] || "").trim();
  const { currentVersion } = selectedSource(sourceId, channel);
  const runtimeArgs = [
    "release-propagation",
    "pickup",
    command,
    "--config",
    configPath,
    "--source-id",
    sourceId,
    "--channel",
    channel,
    "--current-version",
    currentVersion,
  ];
  const output = flagValue(args, "output");
  if (command === "create") {
    if (!output) throw new Error("create requires --output <capture.json>");
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    runtimeArgs.push("--expected-downstream-base-sha", head);
  }
  if (output) runtimeArgs.push("--output", output);
  if (args.includes("--json")) runtimeArgs.push("--json");
  runRuntime(runtimeArgs);
}

function applyCapture(args) {
  const capturePath = path.resolve(repoRoot, String(args[0] || ""));
  const workPath = path.resolve(repoRoot, String(args[1] || ""));
  if (!fs.existsSync(capturePath) || !fs.existsSync(workPath)) {
    throw new Error("apply requires <capture.json> <claimed-work.json>");
  }
  const capture = readJson(capturePath);
  const workStatus = JSON.parse(
    runRuntime(
      ["release-propagation", "work", "status", "--work", workPath, "--json"],
      { capture: true },
    ),
  );
  const plan = capture.plan;
  const capturedWork = capture.work;
  const work = workStatus.work;
  if (
    plan?.contract !== "kungfu-buildchain-manual-upstream-pickup-plan" ||
    plan.status !== "update-available" ||
    !plan.propagationPlan
  ) {
    throw new Error("capture is not an update-available manual pickup plan");
  }
  if (
    capturedWork?.contract !== "kungfu-buildchain-release-propagation-work" ||
    capturedWork.state?.lifecycle !== "paused" ||
    capturedWork.state?.nextAction?.action !== "claim" ||
    work.workId !== capturedWork.workId ||
    work.revision !== capturedWork.revision + 1 ||
    work.previousWorkRoot !== capturedWork.contentRoot ||
    work.propagationKey !== capturedWork.propagationKey ||
    work.upstream?.releaseRoot !== capturedWork.upstream?.releaseRoot ||
    work.downstream?.expectedBaseSha !== capturedWork.downstream?.expectedBaseSha ||
    work.downstream?.lockSha256 !== capturedWork.downstream?.lockSha256
  ) {
    throw new Error("claimed Work is not the exact successor of the pickup capture");
  }
  if (
    workStatus.lifecycle !== "ready" ||
    workStatus.currentStage !== "materialize" ||
    workStatus.nextAction?.action !== "record" ||
    work.authority?.mode !== "execute" ||
    work.intent?.publishToProduction !== true ||
    work.workControl?.familyState?.schema !==
      "kungfu.work-control.initiative-family-state/v2" ||
    work.authority?.executionWarrant?.kind !== "execution-warrant" ||
    work.authority.executionWarrant.status !== "active"
  ) {
    throw new Error("manual pickup Work must be claimed and ready at materialize");
  }
  const { packageJson } = normalizedConfig();
  const source = plan.source;
  if (
    work.upstream?.release?.package?.name !== source.package ||
    work.upstream.release.package.version !== plan.resolvedVersion ||
    work.downstream?.lockPath !== plan.propagationPlan.targets?.[0]?.lockPath
  ) {
    throw new Error("claimed Work disagrees with the exact pickup capture");
  }
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  if (head !== work.downstream.expectedBaseSha) {
    throw new Error("downstream HEAD moved after pickup capture");
  }
  if (packageJson.dependencies?.[source.package] !== plan.currentVersion) {
    throw new Error("current dependency moved after pickup capture");
  }
  execFileSync("pnpm", ["add", "--save-exact", `${source.package}@${plan.resolvedVersion}`], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  runRuntime([
    "release-propagation",
    "write-lock",
    "--plan",
    JSON.stringify(plan.propagationPlan),
    "--cwd",
    repoRoot,
    "--json",
  ]);
}

function checkContract() {
  const { config, packageJson } = normalizedConfig();
  if (
    config.schemaVersion !== 1 ||
    config.contract !== "kungfu-buildchain-manual-upstream-pickup" ||
    config.downstream?.repository !== "kungfu-systems/site-libkungfu-dev"
  ) {
    throw new Error("manual code-upstream config contract mismatch");
  }
  const expected = new Map([
    ["buildchain", "@kungfu-tech/buildchain"],
    ["kungfu-core", "@kungfu-tech/site"],
  ]);
  const lockPaths = new Set();
  for (const source of config.sources || []) {
    if (expected.get(source.id) !== source.package) {
      throw new Error(`manual code-upstream identity mismatch: ${source.id}`);
    }
    if (!/^buildchain\.upstreams\/[a-z0-9-]+\.release\.json$/.test(source.lockPath)) {
      throw new Error(`manual code-upstream lock path is not source-owned: ${source.id}`);
    }
    if (lockPaths.has(source.lockPath)) {
      throw new Error("manual code upstreams must not share a release lock");
    }
    lockPaths.add(source.lockPath);
    selectedSource(source.id, "alpha");
    selectedSource(source.id, "release");
  }
  if (expected.size !== config.sources.length) {
    throw new Error("manual code-upstream source set must contain Buildchain and Kungfu Core only");
  }
  const workflowDir = path.join(repoRoot, ".github", "workflows");
  for (const name of fs.readdirSync(workflowDir)) {
    const body = fs.readFileSync(path.join(workflowDir, name), "utf8");
    if (/manual-code-upstreams|release-propagation\s+pickup|upstream:pickup/.test(body)) {
      throw new Error(`manual code-upstream pickup must not be workflow-triggered: ${name}`);
    }
  }
  if (packageJson.scripts?.["upstream:pickup"] !== "node scripts/code-upstream-pickup.cjs") {
    throw new Error("package.json must expose the agent pickup entrypoint");
  }
  process.stdout.write("manual code-upstream pickup contract passed\n");
}

function usage() {
  process.stdout.write(`Usage:\n  pnpm run upstream:pickup -- plan <buildchain|kungfu-core> <alpha|release> [--json]\n  pnpm run upstream:pickup -- create <buildchain|kungfu-core> <alpha|release> --output <capture.json> [--json]\n  pnpm run upstream:pickup -- apply <capture.json> <claimed-work.json>\n  pnpm run upstream:pickup -- check\n`);
}

try {
  const argv = process.argv.slice(2);
  if (argv[0] === "--") argv.shift();
  const [command = "", ...args] = argv;
  if (!command || command === "--help" || command === "-h") usage();
  else if (command === "plan" || command === "create") planOrCreate(command, args);
  else if (command === "apply") applyCapture(args);
  else if (command === "check") checkContract();
  else throw new Error(`unsupported manual code-upstream command: ${command}`);
} catch (error) {
  process.stderr.write(`code-upstream-pickup: ${error.message}\n`);
  process.exit(1);
}
