import { contextBridge, ipcRenderer } from 'electron'

const sendChannels = new Set([
  'loaded',
  'setConfig',
  'playerList',
  'open',
  'deleteConfig',
  'checkboxClick',
  'btnClick',
  'sendChat',
  'spammerStart',
  'spammerStop',
  'win:invoke'
])
const receiveChannels = new Set([
  'setConfig',
  'fileSelected',
  'showBottab',
  'initConfig',
  'spammerStateChanged',
  'notify',
  'proxyEvent',
  'botEvent'
])
const invokeChannels = new Set(['config:get'])

function assertChannel(allowedChannels, channel) {
  if (!allowedChannels.has(channel)) throw new Error(`Blocked IPC channel: ${channel}`)
}

const electronAPI = {
  ipcRenderer: {
    send(channel, ...args) {
      assertChannel(sendChannels, channel)
      ipcRenderer.send(channel, ...args)
    },
    invoke(channel, ...args) {
      assertChannel(invokeChannels, channel)
      return ipcRenderer.invoke(channel, ...args)
    },
    on(channel, listener) {
      assertChannel(receiveChannels, channel)
      const subscription = (_event, ...args) => listener({}, ...args)
      ipcRenderer.on(channel, subscription)
      return () => ipcRenderer.removeListener(channel, subscription)
    }
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
} else {
  window.electron = electronAPI
}
