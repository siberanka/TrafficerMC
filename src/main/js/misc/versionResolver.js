/**
 * Resolves Minecraft version to the closest supported protocol version.
 * Supports versions from 1.8.x up to 26.2 (including 26.2, 26.1, 26.0, 1.21.11, etc.)
 */
export function resolveBotVersion(version) {
  if (!version) return

  // Handle 26.x versions (e.g. 26.2, 26.1, 26.0)
  const match26 = version.match(/^26\.(\d+)(?:\.(\d+))?$/)
  if (match26) {
    return '26.1'
  }

  // Handle 1.21.x versions (e.g. 1.21.11, 1.21.10, ..., 1.21)
  const match = version.match(/^1\.21\.(\d+)$/)
  if (match) {
    const patch = parseInt(match[1], 10)
    const supportedPatches = [0, 1, 3, 4, 5, 6, 8, 9, 10, 11]
    const nearestPatch = [...supportedPatches].reverse().find((value) => patch >= value) ?? 0
    return nearestPatch === 0 ? '1.21' : `1.21.${nearestPatch}`
  }

  return version
}
