import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const safeValue = /^[A-Za-z0-9._:/@+=-]+$/u;
const digest = /^[0-9a-f]{64}$/u;
const gitSha = /^[0-9a-f]{40}$/u;
const productIds = ["kfd", "buildchain", "kungfu", "agent-hub-demo"];
const targetIds = new Set(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function requireSafe(value, label) {
  if (typeof value !== "string" || !safeValue.test(value)) {
    throw new Error(`${label} must be a shell-safe token`);
  }
  return value;
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !digest.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requireAsset(value, label) {
  if (!value || typeof value !== "object") throw new Error(`${label} is required`);
  requireSafe(value.name || "asset", `${label}.name`);
  if (!String(value.url || "").startsWith("https://")) throw new Error(`${label}.url must use HTTPS`);
  requireSafe(value.url, `${label}.url`);
  if (!Number.isSafeInteger(value.size) || value.size <= 0) throw new Error(`${label}.size must be positive`);
  requireDigest(value.sha256, `${label}.sha256`);
}

export function validateCatalog(catalog) {
  if (catalog?.contract !== "libkungfu.multi-product-installer-catalog/v1") {
    throw new Error("unsupported installer catalog contract");
  }
  if (catalog.schemaVersion !== 1 || catalog.scope !== "posix-shell") {
    throw new Error("unsupported installer catalog scope");
  }
  if (
    catalog.refresh?.mode !== "explicit-exact-release"
    || catalog.refresh?.source !== "github-release"
    || catalog.refresh?.movingSelectorsAllowed !== false
    || catalog.refresh?.retention !== "append-only-versions"
  ) {
    throw new Error("installer catalog must retain the reviewed exact-release refresh policy");
  }
  if (!Array.isArray(catalog.products) || catalog.products.length !== productIds.length) {
    throw new Error("installer catalog must contain exactly four products");
  }
  if (catalog.products.map((entry) => entry.id).join(",") !== productIds.join(",")) {
    throw new Error(`installer products must stay ordered as ${productIds.join(", ")}`);
  }
  const homebrewProductIds = ["kfd", "buildchain", "kungfu"];
  const homebrewProducts = catalog.homebrew?.products;
  if (
    catalog.homebrew?.repository !== "https://github.com/kungfu-systems/homebrew-tap"
    || !Array.isArray(homebrewProducts)
    || homebrewProducts.map((entry) => entry.id).join(",") !== homebrewProductIds.join(",")
    || homebrewProducts.some((entry) => entry.command !== `brew install kungfu-systems/tap/${entry.id}`)
    || !catalog.homebrew.authorityBoundary
  ) {
    throw new Error("installer catalog must expose the reviewed Homebrew tap routes for KFD, Buildchain, and Kungfu");
  }

  const records = [];
  for (const product of catalog.products) {
    requireSafe(product.id, `${product.id}.id`);
    requireSafe(product.command, `${product.id}.command`);
    if (!String(product.repository || "").startsWith("https://github.com/kungfu-systems/")) {
      throw new Error(`${product.id}.repository must remain an upstream kungfu-systems repository`);
    }
    if (!Array.isArray(product.versions) || product.versions.length === 0) {
      throw new Error(`${product.id} must expose at least one version`);
    }
    if (!product.versions.some((entry) => entry.version === product.defaultVersion)) {
      throw new Error(`${product.id}.defaultVersion is not catalogued`);
    }
    const versions = new Set();
    for (const version of product.versions) {
      requireSafe(version.version, `${product.id}.version`);
      requireSafe(version.tag, `${product.id}@${version.version}.tag`);
      if (!gitSha.test(version.sourceSha || "")) {
        throw new Error(`${product.id}@${version.version}.sourceSha must be a 40-character Git SHA`);
      }
      if (versions.has(version.version)) throw new Error(`${product.id} repeats ${version.version}`);
      versions.add(version.version);
      if (!Array.isArray(version.targets) || version.targets.length === 0) {
        throw new Error(`${product.id}@${version.version} has no targets`);
      }
      const targets = new Set();
      for (const target of version.targets) {
        if (!targetIds.has(target.platform) || targets.has(target.platform)) {
          throw new Error(`${product.id}@${version.version} has an invalid or repeated target`);
        }
        targets.add(target.platform);
        if (!["archive", "binary", "delegated-installer"].includes(target.kind)) {
          throw new Error(`${product.id}@${version.version}/${target.platform} has an unsupported kind`);
        }
        requireAsset(target.artifact, `${product.id}@${version.version}/${target.platform}.artifact`);
        requireAsset({ ...target.provenance, name: "provenance" }, `${product.id}@${version.version}/${target.platform}.provenance`);
        if (target.kind === "delegated-installer") {
          requireAsset({ ...target.delegate, name: "install.sh" }, `${product.id}@${version.version}/${target.platform}.delegate`);
          if (product.id !== "kungfu") throw new Error("only Kungfu may delegate to its signed installer");
        } else {
          requireSafe(target.binaryPath, `${product.id}@${version.version}/${target.platform}.binaryPath`);
          requireDigest(target.binarySha256, `${product.id}@${version.version}/${target.platform}.binarySha256`);
          if (target.kind === "archive" && target.archiveType !== "tar.gz") {
            throw new Error("the POSIX installer currently accepts only tar.gz archives");
          }
        }
        records.push({ product, version, target });
      }
    }
  }
  return records;
}

function shellAssignment(name, value) {
  requireSafe(String(value), name);
  return `    ${name}='${value}'`;
}

function renderDefaults(catalog) {
  return catalog.products.map((product) => [
    `  ${product.id})`,
    shellAssignment("command_name", product.command),
    shellAssignment("default_version", product.defaultVersion),
    "    ;;",
  ].join("\n")).join("\n");
}

function renderRecords(records) {
  return records.map(({ product, version, target }) => {
    const lines = [
      `  ${product.id}:${version.version}:${target.platform})`,
      shellAssignment("artifact_kind", target.kind),
      shellAssignment("artifact_name", target.artifact.name),
      shellAssignment("artifact_url", target.artifact.url),
      shellAssignment("artifact_size", target.artifact.size),
      shellAssignment("artifact_sha256", target.artifact.sha256),
      shellAssignment("provenance_url", target.provenance.url),
      shellAssignment("provenance_size", target.provenance.size),
      shellAssignment("provenance_sha256", target.provenance.sha256),
      shellAssignment("source_sha", version.sourceSha),
    ];
    if (target.kind === "delegated-installer") {
      lines.push(
        shellAssignment("delegate_url", target.delegate.url),
        shellAssignment("delegate_size", target.delegate.size),
        shellAssignment("delegate_sha256", target.delegate.sha256),
      );
    } else {
      lines.push(
        shellAssignment("binary_path", target.binaryPath),
        shellAssignment("binary_sha256", target.binarySha256),
        shellAssignment("platform_trust", target.platformTrust || "digest"),
      );
    }
    lines.push("    ;;");
    return lines.join("\n");
  }).join("\n");
}

function renderVersionHelp(catalog) {
  return catalog.products
    .map((product) => `${product.id}: ${product.versions.map((entry) => entry.version).join(", ")} (default ${product.defaultVersion})`)
    .join("\\n");
}

export function renderInstaller({ catalog, catalogBytes, template }) {
  const records = validateCatalog(catalog);
  const catalogSha256 = sha256(catalogBytes);
  const catalogUrl = `https://libkungfu.dev/install/v1/catalog/${catalogSha256}.json`;
  let installer = template
    .replaceAll("@@CATALOG_SHA256@@", catalogSha256)
    .replaceAll("@@CATALOG_SIZE@@", String(catalogBytes.length))
    .replaceAll("@@CATALOG_URL@@", catalogUrl)
    .replace("@@DEFAULT_CASES@@", renderDefaults(catalog))
    .replace("@@TARGET_CASES@@", renderRecords(records))
    .replace("@@VERSION_HELP@@", renderVersionHelp(catalog));
  if (installer.includes("@@")) throw new Error("installer template contains an unresolved token");
  const installerBytes = Buffer.from(installer, "utf8");
  const installerSha256 = sha256(installerBytes);
  const manifest = {
    schemaVersion: 1,
    contract: "libkungfu.multi-product-installer-publication/v1",
    catalog: {
      contract: catalog.contract,
      sha256: catalogSha256,
      size: catalogBytes.length,
      friendlyUrl: "https://libkungfu.dev/install/v1/catalog.json",
      immutableUrl: catalogUrl,
    },
    installer: {
      sha256: installerSha256,
      size: installerBytes.length,
      friendlyUrl: "https://libkungfu.dev/install.sh",
      immutableUrl: `https://libkungfu.dev/installers/v1/${installerSha256}/install.sh`,
    },
    products: catalog.products.map((product) => ({
      id: product.id,
      command: product.command,
      defaultVersion: product.defaultVersion,
      versions: product.versions.map((entry) => entry.version),
    })),
    authorityBoundary: catalog.authorityBoundary,
  };
  return { catalogSha256, installerBytes, installerSha256, manifest };
}

export function writeInstallerPublication({ root = repoRoot } = {}) {
  const catalogPath = path.join(root, "src", "install", "installer-catalog.json");
  const templatePath = path.join(root, "src", "installers", "install.sh.in");
  const catalogBytes = fs.readFileSync(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const template = fs.readFileSync(templatePath, "utf8");
  const rendered = renderInstaller({ catalog, catalogBytes, template });
  const dist = path.join(root, "dist");
  const writes = new Map([
    ["install.sh", rendered.installerBytes],
    ["install/v1/catalog.json", catalogBytes],
    [`install/v1/catalog/${rendered.catalogSha256}.json`, catalogBytes],
    [`installers/v1/${rendered.installerSha256}/install.sh`, rendered.installerBytes],
    ["install/v1/manifest.json", Buffer.from(`${JSON.stringify(rendered.manifest, null, 2)}\n`)],
  ]);
  for (const [relative, bytes] of writes) {
    const output = path.join(dist, relative);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bytes);
  }
  return rendered;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rendered = writeInstallerPublication();
  process.stdout.write(`render-installer: ${rendered.installerSha256} ${rendered.catalogSha256}\n`);
}
