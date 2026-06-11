export async function loadSeedFile(
  seedDir: string | undefined,
  locale: string,
): Promise<string | null> {
  if (
    typeof process === 'undefined' ||
    !process.versions?.node ||
    typeof process.cwd !== 'function'
  ) {
    return null
  }

  try {
    const fs = await import(/* webpackIgnore: true */ 'node:fs/promises')
    const path = await import(/* webpackIgnore: true */ 'node:path')
    const dir = seedDir ?? path.join(process.cwd(), 'airstrings', 'bundles')
    return await fs.readFile(path.join(dir, `${locale}.json`), 'utf8')
  } catch {
    return null
  }
}
