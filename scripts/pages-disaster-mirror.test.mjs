import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildchainArtifactHash, prepareMirror, verifyMirrorBase } from "./pages-disaster-mirror.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pages-disaster-mirror-"));
  const artifactRoot = path.join(root, "artifact");
  const outputRoot = path.join(root, "output");
  for (const route of ["", "kfx", "core", "buildchain", "kfd", "papers", "skills"]) {
    const directory = path.join(artifactRoot, route);
    fs.mkdirSync(directory, { recursive: true });
    const host = route && route !== "skills" ? `${route}.libkungfu.dev` : "libkungfu.dev";
    fs.writeFileSync(path.join(directory, "index.html"), `<!doctype html><html><head><link rel="canonical" href="https://${host}/"><meta name="robots" content="index"><title>${route || "home"}</title></head><body><a href="https://core.libkungfu.dev/runtime/">Core</a></body></html>`);
  }
  const artifactHash = buildchainArtifactHash(artifactRoot).hash;
  const passport = {
    schemaVersion: 1,
    contract: "kungfu-buildchain-web-surface-release-passport",
    product: { repository: "kungfu-systems/site-libkungfu-dev" },
    release: { channel: "production", status: "applied", sourceSha: "a".repeat(40), artifactHash },
    workflow: { runId: "123", applyOutcome: "success", jobStatus: "success" },
    evidence: {
      applyResultBound: true,
      productionPreflight: { channel: "production", status: "passed", sourceSha: "a".repeat(40), artifactHash },
      healthCheck: { status: "passed", sourceSha: "a".repeat(40), artifactHash },
    },
  };
  const passportPath = path.join(root, "passport.json");
  fs.writeFileSync(passportPath, JSON.stringify(passport));
  const options = {
    artifactRoot,
    outputRoot,
    passportPath,
    repository: "kungfu-systems/site-libkungfu-dev",
    sourceRunId: "123",
    sourceRunEvent: "push",
    sourceRunHeadBranch: "main",
    sourceRunConclusion: "success",
    sourceSha: "a".repeat(40),
    artifactDigest: `sha256:${"b".repeat(64)}`,
    passportDigest: `sha256:${"c".repeat(64)}`,
    productionDeploymentId: "456",
    productionDeploymentStatus: "success",
    mirrorHost: "mirror.libkungfu.dev",
    primaryHost: "libkungfu.dev",
  };
  return { root, artifactRoot, outputRoot, passportPath, options };
}

function referenceBuildchainArtifactHash(root, relativePaths, prefix = "dist") {
  const inventory = relativePaths.map((relative) => path.join(root, relative)).sort().map((file) => {
    const bytes = fs.readFileSync(file);
    return {
      path: `${prefix}/${path.relative(root, file).split(path.sep).join("/")}`,
      size: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
  });
  const value = crypto.createHash("sha256");
  for (const file of inventory) value.update(`${file.path}\0${file.size}\0${file.sha256}\n`);
  return { hash: value.digest("hex"), inventory };
}

test("matches Buildchain full-path ordering for mixed-case and dotted routes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pages-disaster-mirror-order-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const relativePaths = [
    ".well-known/kungfu/release.json",
    ".well-known/kungfu-release-status.json",
    "README.md",
    "buildchain/index.html",
    "index.html",
  ];
  for (const [index, relative] of relativePaths.entries()) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `fixture-${index}\n`);
  }
  const expected = referenceBuildchainArtifactHash(root, relativePaths);
  const actual = buildchainArtifactHash(root);
  assert.equal(actual.hash, expected.hash);
  assert.deepEqual(actual.files, expected.inventory);
  assert.deepEqual(actual.files.map((file) => file.path), [
    "dist/.well-known/kungfu-release-status.json",
    "dist/.well-known/kungfu/release.json",
    "dist/README.md",
    "dist/buildchain/index.html",
    "dist/index.html",
  ]);
});

test("uploads hidden mirror status and machine entrypoints to Pages", () => {
  const workflow = fs.readFileSync(path.join(process.cwd(), ".github/workflows/pages-disaster-mirror.yml"), "utf8");
  assert.match(workflow, /uses: actions\/upload-pages-artifact@[^\n]+\n\s+with:\n\s+path: \.mirror\/output\n\s+include-hidden-files: true/);
});

function serverFor(root) {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) {
      response.writeHead(404).end("missing");
      return;
    }
    response.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html" : "application/octet-stream" });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

test("prepares and verifies a non-canonical mirror from exact production evidence", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const result = prepareMirror(value.options);
  assert.equal(result.status.source.sha, "a".repeat(40));
  const core = fs.readFileSync(path.join(value.outputRoot, "core/index.html"), "utf8");
  assert.match(core, /noindex/);
  assert.match(core, /data-kungfu-disaster-mirror="true"/);
  assert.match(core, /href="\/core\/runtime\/"/);
  assert.match(core, /rel="canonical" href="https:\/\/core\.libkungfu\.dev\/"/);
  const server = await serverFor(value.outputRoot);
  t.after(() => server.close());
  const address = server.address();
  const verified = await verifyMirrorBase(`http://127.0.0.1:${address.port}`, { expectedMirrorHost: "mirror.libkungfu.dev", routes: ["/", "/core/", "/incident/"] });
  assert.equal(verified.status, "verified");
});

test("rejects ordinary main, staging-like, and mismatched production inputs", (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  assert.throws(() => prepareMirror({ ...value.options, sourceRunEvent: "pull_request" }), /successful Buildchain push run on main/);
  assert.throws(() => prepareMirror({ ...value.options, productionDeploymentStatus: "in_progress" }), /successful production deployment/);
  assert.throws(() => prepareMirror({ ...value.options, sourceSha: "d".repeat(40) }), /passport source SHA mismatch/);
  fs.appendFileSync(path.join(value.artifactRoot, "index.html"), "mutation");
  assert.throws(() => prepareMirror(value.options), /artifactHash mismatch/);
});

test("rejects live status, canonical, and banner mutations", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  prepareMirror(value.options);
  const server = await serverFor(value.outputRoot);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  fs.appendFileSync(path.join(value.outputRoot, ".well-known/kungfu-mirror-status.json"), " ");
  const verify = () => verifyMirrorBase(base, { expectedMirrorHost: "mirror.libkungfu.dev", routes: ["/"] });
  await assert.rejects(verify, /status digest mismatch/);
  fs.rmSync(value.outputRoot, { recursive: true, force: true });
  prepareMirror(value.options);
  const index = path.join(value.outputRoot, "index.html");
  fs.writeFileSync(index, fs.readFileSync(index, "utf8").replace("https://libkungfu.dev/", "https://mirror.libkungfu.dev/"));
  await assert.rejects(verify, /canonical boundary mismatch/);
  fs.rmSync(value.outputRoot, { recursive: true, force: true });
  prepareMirror(value.options);
  fs.writeFileSync(index, fs.readFileSync(index, "utf8").replace("data-kungfu-disaster-mirror=\"true\"", ""));
  await assert.rejects(verify, /missing the disaster-mirror banner/);
});
