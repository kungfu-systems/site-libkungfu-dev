#!/usr/bin/env node
import fs from "node:fs";

const outputs = JSON.parse(fs.readFileSync("infra/outputs.json", "utf8"));
const buildchainToml = fs.readFileSync("buildchain.toml", "utf8");
const workflow = fs.readFileSync(".github/workflows/buildchain-web-surface.yml", "utf8");
const expectedBuildchainRef = "v2.4";
const expectedBuildchainShell = `kungfu-systems/buildchain/.github/workflows/.web-surface.yml@${expectedBuildchainRef}`;

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
if (
  !workflow.includes(expectedBuildchainShell) &&
  !workflow.includes(`buildchain-ref: ${expectedBuildchainRef}`)
) {
  throw new Error(`Buildchain web-surface workflow must run ${expectedBuildchainRef}`);
}
for (const applySwitch of ["preview-apply", "preview-cleanup-apply", "staging-apply", "production-apply"]) {
  if (!workflow.includes(`${applySwitch}: false`)) {
    throw new Error(`Buildchain web-surface workflow must keep ${applySwitch} false by default`);
  }
}

const config = parseTomlSections(buildchainToml);
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
