import minecraftProtocol from 'minecraft-protocol'
import minecraftData from 'minecraft-data'

const supportedVersions = new Set(minecraftProtocol.supportedVersions)
const protocolVersions = minecraftData.versions.pc
const aliases = new Map([
  ['1.8', '1.8.8'],
  ['1.8.9', '1.8.8'],
  ['1.9', '1.9.4'],
  ['1.10', '1.10.2'],
  ['1.11', '1.11.2'],
  ['1.12', '1.12.2'],
  ['1.13', '1.13.2'],
  ['1.14', '1.14.4'],
  ['1.15', '1.15.2'],
  ['1.16', '1.16.5'],
  ['1.17', '1.17.1'],
  ['1.18', '1.18.2']
])

/**
 * Resolves only protocol-equivalent releases. A newer, incompatible protocol is
 * never silently impersonated as an older version because chat/command packets
 * can then appear to work while being rejected or causing a disconnect.
 */
export function resolveBotVersion(version) {
  if (!version) return undefined
  const requested = String(version).trim()
  const alias = aliases.get(requested)
  if (alias) return alias
  if (supportedVersions.has(requested)) return requested

  const requestedData = protocolVersions.find((entry) => entry.minecraftVersion === requested)
  if (!requestedData) return undefined
  const equivalent = protocolVersions.find(
    (entry) =>
      entry.version === requestedData.version && supportedVersions.has(entry.minecraftVersion)
  )
  return equivalent?.minecraftVersion
}

export function isVersionSupported(version) {
  return !version || resolveBotVersion(version) !== undefined
}
