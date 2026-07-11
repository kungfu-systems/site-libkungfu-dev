#!/usr/bin/env node
import fs from "node:fs";

const outputs = JSON.parse(fs.readFileSync("infra/outputs.json", "utf8"));
const buildchainToml = fs.readFileSync(".buildchain/buildchain.toml", "utf8");
const workflow = fs.readFileSync(".github/workflows/buildchain-web-surface.yml", "utf8");
const expectedBuildchainShellRef = "v2";
const expectedBuildchainShell = `kungfu-systems/buildchain/.github/workflows/.web-surface.yml@${expectedBuildchainShellRef}`;
const requiredSurfaces = {
  hub: "https://libkungfu.dev",
  core: "https://core.libkungfu.dev",
  buildchain: "https://buildchain.libkungfu.dev",
  kfd: "https://kfd.libkungfu.dev",
  papers: "https://papers.libkungfu.dev",
};

function parseTomlSections(text) {
  const sections = {};
  let current = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      current = section[1];
      sections[current] = sections[current] || {};
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"(.*)"$/);
    if (pair && current) sections[current][pair[1]] = pair[2];
  }
  return sections;
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

if (outputs.contract !== "kungfu-site-infra-outputs") {
  throw new Error("infra outputs contract mismatch");
}
if (outputs.site !== "site-libkungfu-dev") {
  throw new Error("infra outputs site mismatch");
}
if (!workflow.includes(`uses: ${expectedBuildchainShell}`)) {
  throw new Error(`Buildchain web-surface workflow must use stable ${expectedBuildchainShellRef} shell`);
}
for (const [channel, lockPath, expectedRef] of [
  ["stable", ".buildchain/contract-lock.json", "v2"],
  ["alpha", ".buildchain/alpha-contract-lock.json", "v2-alpha"],
]) {
  if (!fs.existsSync(lockPath)) throw new Error(`missing Buildchain ${channel} contract lock: ${lockPath}`);
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  if (
    lock.contract !== "kungfu-buildchain-contract-lock" ||
    lock.buildchain?.ref !== expectedRef ||
    lock.buildchain?.majorLine !== "v2" ||
    lock.buildchain?.compatibilityPolicy !== "major-compatible" ||
    !lock.buildchain?.resolvedSha ||
    !lock.buildchain?.contractDigest ||
    !lock.buildchain?.compatibilityDigest
  ) {
    throw new Error(`Buildchain ${channel} contract lock must accept floating ${expectedRef}`);
  }
}
for (const snippet of [
  "contents: write",
  "issues: write",
  "buildchain-contract-lock-path: ${{",
  ".buildchain/alpha-contract-lock.json",
  ".buildchain/contract-lock.json",
  "buildchain-contract-compatibility-policy: major-compatible",
  "buildchain-contract-drift-issue-mode: compatible-and-breaking",
]) {
  if (!workflow.includes(snippet)) {
    throw new Error(`Buildchain web-surface workflow must set ${snippet}`);
  }
}
const expectedApplySwitches = {
  "preview-apply": true,
  "preview-cleanup-apply": true,
  "staging-apply": true,
  "production-apply": outputs.channels?.production?.status === "active",
  "production-release-on-main": outputs.channels?.production?.status === "active",
};
for (const [applySwitch, expectedEnabled] of Object.entries(expectedApplySwitches)) {
  if (!workflow.includes(`${applySwitch}: ${expectedEnabled}`)) {
    throw new Error(`Buildchain web-surface workflow must set ${applySwitch}: ${expectedEnabled}`);
  }
}
const releaseGateSnippets = {
  "production-release-label": "buildchain-release",
  "production-release-head-prefix": "release/",
};
for (const [key, expected] of Object.entries(releaseGateSnippets)) {
  if (!workflow.includes(`${key}: ${expected}`)) {
    throw new Error(`Buildchain web-surface workflow must set ${key}: ${expected}`);
  }
}

const config = parseTomlSections(buildchainToml);
for (const channel of ["preview", "staging"]) {
  const channelConfig = config[`channels.${channel}`];
  if (!channelConfig) throw new Error(`missing buildchain channels.${channel}`);
  expectEqual(channelConfig.access_control, "managed-network", `${channel} access control`);
  expectEqual(channelConfig.edge_auth, "none", `${channel} edge auth`);
}
for (const [surface, expectedUrl] of Object.entries(requiredSurfaces)) {
  if (outputs.surfaces?.[surface] !== expectedUrl) {
    throw new Error(`infra outputs surface ${surface} must be ${expectedUrl}`);
  }
  const surfaceConfig = config[`surfaces.${surface}`];
  if (!surfaceConfig) throw new Error(`missing buildchain surface ${surface}`);
  expectEqual(surfaceConfig.production_url, expectedUrl, `${surface} production URL`);
}
for (const channel of ["preview", "staging", "production"]) {
  const deploy = config[`deploy.${channel}`];
  const expected = outputs.channels[channel];
  if (!deploy) throw new Error(`missing buildchain deploy.${channel}`);
  expectEqual(deploy.bucket, expected.bucket, `${channel} bucket`);
  expectEqual(
    deploy.cloudfront_distribution,
    expected.cloudfrontDistribution,
    `${channel} CloudFront distribution`,
  );
  if (expected.roleArn && !workflow.includes(expected.roleArn)) {
    throw new Error(`${channel} workflow role ARN is not wired to infra outputs`);
  }
}

console.log("infra outputs checks passed");
