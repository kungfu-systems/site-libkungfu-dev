import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { renderInstaller, validateCatalog, writeInstallerPublication } from "./render-installer.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

async function runStreamed(command, args, input, options = {}) {
  const child = spawn(command, args, { ...options, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let writeError = null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.on("error", () => {});
  const closed = new Promise((resolve) => child.once("close", (status, signal) => resolve({ status, signal })));
  try {
    for (let offset = 0; offset < input.length; offset += 128) {
      const chunk = input.subarray(offset, Math.min(offset + 128, input.length));
      await new Promise((resolve, reject) => {
        child.stdin.write(chunk, (error) => error ? reject(error) : resolve());
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    child.stdin.end();
  } catch (error) {
    writeError = error;
  }
  const result = await closed;
  return { ...result, stdout, stderr, writeError };
}

function writeExecutable(file, body) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function createArchive(root, name, binaryPath, body) {
  const source = path.join(root, `${name}-source`);
  const binary = path.join(source, binaryPath);
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  writeExecutable(binary, body);
  const archive = path.join(root, name);
  const top = binaryPath.split("/")[0];
  const result = run("tar", ["-czf", archive, "-C", source, top]);
  assert.equal(result.status, 0, result.stderr);
  return { archive, binarySha256: sha256(fs.readFileSync(binary)) };
}

function unsafeArchiveBytes() {
  const body = Buffer.from("escape\n");
  const header = Buffer.alloc(512);
  const write = (value, start, length) => header.write(value, start, Math.min(length, Buffer.byteLength(value)), "ascii");
  const octal = (value, length) => value.toString(8).padStart(length - 1, "0") + "\0";
  write("../escape", 0, 100);
  write(octal(0o755, 8), 100, 8);
  write(octal(0, 8), 108, 8);
  write(octal(0, 8), 116, 8);
  write(octal(body.length, 12), 124, 12);
  write(octal(0, 12), 136, 12);
  header.fill(0x20, 148, 156);
  write("0", 156, 1);
  write("ustar\0", 257, 6);
  write("00", 263, 2);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return gzipSync(Buffer.concat([header, body, padding, Buffer.alloc(1024)]));
}

function asset(root, name, kind = "artifact") {
  const bytes = fs.readFileSync(path.join(root, name));
  return {
    name,
    url: `https://fixtures.invalid/${name}`,
    size: bytes.length,
    sha256: sha256(bytes),
    kind,
  };
}

function targetId() {
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const architecture = process.arch === "arm64" ? "arm64" : "x64";
  return `${platform}-${architecture}`;
}

function createFixture(root) {
  const shell = (name, version) => `#!/bin/sh\nprintf '%s\\n' '${name} ${version}'\n`;
  const kfd1 = createArchive(root, "kfd-v1.tar.gz", "kfd-v1/kfd", shell("kfd", "1.0.0"));
  const kfd2 = createArchive(root, "kfd-v2.tar.gz", "kfd-v2/kfd", shell("kfd", "2.0.0"));
  const buildchain = createArchive(root, "buildchain.tar.gz", "buildchain", shell("buildchain", "4.0.0"));
  writeExecutable(path.join(root, "agent-hub-demo"), shell("agent-hub-demo", "0.2.0"));
  fs.writeFileSync(path.join(root, "windows-fixture.exe"), "windows fixture\n");
  fs.writeFileSync(path.join(root, "kungfu-install.ps1"), "param()\n");
  writeExecutable(path.join(root, "kungfu-install.sh"), `#!/bin/sh
set -eu
version=
install_dir=
bin_dir=
dry_run=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) version=$2; shift 2 ;;
    --install-dir) install_dir=$2; shift 2 ;;
    --bin-dir) bin_dir=$2; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    *) shift ;;
  esac
done
[ "$dry_run" -eq 0 ] || exit 0
[ "\${FIXTURE_DELEGATE_FAIL:-0}" -eq 0 ] || exit 42
root="$install_dir/versions/$version-fixture"
mkdir -p "$root/install" "$bin_dir"
printf '%s\\n' '#!/bin/sh' "printf '%s\\n' 'kungfu $version'" > "$root/install/launcher"
chmod 755 "$root/install/launcher"
ln -s "$root/install/launcher" "$bin_dir/.kungfu.fixture.$$"
mv -f "$bin_dir/.kungfu.fixture.$$" "$bin_dir/kungfu"
`);
  for (const name of ["kfd-v1.provenance.json", "kfd-v2.provenance.json", "buildchain.provenance.json", "agent-hub-demo.provenance.json", "kungfu.provenance.json"]) {
    fs.writeFileSync(path.join(root, name), `${JSON.stringify({ contract: "fixture-provenance", name })}\n`);
  }

  const platform = targetId();
  const makeTarget = ({ artifactName, binaryPath, binarySha256, provenanceName, kind = "archive" }) => ({
    platform,
    kind,
    ...(kind === "archive" ? { archiveType: "tar.gz" } : {}),
    binaryPath,
    binarySha256,
    artifact: asset(root, artifactName),
    provenance: { ...asset(root, provenanceName, "fixture-provenance"), name: undefined },
  });
  const windowsTarget = (commandName, provenanceName) => ({
    platform: "windows-x64",
    kind: "binary",
    binaryPath: `${commandName}.exe`,
    binarySha256: sha256(fs.readFileSync(path.join(root, "windows-fixture.exe"))),
    artifact: asset(root, "windows-fixture.exe"),
    provenance: { ...asset(root, provenanceName, "fixture-provenance"), name: undefined },
  });
  const sourceSha = "0123456789abcdef0123456789abcdef01234567";
  const version = (value, targets) => ({ version: value, tag: `v${value}`, publishedAt: "2026-08-14T00:00:00Z", sourceSha, targets });
  const catalog = {
    schemaVersion: 1,
    contract: "libkungfu.multi-product-installer-catalog/v1",
    catalogVersion: "test",
    scope: "multi-platform-native-installers",
    authorityBoundary: "Fixture upstream assets remain authoritative.",
    refresh: {
      mode: "explicit-exact-release",
      command: "pnpm run installer:refresh -- product@version --write",
      source: "github-release",
      movingSelectorsAllowed: false,
      retention: "append-only-versions",
    },
    homebrew: {
      repository: "https://github.com/kungfu-systems/homebrew-tap",
      products: ["kfd", "buildchain", "kungfu"].map((id) => ({
        id,
        command: `brew install kungfu-systems/tap/${id}`,
      })),
      authorityBoundary: "Fixture Homebrew ownership remains separate from the versioned installer.",
    },
    products: [
      {
        id: "kfd",
        command: "kfd",
        repository: "https://github.com/kungfu-systems/kfd",
        defaultVersion: "1.0.0",
        versions: [
          version("1.0.0", [makeTarget({ artifactName: "kfd-v1.tar.gz", binaryPath: "kfd-v1/kfd", binarySha256: kfd1.binarySha256, provenanceName: "kfd-v1.provenance.json" }), windowsTarget("kfd", "kfd-v1.provenance.json")]),
          version("2.0.0", [makeTarget({ artifactName: "kfd-v2.tar.gz", binaryPath: "kfd-v2/kfd", binarySha256: kfd2.binarySha256, provenanceName: "kfd-v2.provenance.json" }), windowsTarget("kfd", "kfd-v2.provenance.json")]),
        ],
      },
      {
        id: "buildchain",
        command: "buildchain",
        repository: "https://github.com/kungfu-systems/buildchain",
        defaultVersion: "4.0.0",
        versions: [version("4.0.0", [makeTarget({ artifactName: "buildchain.tar.gz", binaryPath: "buildchain", binarySha256: buildchain.binarySha256, provenanceName: "buildchain.provenance.json" }), windowsTarget("buildchain", "buildchain.provenance.json")])],
      },
      {
        id: "kungfu",
        command: "kungfu",
        repository: "https://github.com/kungfu-systems/kungfu",
        defaultVersion: "4.0.0-alpha.1",
        versions: [version("4.0.0-alpha.1", [
          {
            platform,
            kind: "delegated-installer",
            artifact: asset(root, "kungfu-install.sh"),
            provenance: { ...asset(root, "kungfu.provenance.json", "fixture-provenance"), name: undefined },
            delegate: { ...asset(root, "kungfu-install.sh"), name: undefined },
          },
          {
            platform: "windows-x64",
            kind: "delegated-installer",
            artifact: asset(root, "windows-fixture.exe"),
            provenance: { ...asset(root, "kungfu.provenance.json", "fixture-provenance"), name: undefined },
            delegate: { ...asset(root, "kungfu-install.ps1"), name: undefined },
          },
        ])],
      },
      {
        id: "agent-hub-demo",
        command: "agent-hub-demo",
        repository: "https://github.com/kungfu-systems/agent-hub-demo",
        defaultVersion: "0.2.0",
        versions: [version("0.2.0", [makeTarget({ artifactName: "agent-hub-demo", binaryPath: "agent-hub-demo", binarySha256: sha256(fs.readFileSync(path.join(root, "agent-hub-demo"))), provenanceName: "agent-hub-demo.provenance.json", kind: "binary" }), windowsTarget("agent-hub-demo", "agent-hub-demo.provenance.json")])],
      },
    ],
  };
  const catalogBytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`);
  const template = fs.readFileSync(path.join(repoRoot, "src", "installers", "install.sh.in"), "utf8");
  const powershellTemplate = fs.readFileSync(path.join(repoRoot, "src", "installers", "install.ps1.in"), "utf8");
  assert.match(template, /repair_kungfu_delegate_schema_compat/);
  assert.match(template, /artifact\["properties"\]\["name"\]/);
  assert.doesNotMatch(powershellTemplate, /IsPathFullyQualified/);
  assert.match(powershellTemplate, /IsPathRooted/);
  assert.match(powershellTemplate, /Security\.Cryptography\.SHA256/);
  assert.match(powershellTemplate, /Get-KungfuCompatSha256/);
  assert.match(powershellTemplate, /outside \$\{Launcher\}:/);
  assert.match(powershellTemplate, /kungfu-upgrade\.contract\.json/);
  assert.match(powershellTemplate, /WriteAllBytes\(\$ContractFile, \$ContractBytes\)/);
  assert.match(powershellTemplate, /WriteAllBytes\(\$ProductFile, \$ProductBytes\)/);
  const rendered = renderInstaller({ catalog, catalogBytes, template, powershellTemplate });
  const catalogFile = path.join(root, "catalog.json");
  const installerFile = path.join(root, "install.sh");
  fs.writeFileSync(catalogFile, catalogBytes);
  fs.writeFileSync(installerFile, rendered.installerBytes);

  const fakeBin = path.join(root, "fake-bin");
  fs.mkdirSync(fakeBin);
  writeExecutable(path.join(fakeBin, "curl"), `#!/bin/sh
set -eu
output=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output=$2; shift 2 ;;
    --proto) shift 2 ;;
    --fail|--silent|--show-error|--location|--tlsv1.2) shift ;;
    *) url=$1; shift ;;
  esac
done
case "$url" in
  */install/v1/catalog/*) source="$FIXTURE_ROOT/catalog.json" ;;
  *) source="$FIXTURE_ROOT/$(basename "$url")" ;;
esac
case "\${FIXTURE_PARTIAL_PATTERN:-}" in
  '') ;;
  *) case "$url" in *"$FIXTURE_PARTIAL_PATTERN"*) head -c 3 "$source" > "$output"; exit 0 ;; esac ;;
esac
cp "$source" "$output"
case "\${FIXTURE_CORRUPT_PATTERN:-}" in
  '') ;;
  *) case "$url" in *"$FIXTURE_CORRUPT_PATTERN"*) printf 'X' | dd of="$output" bs=1 seek=0 conv=notrunc 2>/dev/null ;; esac ;;
esac
`);
  return { catalog, catalogBytes, catalogFile, fakeBin, installerFile };
}

function fixtureEnv(root, fakeBin, extra = {}) {
  return {
    ...process.env,
    HOME: path.join(root, "home"),
    FIXTURE_ROOT: root,
    PATH: `${fakeBin}:/usr/bin:/bin`,
    ...extra,
  };
}

test("actual publication is content-addressed and shell-valid", () => {
  const rendered = writeInstallerPublication({ root: repoRoot });
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "dist", "install", "v1", "manifest.json"), "utf8"));
  assert.equal(manifest.catalog.sha256, rendered.catalogSha256);
  assert.equal(manifest.installer.sha256, rendered.installerSha256);
  assert.equal(manifest.installers.powershell.sha256, rendered.powershellInstallerSha256);
  assert.ok(fs.existsSync(path.join(repoRoot, "dist", new URL(manifest.catalog.immutableUrl).pathname)));
  assert.ok(fs.existsSync(path.join(repoRoot, "dist", new URL(manifest.installer.immutableUrl).pathname)));
  assert.ok(fs.existsSync(path.join(repoRoot, "dist", new URL(manifest.installers.powershell.immutableUrl).pathname)));
  const syntax = run("sh", ["-n", path.join(repoRoot, "dist", "install.sh")]);
  assert.equal(syntax.status, 0, syntax.stderr);
  const relative = run("sh", [path.join(repoRoot, "dist", "install.sh"), "kfd", "--dry-run", "--install-dir", "relative"]);
  assert.notEqual(relative.status, 0);
  assert.match(relative.stderr, /path-invalid/);
});

test("streamed no-argument execution defaults to Kungfu without breaking its producer", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "libkungfu-installer-stream-test-"));
  const fixture = createFixture(root);
  const installer = fs.readFileSync(fixture.installerFile);
  const result = await runStreamed("sh", ["-s", "--"], installer, {
    env: fixtureEnv(root, fixture.fakeBin),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.writeError, null, result.writeError?.message);
  assert.match(result.stderr, /installed: kungfu/);
  assert.ok(fs.existsSync(path.join(root, "home", ".local", "bin", "kungfu")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("unsupported Linux libc fails before any Kungfu download", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "libkungfu-installer-libc-test-"));
  try {
    const fixture = createFixture(root);
    const kungfuRelease = fixture.catalog.products.find((entry) => entry.id === "kungfu").versions[0];
    if (!kungfuRelease.targets.some((entry) => entry.platform === "linux-x64")) {
      kungfuRelease.targets.push({ ...kungfuRelease.targets[0], platform: "linux-x64" });
      const catalogBytes = Buffer.from(`${JSON.stringify(fixture.catalog, null, 2)}\n`);
      const template = fs.readFileSync(path.join(repoRoot, "src", "installers", "install.sh.in"), "utf8");
      const powershellTemplate = fs.readFileSync(path.join(repoRoot, "src", "installers", "install.ps1.in"), "utf8");
      const rendered = renderInstaller({ catalog: fixture.catalog, catalogBytes, template, powershellTemplate });
      fs.writeFileSync(fixture.catalogFile, catalogBytes);
      fs.writeFileSync(fixture.installerFile, rendered.installerBytes);
    }
    writeExecutable(path.join(fixture.fakeBin, "uname"), `#!/bin/sh
case "\${1:-}" in
  -s) printf '%s\\n' Linux ;;
  -m) printf '%s\\n' x86_64 ;;
  *) exit 1 ;;
esac
`);
    writeExecutable(path.join(fixture.fakeBin, "getconf"), `#!/bin/sh
printf '%s\\n' 'glibc 2.17'
`);
    const result = run("sh", [fixture.installerFile, "--dry-run"], {
      env: fixtureEnv(root, fixture.fakeBin),
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsupported-host.*requires glibc 2\.39.*glibc 2\.17/);
    assert.doesNotMatch(result.stderr, /awk:/);
    assert.doesNotMatch(result.stderr, /download:/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("catalog rejects a second product set or an unpinned digest", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, "src", "install", "installer-catalog.json"), "utf8"));
  assert.equal(validateCatalog(catalog).length, 25);
  assert.throws(() => validateCatalog({ ...catalog, products: catalog.products.slice(1) }), /exactly four products/);
  const broken = structuredClone(catalog);
  broken.products[0].versions[0].targets[0].artifact.sha256 = "latest";
  assert.throws(() => validateCatalog(broken), /lowercase SHA-256/);
});

test("all-products install is verified, versioned, and rollback-safe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "libkungfu-installer-test-"));
  try {
    const fixture = createFixture(root);
    const installRoot = path.join(root, "install root");
    const binDir = path.join(root, "bin dir");
    const env = fixtureEnv(root, fixture.fakeBin);
    const all = run("sh", [fixture.installerFile, "all", "--install-dir", installRoot, "--bin-dir", binDir], { env });
    assert.equal(all.status, 0, all.stderr);
    for (const command of ["kfd", "buildchain", "kungfu", "agent-hub-demo"]) {
      assert.ok(fs.lstatSync(path.join(binDir, command)).isSymbolicLink(), command);
    }

    const upgrade = run("sh", [fixture.installerFile, "kfd", "--version", "2.0.0", "--install-dir", installRoot, "--bin-dir", binDir], { env });
    assert.equal(upgrade.status, 0, upgrade.stderr);
    const upgraded = run(path.join(binDir, "kfd"), [], { env });
    assert.match(upgraded.stdout, /kfd 2\.0\.0/);

    const rollback = run("sh", [fixture.installerFile, "kfd", "--rollback", "--install-dir", installRoot, "--bin-dir", binDir], { env });
    assert.equal(rollback.status, 0, rollback.stderr);
    const restored = run(path.join(binDir, "kfd"), [], { env });
    assert.match(restored.stdout, /kfd 1\.0\.0/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("partial download and delegated failure leave no partial activation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "libkungfu-installer-failure-test-"));
  try {
    const fixture = createFixture(root);
    const partialRoot = path.join(root, "partial-install");
    const partialBin = path.join(root, "partial-bin");
    const partial = run("sh", [fixture.installerFile, "kfd", "--install-dir", partialRoot, "--bin-dir", partialBin], {
      env: fixtureEnv(root, fixture.fakeBin, { FIXTURE_PARTIAL_PATTERN: "kfd-v1.tar.gz" }),
    });
    assert.notEqual(partial.status, 0);
    assert.equal(fs.existsSync(path.join(partialBin, "kfd")), false);

    const corruptRoot = path.join(root, "corrupt-install");
    const corruptBin = path.join(root, "corrupt-bin");
    const corrupt = run("sh", [fixture.installerFile, "kfd", "--install-dir", corruptRoot, "--bin-dir", corruptBin], {
      env: fixtureEnv(root, fixture.fakeBin, { FIXTURE_CORRUPT_PATTERN: "kfd-v1.tar.gz" }),
    });
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /digest-mismatch/);
    assert.equal(fs.existsSync(path.join(corruptBin, "kfd")), false);

    const conflictBin = path.join(root, "conflict-bin");
    fs.mkdirSync(conflictBin);
    fs.writeFileSync(path.join(conflictBin, "kfd"), "user-owned\n");
    const conflict = run("sh", [fixture.installerFile, "kfd", "--dry-run", "--install-dir", path.join(root, "conflict-install"), "--bin-dir", conflictBin], {
      env: fixtureEnv(root, fixture.fakeBin),
    });
    assert.notEqual(conflict.status, 0);
    assert.equal(fs.readFileSync(path.join(conflictBin, "kfd"), "utf8"), "user-owned\n");

    const allRoot = path.join(root, "all-install");
    const allBin = path.join(root, "all-bin");
    const failed = run("sh", [fixture.installerFile, "all", "--install-dir", allRoot, "--bin-dir", allBin], {
      env: fixtureEnv(root, fixture.fakeBin, { FIXTURE_DELEGATE_FAIL: "1" }),
    });
    assert.notEqual(failed.status, 0);
    for (const command of ["kfd", "buildchain", "kungfu", "agent-hub-demo"]) {
      assert.equal(fs.existsSync(path.join(allBin, command)), false, command);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("unsafe archive paths fail before activation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "libkungfu-installer-unsafe-test-"));
  try {
    const fixture = createFixture(root);
    const unsafe = unsafeArchiveBytes();
    fs.writeFileSync(path.join(root, "kfd-v1.tar.gz"), unsafe);
    const target = fixture.catalog.products[0].versions[0].targets[0];
    target.artifact.size = unsafe.length;
    target.artifact.sha256 = sha256(unsafe);
    const catalogBytes = Buffer.from(`${JSON.stringify(fixture.catalog, null, 2)}\n`);
    const template = fs.readFileSync(path.join(repoRoot, "src", "installers", "install.sh.in"), "utf8");
    const powershellTemplate = fs.readFileSync(path.join(repoRoot, "src", "installers", "install.ps1.in"), "utf8");
    const rendered = renderInstaller({ catalog: fixture.catalog, catalogBytes, template, powershellTemplate });
    fs.writeFileSync(fixture.catalogFile, catalogBytes);
    fs.writeFileSync(fixture.installerFile, rendered.installerBytes);
    const binDir = path.join(root, "unsafe-bin");
    const result = run("sh", [fixture.installerFile, "kfd", "--install-dir", path.join(root, "unsafe-install"), "--bin-dir", binDir], {
      env: fixtureEnv(root, fixture.fakeBin),
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /archive-unsafe/);
    assert.equal(fs.existsSync(path.join(binDir, "kfd")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
