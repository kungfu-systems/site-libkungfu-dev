const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_SET_CONTRACT = "libkungfu-dev-publication-package-set";
const PACKAGE_REGISTRY_CONTRACT = "kungfu-buildchain-publication-artifact-registry";
const PACKAGE_MANIFEST_CONTRACT = "kungfu-buildchain-publication-artifact-manifest";
const RELEASE_REGISTRY_CONTRACT = "kungfu-buildchain-publication-release-registry";
const PAPERS_HOST = "papers.libkungfu.dev";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function packageRoot(packageName) {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

function safePackagePath(value, label) {
  const normalized = String(value || "").trim().replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`invalid ${label}: ${value}`);
  }
  return normalized;
}

function sha256(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const digest = normalized.startsWith("sha256:") ? normalized.slice(7) : normalized;
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`invalid SHA256 digest: ${value}`);
  }
  return `sha256:${digest}`;
}

function papersPath(urlValue, label) {
  const url = new URL(String(urlValue || ""));
  if (url.protocol !== "https:" || url.host !== PAPERS_HOST || !url.pathname.startsWith("/")) {
    throw new Error(`${label} must use https://${PAPERS_HOST}: ${urlValue}`);
  }
  if (url.pathname.includes("..") || url.pathname.includes("//")) {
    throw new Error(`invalid ${label} path: ${url.pathname}`);
  }
  return url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
}

function artifactPublicPath(urlValue, immutablePath, label) {
  const url = new URL(String(urlValue || ""));
  if (url.protocol !== "https:" || url.host !== PAPERS_HOST || !url.pathname.startsWith(immutablePath)) {
    throw new Error(`${label} must stay under ${immutablePath}: ${urlValue}`);
  }
  return safePackagePath(url.pathname.slice(immutablePath.length), `${label} public path`);
}

function mediaTypeFor(file) {
  if (file.endsWith(".pdf")) return "application/pdf";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".tar.gz") || file.endsWith(".tgz")) return "application/gzip";
  return "application/octet-stream";
}

function artifactDescriptor({ packageName, packagePath, publicPath, kind, role, digest, bytes }) {
  return {
    kind,
    role,
    path: safePackagePath(publicPath, `${kind} public path`),
    mediaType: mediaTypeFor(publicPath),
    sha256: sha256(digest),
    bytes,
    source: {
      package: packageName,
      path: safePackagePath(packagePath, `${kind} package path`),
    },
  };
}

function optionalEvidenceBundle(root, packageJson) {
  const evidencePath = path.join(root, "site", "evidence-site.json");
  if (!fs.existsSync(evidencePath)) return undefined;
  const evidence = readJson(evidencePath);
  if (evidence.contract !== "kungfu-white-paper-evidence-site-bundle" || evidence.consumer !== PAPERS_HOST) {
    throw new Error(`unexpected evidence site bundle for ${packageJson.name}`);
  }
  if (evidence.source?.package !== packageJson.name || evidence.source?.packageVersion !== packageJson.version) {
    throw new Error(`evidence site package identity mismatch for ${packageJson.name}`);
  }
  return evidence;
}

function normalizePublication(packageSpec, packageDependencies) {
  const root = packageRoot(packageSpec.name);
  const packageJson = readJson(path.join(root, "package.json"));
  if (packageJson.name !== packageSpec.name || packageJson.version !== packageSpec.version) {
    throw new Error(`publication package identity mismatch: ${packageSpec.name}@${packageSpec.version}`);
  }
  if (packageDependencies[packageSpec.name] !== packageSpec.version) {
    throw new Error(`package.json must pin ${packageSpec.name}@${packageSpec.version}`);
  }

  const registry = readJson(path.join(root, ".buildchain", "publication", "publication-registry.json"));
  const manifest = readJson(path.join(root, ".buildchain", "publication", "publication-artifact.json"));
  if (registry.contract !== PACKAGE_REGISTRY_CONTRACT || manifest.contract !== PACKAGE_MANIFEST_CONTRACT) {
    throw new Error(`publication contracts mismatch for ${packageSpec.name}`);
  }

  const publicationId = String(registry.publication?.id || "").trim();
  const expectedId = packageSpec.name.split("/paper-")[1];
  if (!publicationId || publicationId !== expectedId) {
    throw new Error(`publication id does not match package name: ${packageSpec.name}`);
  }
  if (manifest.publication?.version !== packageSpec.version || manifest.publication?.title !== registry.publication?.title) {
    throw new Error(`publication manifest identity mismatch for ${packageSpec.name}`);
  }
  if (!Array.isArray(registry.versions) || registry.versions.length === 0) {
    throw new Error(`publication registry has no versions: ${packageSpec.name}`);
  }

  const canonicalPath = papersPath(registry.publication.canonicalUrl, `${publicationId} canonical URL`);
  const latestPath = papersPath(registry.publication.latestUrl, `${publicationId} latest URL`);
  if (canonicalPath !== `/${publicationId}/` || latestPath !== `/${publicationId}/latest/`) {
    throw new Error(`publication route shape mismatch for ${publicationId}`);
  }

  const versions = registry.versions.map((version) => {
    const versionId = String(version.version || "").trim();
    const immutablePath = papersPath(version.routes?.immutableVersionUrl, `${publicationId}@${versionId} immutable URL`);
    const expectedPath = `/archive/${publicationId}/v${versionId}/`;
    if (immutablePath !== expectedPath || version.status !== "published") {
      throw new Error(`publication version route/status mismatch for ${publicationId}@${versionId}`);
    }

    const primaryArtifacts = (version.artifacts || []).map((artifact) => artifactDescriptor({
      packageName: packageSpec.name,
      packagePath: artifact.path,
      publicPath: artifactPublicPath(artifact.url, immutablePath, `${publicationId} artifact`),
      kind: artifact.role === "primary" && String(artifact.url).endsWith(".pdf") ? "pdf" : (artifact.role || "artifact"),
      role: artifact.role,
      digest: artifact.sha256,
      bytes: artifact.bytes,
    }));
    const publicationManifest = artifactDescriptor({
      packageName: packageSpec.name,
      packagePath: version.manifest.path,
      publicPath: artifactPublicPath(version.manifest.url, immutablePath, `${publicationId} manifest`),
      kind: "manifest",
      role: "evidence",
      digest: version.manifest.sha256,
    });
    const passport = artifactDescriptor({
      packageName: packageSpec.name,
      packagePath: version.passport.path,
      publicPath: artifactPublicPath(version.passport.url, immutablePath, `${publicationId} passport`),
      kind: "passport",
      role: "evidence",
      digest: version.passport.sha256,
    });
    const sourceBundle = artifactDescriptor({
      packageName: packageSpec.name,
      packagePath: version.source.sourceBundle.path,
      publicPath: artifactPublicPath(version.source.sourceBundle.url, immutablePath, `${publicationId} source bundle`),
      kind: "source",
      role: "source",
      digest: version.source.sourceBundle.sha256,
      bytes: version.source.sourceBundle.bytes,
    });

    return {
      version: versionId,
      releasedAt: version.publishedAt,
      status: version.status,
      immutable: true,
      immutablePath,
      immutableDigest: version.immutableDigest,
      source: {
        repository: version.source.repository,
        commit: version.source.sha,
        treeSha: version.source.treeSha,
        bundle: sourceBundle,
      },
      manifest: publicationManifest,
      passport,
      artifacts: primaryArtifacts,
    };
  });
  if (!versions.some((version) => version.version === packageSpec.version)) {
    throw new Error(`publication package does not expose its own version: ${packageSpec.name}@${packageSpec.version}`);
  }

  const evidence = optionalEvidenceBundle(root, packageJson);
  const relatedReaders = evidence?.routes?.brandUrl
    ? [{ kind: "brand-reader", label: "Brand reader", url: evidence.routes.brandUrl }]
    : [];

  return {
    package: {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      repository: packageJson.repository?.url || packageJson.repository,
      registryContract: registry.contract,
      manifestContract: manifest.contract,
    },
    publication: {
      id: publicationId,
      kind: registry.publication.kind,
      title: registry.publication.title,
      summary: manifest.publication.abstract || packageJson.description,
      authors: manifest.publication.authors || [],
      canonicalReader: {
        kind: "canonical-reader",
        url: registry.publication.canonicalUrl,
        owner: PAPERS_HOST,
      },
      relatedReaders,
      latest: {
        kind: "latest",
        version: packageSpec.version,
        path: latestPath,
        evidenceUrl: registry.publication.latestEvidenceUrl,
      },
      immutablePrefixTemplate: `/archive/${publicationId}/v{version}/`,
      package: packageJson.name,
      versions,
    },
  };
}

function loadPublicationPackageSet(repoRoot) {
  const packageSetPath = path.join(repoRoot, "src", "publication-packages.json");
  const packageSet = readJson(packageSetPath);
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  if (packageSet.contract !== PACKAGE_SET_CONTRACT || packageSet.schemaVersion !== 1) {
    throw new Error("publication package set contract mismatch");
  }
  if (!Array.isArray(packageSet.packages) || packageSet.packages.length === 0) {
    throw new Error("publication package set must declare packages");
  }

  const loaded = packageSet.packages.map((entry) => normalizePublication(entry, packageJson.dependencies || {}));
  const ids = loaded.map((entry) => entry.publication.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("publication package set contains duplicate publication ids");
  }

  return {
    kind: "paper-packages",
    source: "src/publication-packages.json and package-local publication registries",
    packages: loaded.map((entry) => entry.package),
    registry: {
      schemaVersion: 1,
      contract: RELEASE_REGISTRY_CONTRACT,
      generatedFrom: PACKAGE_REGISTRY_CONTRACT,
      archivePolicy: {
        contract: "kungfu-buildchain-publication-archive-policy",
        mutableRouteKinds: ["canonical-reader", "latest", "registry-index"],
        immutableRouteKinds: ["version-artifact", "version-passport", "version-source"],
        deploymentBoundary: "append-only immutable version prefixes",
        rule: "A site build may update latest and canonical reader pages, but it must not delete or overwrite files under a declared immutable version prefix.",
      },
      publications: loaded.map((entry) => entry.publication),
    },
  };
}

function readPublicationArtifact(artifact) {
  const packageName = artifact?.source?.package;
  const packagePath = safePackagePath(artifact?.source?.path, "publication artifact source path");
  const file = path.join(packageRoot(packageName), packagePath);
  const body = fs.readFileSync(file);
  const digest = `sha256:${crypto.createHash("sha256").update(body).digest("hex")}`;
  if (digest !== artifact.sha256) {
    throw new Error(`publication artifact digest mismatch for ${packageName}/${packagePath}: expected ${artifact.sha256}, got ${digest}`);
  }
  if (artifact.bytes !== undefined && body.length !== artifact.bytes) {
    throw new Error(`publication artifact byte count mismatch for ${packageName}/${packagePath}`);
  }
  return body;
}

module.exports = {
  PACKAGE_MANIFEST_CONTRACT,
  PACKAGE_REGISTRY_CONTRACT,
  PACKAGE_SET_CONTRACT,
  RELEASE_REGISTRY_CONTRACT,
  loadPublicationPackageSet,
  readPublicationArtifact,
};
