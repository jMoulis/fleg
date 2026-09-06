export function configVersion(baseVersion: string, revision?: number): string {
  return revision && revision > 0
    ? `${baseVersion}-config-${revision}`
    : baseVersion;
}
