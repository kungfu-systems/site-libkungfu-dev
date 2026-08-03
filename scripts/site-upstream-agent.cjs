#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, ".buildchain", "manual-code-upstreams.json");
const packagePath = path.join(repoRoot, "package.json");
const runtimeAlias = "@kungfu-tech/buildchain-runtime";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function flagValue(args, name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? "" : String(args[index + 1] || "").trim();
}

function runtimeBin() {
  const packageJson = require.resolve(`${runtimeAlias}/package.json`, { paths: [repoRoot] });
  return path.join(path.dirname(packageJson), "bin", "buildchain.mjs");
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

function runPickup(args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, "code-upstream-pickup.cjs"), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function sourceFromIntent(value) {
  const input = String(value || "").trim().toLowerCase();
  const matches = [];
  if (/(?:^|\b)papers?(?:\b|$)|论文/.test(input)) matches.push("paper");
  if (/(?:^|\b)kfd(?:\b|$)/.test(input)) matches.push("kfd");
  if (/(?:^|\b)buildchain(?:\b|$)|构建链/.test(input)) matches.push("buildchain");
  if (/(?:^|\b)kungfu(?:[ -]?core)?(?:\b|$)|功夫核心|kungfu 核心/.test(input)) {
    matches.push("kungfu-core");
  }
  const unique = [...new Set(matches)];
  if (unique.length !== 1) {
    throw new Error("intent must identify exactly one of paper, kfd, buildchain, or kungfu-core");
  }
  return unique[0];
}

function entryPlan(sourceInput, channel, handoffWork) {
  const sourceId = sourceFromIntent(sourceInput);
  const args = ["release-propagation", "entry", "plan", "--source-id", sourceId, "--json"];
  if (channel) args.push("--channel", channel);
  if (handoffWork) args.push("--handoff-work", path.resolve(repoRoot, handoffWork));
  return JSON.parse(runRuntime(args, { capture: true }));
}

function manualPickupPlan(entry, channel) {
  const config = readJson(configPath);
  const packageJson = readJson(packagePath);
  const source = config.sources.find((item) => item.id === entry.sourceId);
  if (!source) throw new Error(`manual pickup config is missing ${entry.sourceId}`);
  const currentVersion = packageJson.dependencies?.[source.package];
  if (!currentVersion) throw new Error(`package.json is missing ${source.package}`);
  return JSON.parse(
    runRuntime(
      [
        "release-propagation",
        "pickup",
        "plan",
        "--config",
        configPath,
        "--source-id",
        entry.sourceId,
        "--channel",
        channel || entry.channel,
        "--current-version",
        currentVersion,
        "--json",
      ],
      { capture: true },
    ),
  );
}

function plan(args) {
  const sourceInput = String(args[0] || "");
  const channel = String(args[1] || "").startsWith("--") ? "" : String(args[1] || "");
  const handoffWork = flagValue(args, "handoff-work");
  const entry = entryPlan(sourceInput, channel, handoffWork);
  let exactRelease = entry.exactRelease;
  let status = entry.status;
  let nextAction = entry.nextAction;
  let pickup = null;
  if (entry.policy.mode === "downstream-manual") {
    pickup = manualPickupPlan(entry, channel || entry.channel);
    exactRelease = pickup.upstreamRelease;
    status = pickup.status;
    nextAction =
      status === "current"
        ? { action: "none", command: "" }
        : {
            action: "create-work",
            command: `pnpm run site:update -- create ${entry.sourceId} ${pickup.source.channel} --output <capture.json> --json`,
          };
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        contract: "libkungfu-dev-site-upstream-agent-plan",
        entry,
        pickup,
        status,
        exactRelease,
        work: entry.work,
        nextAction,
      },
      null,
      2,
    )}\n`,
  );
}

function check() {
  const expected = [
    ["update the latest paper", "paper", "automatic-release-handoff"],
    ["更新 KFD 内容", "kfd", "automatic-release-handoff"],
    ["update the latest Buildchain content", "buildchain", "downstream-manual"],
    ["升级 Kungfu Core", "kungfu-core", "downstream-manual"],
  ];
  for (const [intent, sourceId, mode] of expected) {
    const entry = entryPlan(intent, sourceId === "buildchain" || sourceId === "kungfu-core" ? "alpha" : "", "");
    if (
      entry.contract !== "kungfu-buildchain-site-upstream-agent-entry" ||
      entry.sourceId !== sourceId ||
      entry.policy?.mode !== mode
    ) {
      throw new Error(`released runtime routing mismatch for ${sourceId}`);
    }
  }
  const matrix = JSON.parse(
    runRuntime(["release-propagation", "entry", "fault-matrix", "--json"], { capture: true }),
  );
  if (
    matrix.contract !== "kungfu-buildchain-release-propagation-failure-matrix" ||
    matrix.rows?.length !== 11
  ) {
    throw new Error("released runtime fault matrix mismatch");
  }
  const packageJson = readJson(packagePath);
  const config = readJson(configPath);
  const expectedRuntime = `npm:${config.runtime.package}@${config.runtime.version}`;
  if (
    packageJson.scripts?.["site:update"] !== "node scripts/site-upstream-agent.cjs" ||
    packageJson.devDependencies?.[runtimeAlias] !== expectedRuntime
  ) {
    throw new Error("Site unified entry is not bound to the declared released runtime");
  }
  process.stdout.write("site upstream agent entry contract passed\n");
}

function usage() {
  process.stdout.write(`Usage:
  pnpm run site:update -- plan <intent> [alpha|release] [--handoff-work <work.json>] --json
  pnpm run site:update -- create <buildchain|kungfu-core> <alpha|release> --output <capture.json> --json
  pnpm run site:update -- apply <capture.json> <claimed-work.json>
  pnpm run site:update -- work <status|claim|record|repair|complete|push-plan|push-branch> ...
  pnpm run site:update -- fault-matrix --json
  pnpm run site:update -- check
`);
}

try {
  const argv = process.argv.slice(2);
  if (argv[0] === "--") argv.shift();
  const [command = "", ...args] = argv;
  if (!command || command === "--help" || command === "-h") usage();
  else if (command === "plan") plan(args);
  else if (command === "create") {
    const entry = entryPlan(args[0], args[1], "");
    if (entry.policy.mode !== "downstream-manual") {
      throw new Error("automatic Paper/KFD updates must consume their exact release-owned Work handoff");
    }
    runPickup(["create", entry.sourceId, ...args.slice(1)]);
  } else if (command === "apply") runPickup(["apply", ...args]);
  else if (command === "work") runRuntime(["release-propagation", "work", ...args]);
  else if (command === "fault-matrix") {
    runRuntime(["release-propagation", "entry", "fault-matrix", ...args]);
  } else if (command === "check") check();
  else throw new Error(`unsupported Site update command: ${command}`);
} catch (error) {
  process.stderr.write(`site-upstream-agent: ${error.message}\n`);
  process.exit(1);
}
