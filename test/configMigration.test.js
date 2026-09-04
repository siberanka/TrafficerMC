import assert from 'assert'
import {
  CURRENT_CONFIG_SCHEMA_VERSION,
  migrateConfigData
} from '../src/main/js/misc/configMigration.js'

const legacy = {
  value: {
    server: 'localhost:25565',
    username: 'SavedBot',
    reconnectDelay: '12000',
    spamDelay: '2400',
    unknownFutureValue: 'keep-me'
  },
  boolean: {
    autoReconnect: true,
    bypassChat: false,
    unknownFutureToggle: true
  },
  namefile: 'names.txt'
}

const migrated = migrateConfigData(legacy)
assert.equal(migrated.changed, true)
assert.equal(migrated.fromVersion, 0)
assert.equal(migrated.toVersion, CURRENT_CONFIG_SCHEMA_VERSION)
assert.equal(migrated.config.value.server, 'localhost:25565')
assert.equal(migrated.config.value.username, 'SavedBot')
assert.equal(migrated.config.boolean.autoReconnect, true)
assert.equal(migrated.config.value.reconnectDelayMin, 12000)
assert.equal(migrated.config.value.reconnectDelayMax, 18000)
assert.equal(migrated.config.value.spammerDelayMin, 2400)
assert.equal(migrated.config.value.spammerDelayMax, 2400)
assert.equal(migrated.config.boolean.customFormatter, false)
assert.equal(migrated.config.value.unknownFutureValue, 'keep-me')
assert.equal(migrated.config.boolean.unknownFutureToggle, true)
assert.equal(migrated.config.namefile, 'names.txt')

const flat = migrateConfigData({ server: 'flat.example', botMax: 4, autoReconnect: true })
assert.equal(flat.config.value.server, 'flat.example')
assert.equal(flat.config.value.botMax, 4)
assert.equal(flat.config.boolean.autoReconnect, true)

const aliases = migrateConfigData({
  values: { server: 'alias.example' },
  checkboxes: { autoAuth: true }
})
assert.equal(aliases.config.value.server, 'alias.example')
assert.equal(aliases.config.boolean.autoAuth, true)

const malformed = migrateConfigData({ value: 'invalid', boolean: [], reconnectDelay: 100 })
assert.equal(malformed.config.value.reconnectDelayMin, 8000)
assert.equal(malformed.config.value.reconnectDelayMax, 15000)

const secondPass = migrateConfigData(migrated.config)
assert.equal(secondPass.changed, false, 'migration must be idempotent')
assert.deepEqual(secondPass.config, migrated.config)

console.log('PASS config migration: legacy, flat, aliased, malformed, preserved, and idempotent')
