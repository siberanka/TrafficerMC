/**
 * Resolves Minecraft version to the closest supported protocol version in minecraft-protocol.
 * Supports versions from 1.8.x up to 26.2 (including 26.2, 26.1, 26.0, 1.21.11, etc.)
 */
export function resolveBotVersion(version) {
  if (!version) return

  // Handle 26.x versions (e.g. 26.2, 26.1, 26.0 -> maps to 26.1)
  const match26 = version.match(/^26\.(\d+)(?:\.(\d+))?$/)
  if (match26) {
    return '26.1'
  }

  // Handle 1.21.x versions matching minecraft-protocol supported list
  const match = version.match(/^1\.21\.(\d+)$/)
  if (match) {
    const patch = parseInt(match[1], 10)
    const supportedPatches = [1, 3, 4, 5, 6, 8, 9, 11]
    const nearestPatch = [...supportedPatches].reverse().find((value) => patch >= value) ?? 1
    return `1.21.${nearestPatch}`
  }

  return version
}
