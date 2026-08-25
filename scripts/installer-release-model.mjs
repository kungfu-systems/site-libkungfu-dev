export const installerReleaseModel = Object.freeze({
  source: "github-release",
  selection: "exact-tag",
  assetAuthority: "product-repository",
  productVariance: "evidence-and-packaging-adapter-only",
});

export const installerProductAdapters = Object.freeze({
  kfd: Object.freeze({
    repository: "kungfu-systems/kfd",
    evidence: "kfd-native-release/v1",
    targets: Object.freeze([
      Object.freeze(["darwin-arm64", "aarch64-apple-darwin"]),
      Object.freeze(["darwin-x64", "x86_64-apple-darwin"]),
      Object.freeze(["linux-arm64", "aarch64-unknown-linux-gnu"]),
      Object.freeze(["linux-x64", "x86_64-unknown-linux-gnu"]),
      Object.freeze(["windows-x64", "x86_64-pc-windows-msvc"]),
    ]),
  }),
  buildchain: Object.freeze({
    repository: "kungfu-systems/buildchain",
    evidence: "buildchain-standalone-binary/v1",
    targets: Object.freeze([
      Object.freeze(["darwin-arm64", "aarch64-apple-darwin"]),
      Object.freeze(["linux-x64", "x86_64-unknown-linux-gnu"]),
      Object.freeze(["windows-x64", "x86_64-pc-windows-msvc"]),
    ]),
  }),
  kungfu: Object.freeze({
    repository: "kungfu-systems/kungfu",
    evidence: "kungfu-installer-publication-bundle/v1",
    targets: Object.freeze([
      Object.freeze(["darwin-arm64", "darwin-arm64"]),
      Object.freeze(["linux-arm64", "linux-arm64"]),
      Object.freeze(["linux-x64", "linux-x64"]),
      Object.freeze(["windows-x64", "windows-x64"]),
    ]),
  }),
  "agent-hub-demo": Object.freeze({
    repository: "kungfu-systems/agent-hub-demo",
    evidence: "agent-hub-binary-evidence/v1",
    targets: Object.freeze([
      Object.freeze(["darwin-arm64", "macos-arm64"]),
      Object.freeze(["linux-x64", "linux-x64"]),
      Object.freeze(["windows-x64", "windows-x64"]),
    ]),
  }),
});

export const installerProductIds = Object.freeze(Object.keys(installerProductAdapters));

export function releaseAdapterRecord(productId) {
  const adapter = installerProductAdapters[productId];
  if (!adapter) throw new Error(`product-unsupported: ${productId}`);
  return {
    source: installerReleaseModel.source,
    repository: adapter.repository,
    evidence: adapter.evidence,
  };
}

export function releaseDownloadPrefix(productId, tag) {
  const adapter = installerProductAdapters[productId];
  if (!adapter) throw new Error(`product-unsupported: ${productId}`);
  return `https://github.com/${adapter.repository}/releases/download/${tag}/`;
}
