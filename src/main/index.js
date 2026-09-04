/* eslint-disable no-case-declarations */
import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import os from 'os'
import crypto from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import { connection } from './js/proxy/proxyhandler'
import { checkProxy } from './js/proxy/proxycheck'
import { scrapeProxy } from './js/proxy/proxyscrape'
import {
  salt,
  delay,
  genName,
  botMode,
  sendEvent,
  proxyEvent,
  notify,
  cleanText
} from './js/misc/utils'
import { easyMcAuth } from './js/misc/customAuth'
import EventEmitter from 'node:events'
const Store = require('electron-store')
const mineflayer = require('mineflayer')
import { antiafk } from './js/misc/antiafk'
import { autoAuth } from './js/misc/autoAuth'
import { resolveBotVersion, isVersionSupported } from './js/misc/versionResolver'
import { sendBotMessage, getNextMessage } from './js/misc/spammerEngine'
import {
  DEFAULT_REJOIN_DELAY_MIN,
  DEFAULT_REJOIN_DELAY_MAX,
  getRandomRejoinDelay,
  normalizeRejoinRange
} from './js/misc/reconnectPolicy'
import { consoleManager } from './js/misc/consoleStreamer'
const botApi = new EventEmitter()
botApi.setMaxListeners(0)
const store = new Store()

let cachedConfig = store.get('config') || { value: {}, boolean: {} }
let saveConfigTimeout = null

function debouncedStoreSave() {
  if (saveConfigTimeout) clearTimeout(saveConfigTimeout)
  saveConfigTimeout = setTimeout(() => {
    try {
      store.set('config', cachedConfig)
    } catch (_) {}
  }, 250)
}

let stopBot = false
let stopScript = false
let stopProxyTest = false
let currentProxy = 0
let proxyUsed = 0
const rejoinTimers = new Set()

function storeinfo() {
  return cachedConfig
}

function clearRejoinTimers() {
  for (const timer of rejoinTimers) clearTimeout(timer)
  rejoinTimers.clear()
}

let clientVersion = 3.6

let playerList = []
let playerListSet = new Set()
const activeBots = new Map()

function getBot(username) {
  if (!username) return null
  if (activeBots.has(username)) return activeBots.get(username)
  const lower = String(username).toLowerCase().trim()
  for (const [key, bot] of activeBots.entries()) {
    if (
      String(key).toLowerCase().trim() === lower ||
      bot._client?.username?.toLowerCase().trim() === lower ||
      bot.username?.toLowerCase().trim() === lower
    ) {
      return bot
    }
  }
  return null
}

function getAllUniqueBots() {
  const bots = []
  const seen = new Set()
  for (const bot of activeBots.values()) {
    if (bot && !seen.has(bot)) {
      seen.add(bot)
      bots.push(bot)
    }
  }
  return bots
}

function isBotSelected(username) {
  if (!username) return false
  if (playerListSet.has(username)) return true
  const lower = String(username).toLowerCase().trim()
  for (const name of playerListSet) {
    if (String(name).toLowerCase().trim() === lower) return true
  }
  return false
}

function resolveTargetBots(explicitTargets = null) {
  const targets = []
  const seen = new Set()

  let rawTargets = null
  if (explicitTargets) {
    rawTargets = Array.isArray(explicitTargets) ? explicitTargets : [explicitTargets]
  } else if (playerList && playerList.length > 0) {
    rawTargets = playerList
  } else {
    // If no explicit selection in playerList, target all active unique bots
    return getAllUniqueBots()
  }

  for (const u of rawTargets) {
    const b = getBot(u)
    if (b && !seen.has(b)) {
      seen.add(b)
      targets.push(b)
    }
  }

  // Fallback to all unique bots if selected names could not be resolved
  if (targets.length === 0) {
    return getAllUniqueBots()
  }

  return targets
}

let spammerActive = false
let spammerTimeout = null
let spammerCounter = 0
let spammerState = { index: 0 }

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1040,
    height: 640,
    minWidth: 980,
    minHeight: 580,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    resizable: true,
    maximizable: true,
    webPreferences: {
      devTools: is.dev,
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  const showMainWindow = () => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  }

  const handleRendererLoaded = () => {
    store.set('version', {
      current: clientVersion
    })
    mainWindow.webContents.send('setConfig', store.get('config'), store.get('version'))
    if (!storeinfo()) {
      mainWindow.webContents.send('initConfig')
    }
    if (store.get('config.namefile')) {
      mainWindow.webContents.send('fileSelected', 'nameFileLabel', store.get('config.namefile'))
    }
    showMainWindow()
  }

  ipcMain.on('loaded', handleRendererLoaded)
  mainWindow.once('ready-to-show', showMainWindow)
  mainWindow.once('closed', () => ipcMain.removeListener('loaded', handleRendererLoaded))

  ipcMain.on('playerList', (event, list) => {
    playerList = Array.isArray(list) ? list.map((n) => String(n).trim()).filter(Boolean) : []
    playerListSet = new Set(playerList)
  })

  ipcMain.on('open', (event, id, name) => {
    dialog
      .showOpenDialog(mainWindow, {
        title: name,
        filters: [{ name: 'Text File', extensions: ['txt'] }],
        properties: ['openFile', 'multiSelections']
      })
      .then((result) => {
        if (!result.canceled) {
          cachedConfig.namefile = result.filePaths[0]
          store.set('config.namefile', result.filePaths[0])
          mainWindow.webContents.send('fileSelected', id, result.filePaths[0])
        }
      })
      .catch((error) => {
        console.log(error)
        return
      })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function cleanOldTempDirs() {
  try {
    const tmp = os.tmpdir()
    const currentAppDir = join(app.getAppPath(), '..', '..')
    const entries = fs.readdirSync(tmp)
    for (const entry of entries) {
      if (entry.startsWith('3') && entry.length >= 20) {
        const fullPath = join(tmp, entry)
        if (fullPath !== currentAppDir && fs.existsSync(join(fullPath, 'resources', 'app.asar'))) {
          try {
            fs.rmSync(fullPath, { recursive: true, force: true })
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

function migrateConfig() {
  try {
    const config = store.get('config') || {}
    let updated = false
    if (!config.value) config.value = {}
    if (!config.boolean) config.boolean = {}

    if (config.boolean.autoAuth === undefined) {
      config.boolean.autoAuth = false
      updated = true
    }
    if (!config.value.authPassword) {
      config.value.authPassword = 'trafficermc123a'
      updated = true
    }
    if (!config.value.proxySource) {
      config.value.proxySource = 'all'
      updated = true
    }
    if (!config.value.proxyAnonymity) {
      config.value.proxyAnonymity = 'all'
      updated = true
    }

    const legacyDefaults = [
      'daha kaliteli bi oyun deneyimi',
      'simit parasına açılmış sunuculardan sıkıldın mı?',
      'laglı sunuculardan sıkıldın mı?'
    ]

    if (!config.value.spammerMessages || !Array.isArray(config.value.spammerMessages)) {
      config.value.spammerMessages = []
      updated = true
    } else {
      const isLegacyDefault =
        config.value.spammerMessages.length === 3 &&
        config.value.spammerMessages.every((m, idx) => m === legacyDefaults[idx])
      if (isLegacyDefault) {
        config.value.spammerMessages = []
        updated = true
      }
    }

    if (!config.value.spammerPattern) {
      config.value.spammerPattern = 'random'
      updated = true
    }
    if (!config.value.messageConverter) {
      config.value.messageConverter = 'none'
      updated = true
    }
    if (!config.value.formatterPosition) {
      config.value.formatterPosition = 'suffix'
      updated = true
    }
    if (config.boolean.customFormatter === undefined) {
      config.boolean.customFormatter = true
      updated = true
    }
    if (!config.value.spammerDelayMin) {
      config.value.spammerDelayMin = 1500
      updated = true
    }
    if (!config.value.spammerDelayMax) {
      config.value.spammerDelayMax = 3000
      updated = true
    }
    if (!config.value.spammerMps) {
      config.value.spammerMps = 1
      updated = true
    }
    const legacyReconnectDelay = Number(config.value.reconnectDelay)
    if (config.value.reconnectDelayMin === undefined) {
      config.value.reconnectDelayMin =
        Number.isFinite(legacyReconnectDelay) && legacyReconnectDelay >= 3000
          ? Math.round(legacyReconnectDelay)
          : DEFAULT_REJOIN_DELAY_MIN
      updated = true
    }
    if (config.value.reconnectDelayMax === undefined) {
      config.value.reconnectDelayMax =
        Number.isFinite(legacyReconnectDelay) && legacyReconnectDelay >= 3000
          ? Math.max(config.value.reconnectDelayMin, Math.round(legacyReconnectDelay * 1.5))
          : DEFAULT_REJOIN_DELAY_MAX
      updated = true
    }
    const normalizedRejoin = normalizeRejoinRange(config.value)
    if (
      config.value.reconnectDelayMin !== normalizedRejoin.min ||
      config.value.reconnectDelayMax !== normalizedRejoin.max
    ) {
      config.value.reconnectDelayMin = normalizedRejoin.min
      config.value.reconnectDelayMax = normalizedRejoin.max
      updated = true
    }
    if (updated) {
      store.set('config', config)
    }
    cachedConfig = config
  } catch (_) {}
}

function startSpammerLoop() {
  if (spammerActive) return
  spammerActive = true
  BrowserWindow.getAllWindows()[0]?.webContents.send('spammerStateChanged', true)

  const runSpammerTick = async () => {
    if (!spammerActive) return

    const config = storeinfo() || {}
    const rawMessages = config.value?.spammerMessages
    const messages =
      Array.isArray(rawMessages) && rawMessages.length > 0
        ? rawMessages
        : config.value?.chatMsg?.trim()
          ? [config.value.chatMsg.trim()]
          : []

    const delayMin = Math.max(200, parseInt(config.value?.spammerDelayMin, 10) || 1500)
    const delayMax = Math.max(delayMin, parseInt(config.value?.spammerDelayMax, 10) || 3000)

    if (messages.length === 0) {
      if (spammerActive) {
        spammerTimeout = setTimeout(runSpammerTick, 1000)
      }
      return
    }

    const pattern = config.value?.spammerPattern || 'random'
    const converter = config.value?.messageConverter || 'none'
    const customFormatter = config.boolean?.customFormatter ?? config.boolean?.bypassChat ?? false
    const formatterPosition = config.value?.formatterPosition || 'suffix'
    const mps = parseInt(config.value?.spammerMps, 10) || 1

    // Resolve target bots cleanly
    const targetBots = resolveTargetBots()

    if (targetBots.length > 0) {
      for (let burst = 0; burst < mps; burst++) {
        if (!spammerActive) break
        spammerCounter++
        const nextMsg = getNextMessage(messages, pattern, spammerState)
        if (nextMsg) {
          for (let bIdx = 0; bIdx < targetBots.length; bIdx++) {
            if (!spammerActive) break
            const botInstance = targetBots[bIdx]
            const bUname = botInstance._client?.username || botInstance.username || 'Bot'
            await sendBotMessage(botInstance, nextMsg, {
              converter,
              customFormatter,
              formatterPosition,
              counter: spammerCounter,
              onSent: (formattedMsg) => {
                sendEvent(bUname, 'chat', formattedMsg)
              },
              onFailed: (_formattedMsg, _failedBot, reason) => {
                sendEvent(bUname, 'chat', `[Spammer send failed] ${reason}`)
              }
            })
            // Stagger sends across bots by 75ms so server anti-spam won't drop simultaneous packets
            if (targetBots.length > 1 && bIdx < targetBots.length - 1) {
              await delay(75)
            }
          }
        }
        if (mps > 1 && burst < mps - 1) {
          await delay(100)
        }
      }
    }

    if (spammerActive) {
      const nextDelay = crypto.randomInt(
        Math.min(delayMin, delayMax),
        Math.max(delayMin, delayMax) + 1
      )
      spammerTimeout = setTimeout(runSpammerTick, nextDelay)
    }
  }

  runSpammerTick()
}

function stopSpammerLoop() {
  spammerActive = false
  if (spammerTimeout) {
    clearTimeout(spammerTimeout)
    spammerTimeout = null
  }
  BrowserWindow.getAllWindows()[0]?.webContents.send('spammerStateChanged', false)
}

app.whenReady().then(() => {
  cleanOldTempDirs()
  migrateConfig()

  electronApp.setAppUserModelId('com.rattleshyper.trafficermc')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    optimizer.registerFramelessWindowIpc(window)
  })

  createMainWindow()
})

ipcMain.on('setConfig', (event, type, id, value) => {
  if (!cachedConfig[type]) cachedConfig[type] = {}
  cachedConfig[type][id] = value
  debouncedStoreSave()
})

ipcMain.on('deleteConfig', () => {
  cachedConfig = { value: {}, boolean: {} }
  try {
    store.delete('config')
  } catch (_) {}
})

ipcMain.on('checkboxClick', (event, id, state) => {
  switch (id) {
    case 'test':
      console.log(state)
      break
    default:
  }
})

ipcMain.on('btnClick', async (event, btn) => {
  switch (btn) {
    case 'btnStart':
      connectBot()
      break
    case 'btnStop':
      stopBot = true
      clearRejoinTimers()
      notify('Info', 'Stopped sending bots.', 'success')
      break
    case 'btnChat':
      const currentChatMsg = storeinfo()?.value?.chatMsg || ''
      if (currentChatMsg.trim()) {
        exeAll('chat ' + currentChatMsg)
      } else {
        notify('Warning', 'Please enter a message or command to send', 'error')
      }
      break
    case 'btnStartSpammer':
      startSpammerLoop()
      notify('Spammer', 'Spammer started', 'success')
      break
    case 'btnStopSpammer':
      stopSpammerLoop()
      notify('Spammer', 'Spammer stopped', 'success')
      break
    case 'btnDisconnect':
      stopBot = true
      clearRejoinTimers()
      exeAll('disconnect')
      consoleManager.reset()
      sendEvent('System', 'console_lead', { leadBot: null, isFirst: false })
      sendEvent('System', 'clearBots', '')
      break
    case 'btnSetHotbar':
      exeAll('sethotbar ' + storeinfo().value.hotbarSlot)
      break
    case 'btnUseheld':
      exeAll('useheld')
      break
    case 'btnWinClickRight':
      exeAll('winclick ' + storeinfo().value.invSlot + ' 1')
      break
    case 'btnWinClickLeft':
      exeAll('winclick ' + storeinfo().value.invSlot + ' 0')
      break
    case 'btnDropSlot':
      exeAll('drop ' + storeinfo().value.invSlot)
      break
    case 'btnDropAll':
      exeAll('dropall')
      break
    case 'btnCloseWindow':
      exeAll('closewindow')
      break
    case 'btnStartMove':
      exeAll('startmove ' + storeinfo().value.moveType)
      break
    case 'btnStopMove':
      exeAll('stopmove ' + storeinfo().value.moveType)
      break
    case 'btnResetMove':
      exeAll('resetmove')
      break
    case 'btnLook':
      exeAll('look ' + storeinfo().value.lookDirection)
      break
    case 'btnAfkOn':
      exeAll('afkon')
      break
    case 'btnAfkOff':
      exeAll('afkoff')
      break
    case 'runScript': {
      const targetBots = resolveTargetBots()
      if (targetBots.length === 0) {
        notify('Warning', 'No active bots connected to run script', 'error')
        break
      }
      notify('Script', `Running script on ${targetBots.length} bot(s)...`, 'success')
      for (let i = 0; i < targetBots.length; i++) {
        const b = targetBots[i]
        const uname = b._client?.username || b.username || 'Bot'
        startScript(uname)
        if (targetBots.length > 1 && i < targetBots.length - 1) {
          await delay(60)
        }
      }
      break
    }
    case 'stopScript':
      stopScript = true
      notify('Script', 'Script execution stopped', 'info')
      break
    case 'proxyTestStart':
      testProxy(storeinfo().value.proxyList)
      break
    case 'proxyTestStop':
      stopProxyTest = true
      proxyEvent('', 'stop', '', '')
      break
    case 'proxyScrape':
    case 'proxyDownloadWeb':
      if (storeinfo().value.proxyType === 'none')
        return notify('Error', 'Select proxy type (HTTP, SOCKS4, SOCKS5)', 'error')
      notify('Info', 'Downloading live proxies from web...', 'success')
      setProxy()
      break
    default:
      break
  }
})

ipcMain.on('sendChat', (event, message) => {
  if (!message || !message.trim()) return
  if (!cachedConfig.value) cachedConfig.value = {}
  cachedConfig.value.chatMsg = message
  debouncedStoreSave()
  exeAll('chat ' + message)
})

ipcMain.on('spammerStart', () => {
  startSpammerLoop()
  notify('Spammer', 'Spammer started', 'success')
})

ipcMain.on('spammerStop', () => {
  stopSpammerLoop()
  notify('Spammer', 'Spammer stopped', 'success')
})

function setProxy() {
  const pType = storeinfo().value.proxyType || 'socks5'
  const pSource = storeinfo().value.proxySource || 'all'
  const pAnonymity = storeinfo().value.proxyAnonymity || 'all'
  const pCustomUrls = storeinfo().value.customProxyUrls || ''

  scrapeProxy({
    proxyType: pType,
    proxySource: pSource,
    proxyAnonymity: pAnonymity,
    customProxyUrls: pCustomUrls
  })
    .then((result) => {
      const count = result ? result.trim().split(/\r?\n/).filter(Boolean).length : 0
      proxyEvent('', 'scraped', result, '')
      notify(
        'Success',
        `Downloaded ${count} live ${pType.toUpperCase()} proxies (${pSource})!`,
        'success'
      )
    })
    .catch((err) => {
      console.log(err)
      notify('Error', 'Failed to scrape proxies', 'error')
    })
}

async function testProxy(list) {
  stopProxyTest = false
  const server = storeinfo().value.server
  const [serverHost, serverPort] = server.split(':')
  if (!serverHost) return notify('Error', 'Invalid server address', 'error')
  if (!list) return notify('Error', 'Please enter proxy list', 'error')
  if (storeinfo().value.proxyType === 'none') return notify('Error', 'Select proxy type', 'error')
  notify('Info', 'Testing proxies...', 'success')
  proxyEvent('', 'start', '', '')
  const lines = list.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (stopProxyTest) break
    const count = `${i + 1}/${lines.length}`
    const [host, port, username, password] = lines[i].split(':')
    checkProxy(
      storeinfo().value.proxyType,
      host,
      port,
      username,
      password,
      serverHost,
      serverPort || 25565,
      storeinfo().value.proxyCheckTimeout || 5000
    )
      .then((result) => {
        proxyEvent(result.proxy, 'success', '', count)
      })
      .catch((error) => {
        proxyEvent(error.proxy, 'fail', error.reason, count)
      })
    if (lines.length == i + 1) {
      proxyEvent('', 'stop', '', '')
    }
    await delay(storeinfo().value.proxyCheckDelay || 100)
  }
}

function dispatchBotCommand(username, command, args) {
  const bot = getBot(username)
  if (bot && typeof bot._actionHandler === 'function') {
    bot._actionHandler(command, args)
  } else {
    botApi.emit('botEvent', username, command, args)
  }
}

async function startScript(username) {
  stopScript = false
  if (!storeinfo().value?.scriptText) return
  const scriptLines = storeinfo().value.scriptText.split(/\r?\n/)
  for (let i = 0; i < scriptLines.length; i++) {
    if (stopScript) break
    const rawLine = scriptLines[i].trim()
    if (!rawLine || rawLine.startsWith('#') || rawLine.startsWith('//')) continue

    // Direct slash command support: e.g. "/login 123456" or "/spawn"
    if (rawLine.startsWith('/')) {
      dispatchBotCommand(username, 'command', [rawLine])
      await delay(120)
      continue
    }

    const args = rawLine.split(/\s+/)
    const command = args.shift().toLowerCase()

    switch (command) {
      case 'delay':
      case 'wait':
      case 'sleep':
        await delay(parseInt(args[0], 10) || 1000)
        break
      case 'command':
      case 'cmd': {
        const fullCmd = args.join(' ')
        dispatchBotCommand(username, 'command', [fullCmd])
        await delay(120)
        break
      }
      case 'chat':
      case 'say':
      case 'msg': {
        const msg = args.join(' ')
        dispatchBotCommand(username, 'chat', [msg])
        await delay(120)
        break
      }
      case 'hotbar':
      case 'sethotbar':
        dispatchBotCommand(username, 'sethotbar', [args[0] || '0'])
        break
      case 'use':
      case 'useheld':
      case 'activate':
        dispatchBotCommand(username, 'useheld', [])
        break
      case 'winclick':
        dispatchBotCommand(username, 'winclick', [args[0] || '0', args[1] || '0'])
        break
      case 'closewindow':
        dispatchBotCommand(username, 'closewindow', [])
        break
      case 'drop':
        dispatchBotCommand(username, 'drop', [args[0] || '0'])
        break
      case 'dropall':
        dispatchBotCommand(username, 'dropall', [])
        break
      case 'startmove':
        dispatchBotCommand(username, 'startmove', [args[0] || 'forward'])
        break
      case 'stopmove':
        dispatchBotCommand(username, 'stopmove', [args[0] || 'forward'])
        break
      case 'resetmove':
      case 'stop':
        dispatchBotCommand(username, 'resetmove', [])
        break
      case 'jump':
        dispatchBotCommand(username, 'startmove', ['jump'])
        await delay(350)
        dispatchBotCommand(username, 'stopmove', ['jump'])
        break
      case 'sneak':
        dispatchBotCommand(username, 'startmove', ['sneak'])
        break
      case 'unsneak':
        dispatchBotCommand(username, 'stopmove', ['sneak'])
        break
      case 'sprint':
        dispatchBotCommand(username, 'startmove', ['sprint'])
        break
      case 'unsprint':
        dispatchBotCommand(username, 'stopmove', ['sprint'])
        break
      case 'look':
        dispatchBotCommand(username, 'look', [args[0] || '0', args[1] || '0'])
        break
      case 'afk':
        if (args[0]?.toLowerCase() === 'off') {
          dispatchBotCommand(username, 'afkoff', [])
        } else {
          dispatchBotCommand(username, 'afkon', [])
        }
        break
      case 'afkon':
        dispatchBotCommand(username, 'afkon', [])
        break
      case 'afkoff':
        dispatchBotCommand(username, 'afkoff', [])
        break
      case 'respawn':
        dispatchBotCommand(username, 'respawn', [])
        break
      case 'disconnect':
      case 'quit':
        dispatchBotCommand(username, 'disconnect', [])
        break
      case 'hit':
      case 'attack':
        dispatchBotCommand(username, 'hit', [
          'true',
          'true',
          'true',
          'true',
          args[0] || '3.5',
          'true'
        ])
        break
      default:
        dispatchBotCommand(username, command, args.slice(0))
    }
  }
}

async function exeAll(command, explicitTargets = null) {
  if (!command) return
  const targetBots = resolveTargetBots(explicitTargets)
  if (!targetBots || targetBots.length === 0) {
    return notify('Warning', 'No active bots connected or selected', 'error')
  }

  const cmd = command.split(' ')
  const action = cmd[0]
  const args = cmd.slice(1)
  const isLinear = storeinfo().boolean?.isLinear
  const linearDelay = storeinfo().value?.linearDelay || 100
  const staggerDelay = isLinear ? linearDelay : targetBots.length > 1 ? 60 : 0

  for (let i = 0; i < targetBots.length; i++) {
    const bot = targetBots[i]
    const bUname = bot._client?.username || bot.username || 'Bot'
    if (bot && typeof bot._actionHandler === 'function') {
      bot._actionHandler(action, args)
    } else {
      botApi.emit('botEvent', bUname, action, args)
    }
    if (staggerDelay > 0 && i < targetBots.length - 1) {
      await delay(staggerDelay)
    }
  }
}

async function startFile() {
  BrowserWindow.getAllWindows()[0].webContents.send('showBottab')
  const filePath = storeinfo().namefile
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)
  const count = storeinfo().value.botMax || lines.length

  for (let i = 0; i < count; i++) {
    if (stopBot) break
    newBot(getBotInfo(lines[i]))
    await delay(storeinfo().value.joinDelay || 1000)
  }
}

async function connectBot() {
  stopBot = false
  clearRejoinTimers()
  currentProxy = 0
  proxyUsed = 0
  const configuredVersion = storeinfo().value.version
  if (!isVersionSupported(configuredVersion)) {
    notify(
      'Unsupported protocol',
      `Minecraft ${configuredVersion} is not natively supported by the installed protocol stack. Use Auto Detect only with a supported server version.`,
      'error'
    )
    return
  }
  if (activeBots.size === 0) {
    consoleManager.reset()
    sendEvent('System', 'console_lead', { leadBot: null, isFirst: false })
  }
  const count = storeinfo().value.botMax || 1

  if (storeinfo().value.nameType === 'file' && storeinfo().namefile) {
    BrowserWindow.getAllWindows()[0].webContents.send('showBottab')
  } else if (storeinfo().value.nameType !== 'file' && storeinfo().value.nameType !== 'default') {
    BrowserWindow.getAllWindows()[0].webContents.send('showBottab')
  }

  for (let i = 0; i < count; i++) {
    if (stopBot) break

    let botInfo

    switch (storeinfo().value.nameType) {
      case 'random':
        botInfo = getBotInfo(salt(10))
        break
      case 'legit':
        botInfo = getBotInfo(genName())
        break
      case 'file':
        if (!storeinfo().namefile) {
          notify('Error', 'Please select name file', 'error')
        } else {
          startFile()
        }
        return
      default:
        if (!storeinfo().value.username) return notify('Error', 'Please insert username', 'error')
        const username =
          count == 1 ? storeinfo().value.username : storeinfo().value.username + '_' + i
        botInfo = getBotInfo(username)
        if (i == 0) BrowserWindow.getAllWindows()[0].webContents.send('showBottab')
    }

    newBot(botInfo)
    await delay(storeinfo().value.joinDelay || 1000)
  }
}

function getBotInfo(botName) {
  const server = storeinfo().value.server || 'localhost:25565'
  const [serverHost, serverPort] = server.split(':')
  const parsedPort = parseInt(serverPort) || 25565

  const options = {
    host: serverHost,
    port: parsedPort,
    username: botName,
    version: resolveBotVersion(storeinfo().value.version),
    auth: storeinfo().value.authType,
    hideErrors: true,
    joinMessage: storeinfo().value.joinMessage,
    ...botMode(storeinfo().value.botMode),
    ...getProxy(storeinfo().value.proxyType)
  }

  if (options.auth === 'easymc') {
    options.auth = easyMcAuth
    options.sessionServer = 'https://sessionserver.easymc.io'
  }

  return options
}

function getProxy(proxyType) {
  if (proxyType === 'none' || !storeinfo().value.proxyList) return

  const proxyList = storeinfo().value.proxyList.split(/\r?\n/)
  const randomIndex = crypto.randomInt(0, proxyList.length)

  const proxyPerBot = storeinfo().value.proxyPerBot

  if (proxyUsed >= proxyPerBot) {
    proxyUsed = 0
    currentProxy++
    if (currentProxy >= proxyList.length) {
      currentProxy = 0
    }
  }

  proxyUsed++

  const index = storeinfo().boolean.randomizeOrder ? randomIndex : currentProxy
  const [host, port, username, password] = proxyList[index].split(':')
  return {
    protocol: proxyType,
    proxyHost: host,
    proxyPort: port,
    proxyUsername: username,
    proxyPassword: password
  }
}

function newBot(options) {
  let bot

  if (options.auth === 'easymc') {
    if (options.easyMcToken?.length !== 20) {
      return sendEvent(options.username, 'easymcAuth')
    }
    options.auth = easyMcAuth
    options.sessionServer ||= 'https://sessionserver.easymc.io'
  }

  const connectProxy = async (client) => {
    try {
      const socket = await connection(
        storeinfo().value.proxyType,
        options.proxyHost,
        options.proxyPort,
        options.proxyUsername,
        options.proxyPassword,
        options.host,
        options.port
      )
      client.setSocket(socket)
      client.emit('connect')
    } catch (error) {
      if (storeinfo().boolean.proxyLogChat) {
        sendEvent(
          client.username,
          'chat',
          options.proxyHost + ':' + options.proxyPort + ' ' + error
        )
      }
      client.emit(
        'error',
        new Error(`Proxy connection failed (${options.proxyHost}:${options.proxyPort}): ${error}`)
      )
      client.end('Proxy connection failed')
      return
    }
  }

  if (storeinfo().value.proxyType !== 'none') {
    options.connect = connectProxy
  }

  bot = mineflayer.createBot({
    ...options,
    plugins: {
      anvil: false,
      book: false,
      boss_bar: false,
      breath: false,
      chest: false,
      command_block: false,
      craft: false,
      creative: false,
      enchantment_table: false,
      experience: false,
      explosion: false,
      fishing: false,
      furnace: false,
      generic_place: false,
      painting: false,
      particle: false,
      place_block: false,
      place_entity: false,
      rain: false,
      ray_trace: false,
      scoreboard: false,
      sound: false,
      tablist: false,
      team: false,
      time: false,
      title: false,
      villager: false,
      ...(options.plugins || {})
    },
    onMsaCode: (data) => {
      sendEvent(options.username, 'authmsg', data.user_code)
    }
  })

  const isAutoAuth = storeinfo()?.boolean?.autoAuth ?? false
  const authPassword = storeinfo()?.value?.authPassword || 'trafficermc123a'
  if (isAutoAuth) {
    bot.loadPlugin((b) => autoAuth(b, { enabled: true, password: authPassword }))
  }

  // Pre-register bot under initial names
  if (options.username) activeBots.set(options.username, bot)
  if (bot.username) activeBots.set(bot.username, bot)

  let hitTimer = 0

  bot.once('login', () => {
    const uname = bot._client?.username || bot.username || options.username
    activeBots.set(uname, bot)
    if (bot._client?.username) activeBots.set(bot._client.username, bot)
    if (bot.username) activeBots.set(bot.username, bot)
    if (options.username) activeBots.set(options.username, bot)

    const leadInfo = consoleManager.onBotConnected(uname)
    sendEvent(uname, 'login', {
      isLead: consoleManager.isLeadBot(uname),
      leadBot: leadInfo.primaryBot
    })
    if (leadInfo.leadChanged) {
      sendEvent(leadInfo.primaryBot, 'console_lead', {
        leadBot: leadInfo.primaryBot,
        isFirst: leadInfo.isNewLead
      })
    }

    if (storeinfo().boolean?.runOnConnect) {
      startScript(uname)
    }
    if (storeinfo().value?.joinMessage) {
      sendBotMessage(bot, storeinfo().value.joinMessage, {
        onSent: (m) => sendEvent(uname, 'chat', m),
        onFailed: (_message, _failedBot, reason) =>
          sendEvent(uname, 'chat', `[Join message failed] ${reason}`)
      })
    }
  })
  bot.once('spawn', () => {
    bot.loadPlugin(antiafk)
  })
  bot.on('spawn', () => {
    if (storeinfo().boolean.runOnSpawn) {
      startScript(bot._client?.username || bot.username || options.username)
    }
  })

  // Proxy/backend transition handler. Listen to the protocol event once; Mineflayer
  // derives its own `respawn` event from the same packet.
  const handleServerRespawn = (packet) => {
    const uname = bot._client?.username || bot.username || options.username

    const dimName = packet?.worldName || packet?.dimension || 'sub-server'
    const transferMsg = `[System] Server transfer (Respawn) detected. Destination: ${dimName}. Synchronizing state...`
    const evalRes = consoleManager.evaluateMessage(transferMsg, uname)
    if (evalRes.allowed) {
      sendEvent(uname, 'server_chat', transferMsg)
    }

    if (consoleManager.isLeadBot(uname)) {
      sendEvent(uname, 'console_lead', {
        leadBot: uname,
        serverSwitch: true
      })
    }
  }

  if (bot._client) {
    bot._client.on('respawn', handleServerRespawn)
  }
  bot.on('messagestr', (msg) => {
    const uname = bot._client?.username || bot.username || options.username
    const evalRes = consoleManager.evaluateMessage(msg, uname)
    if (!evalRes.allowed) {
      return
    }

    if (evalRes.isPrivate) {
      sendEvent(uname, 'whisper', msg)
    } else {
      sendEvent(uname, 'server_chat', msg)
    }
  })
  bot.on('windowOpen', (window) => {
    sendEvent(
      bot._client?.username || bot.username || options.username,
      'chat',
      `Window Opened ' ${window.title ? ':' + window.title : ''}`
    )
  })
  bot.on('windowClose', (window) => {
    sendEvent(
      bot._client?.username || bot.username || options.username,
      'chat',
      `Window Closed ' ${window.title ? ':' + window.title : ''}`
    )
  })
  bot.once('kicked', (reason) => {
    const uname = bot._client?.username || bot.username || options.username
    activeBots.delete(uname)
    if (options.username) activeBots.delete(options.username)
    if (bot.username) activeBots.delete(bot.username)
    if (bot._client?.username) activeBots.delete(bot._client.username)

    const disconnectInfo = consoleManager.onBotDisconnected(uname)
    let kickReason = String(reason)
    try {
      const parsed =
        typeof reason === 'string' && reason.startsWith('{') ? JSON.parse(reason) : reason
      kickReason = cleanText(parsed)
    } catch (_) {}

    sendEvent(uname, 'kicked', kickReason)

    if (disconnectInfo.leadChanged) {
      sendEvent(disconnectInfo.newLead || 'System', 'console_lead', {
        oldLead: uname,
        leadBot: disconnectInfo.newLead,
        failover: true
      })
    }
  })
  bot.once('end', (reason) => {
    const uname = bot._client?.username || bot.username || options.username
    activeBots.delete(uname)
    if (options.username) activeBots.delete(options.username)
    if (bot.username) activeBots.delete(bot.username)
    if (bot._client?.username) activeBots.delete(bot._client.username)

    const disconnectInfo = consoleManager.onBotDisconnected(uname)
    sendEvent(uname, 'end', String(reason || 'Disconnected'))

    if (disconnectInfo.leadChanged) {
      sendEvent(disconnectInfo.newLead || 'System', 'console_lead', {
        oldLead: uname,
        leadBot: disconnectInfo.newLead,
        failover: true
      })
    }

    if (storeinfo().boolean?.autoReconnect && !stopBot) {
      const rejoinDelay = getRandomRejoinDelay(storeinfo().value)
      sendEvent(
        uname,
        'chat',
        `[Reconnect] Waiting ${(rejoinDelay / 1000).toFixed(1)}s before the next attempt.`
      )
      const timer = setTimeout(() => {
        rejoinTimers.delete(timer)
        if (!stopBot && storeinfo().boolean?.autoReconnect) newBot(options)
      }, rejoinDelay)
      rejoinTimers.add(timer)
    }
  })

  bot.on('physicTick', () => {
    if (!cachedConfig.boolean?.killauraToggle) return
    const uname = bot._client?.username || options.username
    if (!isBotSelected(uname)) return
    killaura()
  })

  function killaura() {
    if (hitTimer <= 0) {
      const b = cachedConfig.boolean || {}
      const v = cachedConfig.value || {}
      hit(
        b.targetPlayer,
        b.targetVehicle,
        b.targetMob,
        b.targetAnimal,
        v.killauraRange || 3.5,
        b.killauraRotate
      )
      hitTimer = v.killauraDelay || 10
    } else {
      hitTimer--
    }
  }

  function hit(player, vehicle, mob, animal, maxDistance, rotate) {
    let targetEntities = []
    const entities = Object.values(bot.entities || {})
    entities.forEach((entity) => {
      if (!entity || !entity.position || !bot.entity?.position) return
      const distance = bot.entity.position.distanceTo(entity.position)
      if (distance >= parseFloat(maxDistance)) return
      if (entity.type === 'player' && entity.username !== bot.username && player) {
        targetEntities.push(entity)
      }
      if (entity.kind === 'Vehicles' && vehicle) {
        targetEntities.push(entity)
      }
      if (entity.kind === 'Hostile mobs' && mob) {
        targetEntities.push(entity)
      }
      if (entity.kind === 'Passive mobs' && animal) {
        targetEntities.push(entity)
      }
    })
    targetEntities.forEach((entity) => {
      if (rotate) {
        bot.lookAt(entity.position, true)
        bot.attack(entity)
      } else {
        bot.attack(entity)
      }
    })
  }

  const handleBotAction = (event, optionsArray = []) => {
    const arr = Array.isArray(optionsArray) ? optionsArray : [optionsArray]
    switch (event) {
      case 'chat': {
        const rawMsg = arr.join(' ')
        const isCommand = rawMsg.trim().startsWith('/')
        // Bottom spammer modules only affect manual chat if formatManualChat is explicitly enabled (default false).
        // Commands starting with '/' are always sent as pure commands without tags or converters.
        const formatManual = !isCommand && (storeinfo()?.boolean?.formatManualChat ?? false)
        const spamOpts = formatManual
          ? {
              converter: storeinfo()?.value?.messageConverter || 'none',
              customFormatter:
                storeinfo()?.boolean?.customFormatter ?? storeinfo()?.boolean?.bypassChat ?? false,
              formatterPosition: storeinfo()?.value?.formatterPosition || 'suffix',
              bypass: storeinfo()?.boolean?.bypassChat ?? false
            }
          : {}
        const bUname = bot._client?.username || bot.username || options.username
        sendBotMessage(bot, rawMsg, {
          ...spamOpts,
          onSent: (formattedMsg) => {
            sendEvent(bUname, 'chat', formattedMsg)
          },
          onFailed: (_formattedMsg, _failedBot, reason) => {
            sendEvent(bUname, 'chat', `[Send failed] ${reason}`)
          }
        })
        break
      }
      case 'command': {
        const rawCmd = arr.join(' ')
        const fullCmd = rawCmd.startsWith('/') ? rawCmd : '/' + rawCmd
        const bUname = bot._client?.username || bot.username || options.username
        sendBotMessage(bot, fullCmd, {
          onSent: (formattedMsg) => {
            sendEvent(bUname, 'chat', formattedMsg)
          },
          onFailed: (_formattedMsg, _failedBot, reason) => {
            sendEvent(bUname, 'chat', `[Command failed] ${reason}`)
          }
        })
        break
      }
      case 'notify':
        notify(
          'Bot',
          (bot._client?.username || options.username) +
            ': ' +
            arr
              .join(' ')
              .replaceAll('{random}', salt(4))
              .replaceAll('{player}', bot._client?.username || options.username),
          'success'
        )
        break
      case 'sethotbar':
        bot.setQuickBarSlot(parseInt(arr[0] ? arr[0] : 0, 10))
        break
      case 'useheld':
        bot.activateItem()
        break
      case 'winclick':
        bot.clickWindow(parseInt(arr[0], 10), parseInt(arr[1], 10), 0)
        break
      case 'drop':
        bot.clickWindow(-999, 0, 0)
        bot.clickWindow(parseInt(arr[0], 10), 0, 0)
        bot.clickWindow(-999, 0, 0)
        break
      case 'dropall':
        ;(async () => {
          const itemCount = bot.inventory ? bot.inventory.items().length : 0
          for (let i = 0; i < itemCount; i++) {
            if (!bot.inventory || bot.inventory.items().length === 0) return
            const item = bot.inventory.items()[0]
            bot.tossStack(item)
            await delay(10)
          }
        })()
        break
      case 'closewindow':
        bot.closeWindow(bot.currentWindow || '')
        break
      case 'startmove':
        bot.setControlState(arr[0], true)
        break
      case 'stopmove':
        bot.setControlState(arr[0], false)
        break
      case 'resetmove':
        bot.clearControlStates()
        break
      case 'look':
        bot.look(parseFloat(arr[0]), 0, true)
        break
      case 'afkon':
        bot.afk.start()
        break
      case 'afkoff':
        bot.afk.stop()
        break
      case 'respawn':
        if (typeof bot.respawn === 'function') {
          try {
            bot.respawn()
          } catch (_) {}
        }
        break
      case 'disconnect':
      case 'quit':
        try {
          if (typeof bot.quit === 'function') {
            bot.quit()
          } else if (bot._client && typeof bot._client.end === 'function') {
            bot._client.end()
          }
        } catch (_) {}
        break
      case 'hit':
        const player = arr[0]
        const vehicle = arr[1]
        const mob = arr[2]
        const animal = arr[3]
        const maxDistance = parseFloat(arr[4])
        const rotate = arr[5]
        hit(player, vehicle, mob, animal, maxDistance, rotate)
        break
      default:
        break
    }
  }

  bot._actionHandler = handleBotAction

  botApi.on('botEvent', (target, event, ...eventArgs) => {
    const currentName = bot._client?.username || bot.username || options.username
    if (
      target !== currentName &&
      target !== options.username &&
      target !== bot.username &&
      target !== bot._client?.username
    ) {
      return
    }
    handleBotAction(event, eventArgs[0])
  })
}

process.on('uncaughtException', (err) => {
  console.log(err)
})
process.on('UnhandledPromiseRejectionWarning', (err) => {
  console.log(err)
})
