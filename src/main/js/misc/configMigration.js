import {
  DEFAULT_REJOIN_DELAY_MAX,
  DEFAULT_REJOIN_DELAY_MIN,
  normalizeRejoinRange
} from './reconnectPolicy.js'

export const CURRENT_CONFIG_SCHEMA_VERSION = 2

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function copyRecord(value) {
  return isRecord(value) ? { ...value } : {}
}

function setDefault(target, key, value) {
  if (target[key] === undefined || target[key] === null || target[key] === '') {
    target[key] = value
  }
}

/**
 * Converts every configuration shape used by older TrafficerMC builds into the
 * current value/boolean layout. Unknown fields are retained so a future UI can
 * still recover them.
 */
export function migrateConfigData(rawConfig) {
  const wrappedConfig =
    isRecord(rawConfig) && isRecord(rawConfig.config) && !rawConfig.value && !rawConfig.boolean
      ? rawConfig.config
      : rawConfig
  const source = copyRecord(wrappedConfig)
  const before = JSON.stringify(source)
  const config = { ...source }

  const values = {
    ...copyRecord(config.values),
    ...copyRecord(config.value)
  }
  const booleans = {
    ...copyRecord(config.checkboxes),
    ...copyRecord(config.booleans),
    ...copyRecord(config.boolean)
  }

  // Very old or manually edited files may store controls directly under
  // config. Move primitive values into the typed maps without dropping them.
  for (const [key, value] of Object.entries(config)) {
    if (
      [
        'value',
        'values',
        'boolean',
        'booleans',
        'checkboxes',
        'namefile',
        'schemaVersion'
      ].includes(key)
    ) {
      continue
    }
    if (typeof value === 'boolean') {
      booleans[key] ??= value
      delete config[key]
    } else if (value === null || ['string', 'number'].includes(typeof value)) {
      values[key] ??= value
      delete config[key]
    }
  }

  delete config.values
  delete config.booleans
  delete config.checkboxes
  config.value = values
  config.boolean = booleans

  setDefault(booleans, 'autoAuth', false)
  setDefault(booleans, 'customFormatter', booleans.bypassChat ?? true)
  setDefault(booleans, 'formatManualChat', false)
  setDefault(values, 'authPassword', 'trafficermc123a')
  setDefault(values, 'proxySource', 'all')
  setDefault(values, 'proxyAnonymity', 'all')
  setDefault(values, 'spammerPattern', 'random')
  setDefault(values, 'messageConverter', 'none')
  setDefault(values, 'formatterPosition', 'suffix')
  setDefault(values, 'spammerMps', 1)

  if (typeof values.spammerMessages === 'string') {
    values.spammerMessages = values.spammerMessages
      .split(/\r?\n/)
      .map((message) => message.trim())
      .filter(Boolean)
  } else if (!Array.isArray(values.spammerMessages)) {
    values.spammerMessages = []
  }

  const legacyDefaults = [
    'daha kaliteli bi oyun deneyimi',
    'simit parasına açılmış sunuculardan sıkıldın mı?',
    'laglı sunuculardan sıkıldın mı?'
  ]
  if (
    values.spammerMessages.length === legacyDefaults.length &&
    values.spammerMessages.every((message, index) => message === legacyDefaults[index])
  ) {
    values.spammerMessages = []
  }

  const legacySpamDelay = Number(values.spamDelay)
  const safeLegacySpamDelay =
    Number.isFinite(legacySpamDelay) && legacySpamDelay >= 200 ? Math.round(legacySpamDelay) : null
  setDefault(values, 'spammerDelayMin', safeLegacySpamDelay ?? 1500)
  setDefault(values, 'spammerDelayMax', safeLegacySpamDelay ?? 3000)

  const legacyReconnectDelay = Number(values.reconnectDelay)
  const safeLegacyReconnectDelay =
    Number.isFinite(legacyReconnectDelay) && legacyReconnectDelay >= 3000
      ? Math.round(legacyReconnectDelay)
      : null
  setDefault(values, 'reconnectDelayMin', safeLegacyReconnectDelay ?? DEFAULT_REJOIN_DELAY_MIN)
  setDefault(
    values,
    'reconnectDelayMax',
    safeLegacyReconnectDelay
      ? Math.max(values.reconnectDelayMin, Math.round(safeLegacyReconnectDelay * 1.5))
      : DEFAULT_REJOIN_DELAY_MAX
  )

  const normalizedRejoin = normalizeRejoinRange(values)
  values.reconnectDelayMin = normalizedRejoin.min
  values.reconnectDelayMax = normalizedRejoin.max
  config.schemaVersion = CURRENT_CONFIG_SCHEMA_VERSION

  return {
    config,
    changed: before !== JSON.stringify(config),
    fromVersion: Number(source.schemaVersion) || 0,
    toVersion: CURRENT_CONFIG_SCHEMA_VERSION
  }
}
