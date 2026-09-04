import { isNewerRelease } from '../../shared/releaseVersion.js'

window.addEventListener('DOMContentLoaded', () => {
  let versionCheckStarted = false

  const checkForUpdates = (currentVersion) => {
    if (versionCheckStarted) return
    versionCheckStarted = true
    window.electron?.ipcRenderer
      .invoke('version:getLatest')
      .then((latestVersion) => {
        if (latestVersion && isNewerRelease(latestVersion, currentVersion)) {
          notify(
            'Update available',
            `TrafficerMC ${latestVersion} is available on GitHub.`,
            'warning'
          )
        }
      })
      .catch(() => {})
  }

  const applyStoredConfig = (config, version) => {
    setConfigValues(config)
    checkForUpdates(version.current)
    document.getElementById('versionString').textContent = `v${version.current}`
  }

  // Keep the event listener for older main-process builds, but request the
  // configuration only after handlers exist so a fast packaged build cannot
  // deliver it before the renderer is listening.
  window.electron?.ipcRenderer.on('setConfig', (event, config, version) => {
    applyStoredConfig(config, version)
  })
  window.electron?.ipcRenderer
    .invoke('config:get')
    .then(({ config, version }) => applyStoredConfig(config, version))
    .catch((error) => console.error('[Config] Unable to load saved settings.', error))
  window.electron?.ipcRenderer.send('loaded')

  window.electron?.ipcRenderer.on('fileSelected', (event, id, path) => {
    const filename = path.match(/[^\\]+$/)[0]
    document.getElementById(id).textContent = filename
  })

  window.electron?.ipcRenderer.on('showBottab', () => {
    document.getElementById('bottingTab').click()
  })

  const valueElements = document.querySelectorAll(
    'input[type="text"], input[type="number"], input[type="range"], select, textarea'
  )
  valueElements.forEach((select) => {
    select.addEventListener('change', valueChange)
  })

  const checkboxElements = document.querySelectorAll('input[type="checkbox"]')
  checkboxElements.forEach((check) => {
    check.addEventListener('click', checkboxClick)
  })

  const buttonElements = document.querySelectorAll('button, .button')
  buttonElements.forEach((button) => {
    button.addEventListener('click', buttonClick)
  })

  const tabElements = document.querySelectorAll('.tab, .tab-2')
  tabElements.forEach((tab) => {
    tab.addEventListener('click', navClick)
  })

  window.electron?.ipcRenderer.on('initConfig', () => {
    window.electron?.ipcRenderer.send('setConfig', 'value', 'spammerMessages', spammerMessages)
    valueElements.forEach((select) => {
      if (!select.id) return
      window.electron?.ipcRenderer.send('setConfig', 'value', select.id, select.value)
    })
    checkboxElements.forEach((check) => {
      if (!check.id) return
      window.electron?.ipcRenderer.send('setConfig', 'boolean', check.id, check.checked)
    })
  })

  // Spammer state change listener from main process
  window.electron?.ipcRenderer.on('spammerStateChanged', (event, active) => {
    const badge = document.getElementById('spammerBadge')
    if (badge) {
      if (active) {
        badge.className = 'spammer-badge-active'
        badge.innerHTML = 'SPAMMING...'
      } else {
        badge.className = 'spammer-badge-idle'
        badge.innerHTML = 'IDLE'
      }
    }
  })

  window.electron?.ipcRenderer.on('notify', (event, title, body, type, img, keep) => {
    notify(title, body, type, img, keep)
  })

  window.electron?.ipcRenderer.on('proxyEvent', (event, info) => {
    if (info.event === 'scraped') {
      logProxy('Scraped', 'success', '')
    } else {
      logProxy(info.proxy, info.event, info.message)
    }
    document.getElementById('proxyCheckStatusCount').textContent = info.count
    switch (info.event) {
      case 'start':
        document.getElementById('proxyCheckStatus').style.display = 'block'
        document.getElementById('proxyList').value = ''
        break
      case 'stop':
        document.getElementById('proxyCheckStatus').style.display = 'none'
        notify('Info', 'Stopped proxy test.', 'success')
        updateProxyList()
        break
      case 'success':
        document.getElementById('proxyList').value += `${info.proxy}\n`
        updateProxyList()
        break
      case 'scraped':
        document.getElementById('proxyList').value += `\n${info.message}\n`
        clearProxyEmpty()
        updateProxyList()
        break
      default:
    }
  })

  function updateConsoleLeadUI(leadBot) {
    const badge = document.getElementById('consoleLeadBadge')
    const text = document.getElementById('consoleLeadText')
    if (!badge || !text) return

    if (leadBot) {
      badge.className = 'console-lead-badge active'
      text.textContent = `Lead: ${leadBot}`
      text.title = `Synchronized console messages streamed from ${leadBot}`
    } else {
      badge.className = 'console-lead-badge idle'
      text.textContent = 'Console: Idle'
      text.title = 'No active lead bot connected'
    }
  }

  window.electron?.ipcRenderer.on('botEvent', (event, info) => {
    switch (info.event) {
      case 'console_lead': {
        const lead = typeof info.message === 'object' ? info.message.leadBot : info.id
        const isFailover = typeof info.message === 'object' ? info.message.failover : false
        updateConsoleLeadUI(lead, isFailover)
        if (isFailover) {
          logConsole(
            'System',
            `Console lead failover: [${info.message.oldLead || 'Disconnected'}] -> [${lead || 'None'}]`,
            'line-system'
          )
        }
        break
      }
      case 'server_chat':
        logConsole('Server/INFO', info.message, 'line-server', info.id)
        break
      case 'whisper':
        logConsole(`PM -> ${info.id}`, info.message, 'line-whisper', info.id)
        break
      case 'bot_sent':
        logConsole(`Bot/${info.id}`, info.message, 'line-bot', info.id)
        break
      case 'login': {
        addPlayer(info.id)
        const isLead = typeof info.message === 'object' && info.message?.isLead
        logConsole(
          'System',
          `${info.id} connected to server.${isLead ? ' (Lead Console)' : ''}`,
          'line-system',
          info.id
        )
        if (typeof info.message === 'object' && info.message?.leadBot) {
          updateConsoleLeadUI(info.message.leadBot)
        }
        break
      }
      case 'authmsg':
        directChat(
          `<div class="space-h"><div class="flex"><p class="text-sm link">Auth</p></div><div class="space-h-f pl-2"><p class="text-sm" style="user-select: text;">${escapeHtml(info.id)}</p></div></div><p class="text-sm-2" style="user-select: text;"> First time signing in. Use a web browser to open the page <a href="https://www.microsoft.com/link" target="_blank" rel="noreferrer" class="text-sm-2">https://www.microsoft.com/link</a> and enter the code: <span class="text-sm-2" style="border-bottom: solid 1px #a1a1a1; user-select: all;">${escapeHtml(info.message)}</span></p>`
        )
        break
      case 'easymcAuth':
        directChat(
          `<div class="space-h"><div class="flex"><p class="text-sm link">EasyMC</p></div><div class="space-h-f pl-2"><p class="text-sm" style="user-select: text;">Authentication</p></div></div><p class="text-sm-2" style="user-select: text;"> EasyMC authentication requires an alt token. Check <a href="https://easymc.io/get" target="_blank" rel="noreferrer" class="text-sm-2">https://easymc.io/get</a> to get a token.</p>`
        )
        break
      case 'chat':
        if (info.id && info.id !== 'Spammer' && info.id !== 'Executed') {
          logConsole(`Bot/${info.id}`, info.message, 'line-bot', info.id)
        } else {
          logConsole('Bot', info.message, 'line-bot', info.id)
        }
        break
      case 'kicked': {
        const kickMsg =
          typeof info.message === 'object'
            ? info.message.reason || JSON.stringify(info.message)
            : info.message
        logConsole('System/WARN', `${info.id} kicked: ${kickMsg}`, 'line-warn', info.id)
        removePlayer(info.id)
        break
      }
      case 'end': {
        const endMsg =
          typeof info.message === 'object'
            ? info.message.reason || JSON.stringify(info.message)
            : info.message
        logConsole('System', `${info.id} disconnected: ${endMsg}`, 'line-system', info.id)
        removePlayer(info.id)
        break
      }
      case 'clearBots': {
        clearAllPlayers()
        break
      }
      default:
    }
  })

  // Setup Spammer UI elements and keyboard triggers
  renderSpammerMessages()
  updateDelayDisplay()

  const chatInput = document.getElementById('chatMsg')
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const msg = chatInput.value.trim()
      if (msg) {
        window.electron?.ipcRenderer.send('sendChat', msg)
      }
    }
  })

  const newSpamInput = document.getElementById('newSpamMsg')
  newSpamInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSpamMessageFromInput()
    }
  })

  document.getElementById('spammerDelayMin')?.addEventListener('input', updateDelayDisplay)
  document.getElementById('spammerDelayMax')?.addEventListener('input', updateDelayDisplay)

  const autoSelectBox = document.getElementById('autoSelect')
  autoSelectBox?.addEventListener('change', (e) => {
    if (e.target.checked) {
      selectAll(true)
    }
  })

  // Script Preset Templates
  document.querySelectorAll('.script-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const template = btn.getAttribute('data-template')
      const scriptText = document.getElementById('scriptText')
      if (scriptText && template) {
        if (scriptText.value.trim().length > 0) {
          scriptText.value = scriptText.value.trimEnd() + '\n' + template
        } else {
          scriptText.value = template
        }
        scriptText.dispatchEvent(new Event('change'))
      }
    })
  })

  // Scripting Wiki Click-to-Insert
  const insertCommandToScript = (cmd) => {
    const scriptText = document.getElementById('scriptText')
    if (!scriptText || !cmd) return
    const currentVal = scriptText.value
    const start = scriptText.selectionStart
    const end = scriptText.selectionEnd

    if (start !== undefined && end !== undefined && start !== end) {
      scriptText.value = currentVal.substring(0, start) + cmd + currentVal.substring(end)
      scriptText.selectionStart = scriptText.selectionEnd = start + cmd.length
    } else if (currentVal.trim().length > 0) {
      scriptText.value = currentVal.trimEnd() + '\n' + cmd
    } else {
      scriptText.value = cmd
    }
    scriptText.dispatchEvent(new Event('change'))
    scriptText.focus()
  }

  document.querySelectorAll('.wiki-insert-btn, .wiki-cmd-badge').forEach((el) => {
    el.addEventListener('click', () => {
      const cmd = el.getAttribute('data-insert')
      if (cmd) {
        insertCommandToScript(cmd)
      }
    })
  })

  // Scripting Wiki Search / Filter
  const wikiSearch = document.getElementById('wikiSearchInput')
  wikiSearch?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim()
    const cards = document.querySelectorAll('.wiki-card')
    cards.forEach((card) => {
      const cmdText = (card.getAttribute('data-cmd') || '').toLowerCase()
      const contentText = card.textContent.toLowerCase()
      if (!query || cmdText.includes(query) || contentText.includes(query)) {
        card.style.display = 'flex'
      } else {
        card.style.display = 'none'
      }
    })
  })
})

let spammerMessages = []

function renderSpammerMessages() {
  const container = document.getElementById('spammerMsgListContainer')
  if (!container) return
  container.innerHTML = ''

  if (spammerMessages.length === 0) {
    const emptyMsg = document.createElement('p')
    emptyMsg.className = 'text-sm-2'
    emptyMsg.style = 'color: #64748b; font-style: italic; margin: 4px 0;'
    emptyMsg.textContent = 'No messages added yet. Add messages above.'
    container.appendChild(emptyMsg)
    return
  }

  spammerMessages.forEach((msg, idx) => {
    const card = document.createElement('div')
    card.className = 'spammer-msg-card'

    const span = document.createElement('span')
    span.textContent = msg
    card.appendChild(span)

    const del = document.createElement('span')
    del.className = 'spammer-msg-del'
    del.innerHTML = '×'
    del.title = 'Remove message'
    del.onclick = (e) => {
      e.stopPropagation()
      spammerMessages.splice(idx, 1)
      renderSpammerMessages()
      window.electron?.ipcRenderer.send('setConfig', 'value', 'spammerMessages', spammerMessages)
    }
    card.appendChild(del)

    container.appendChild(card)
  })
}

function addSpamMessageFromInput() {
  const input = document.getElementById('newSpamMsg')
  if (!input) return
  const val = input.value.trim()
  if (val) {
    spammerMessages.push(val)
    input.value = ''
    renderSpammerMessages()
    window.electron?.ipcRenderer.send('setConfig', 'value', 'spammerMessages', spammerMessages)
  }
}

function updateDelayDisplay() {
  const minInput = document.getElementById('spammerDelayMin')
  const maxInput = document.getElementById('spammerDelayMax')
  const display = document.getElementById('delayDisplay')
  if (!minInput || !maxInput || !display) return

  const min = parseInt(minInput.value, 10) || 1500
  const max = parseInt(maxInput.value, 10) || min
  display.innerHTML = `${min} - ${max} ms`
}

function valueChange(event) {
  const selectedValue = event.target.value
  const selectId = event.target.id
  window.electron?.ipcRenderer.send('setConfig', 'value', selectId, selectedValue)

  switch (selectId) {
    case 'nameType':
      checkUsername()
      break
    default:
  }
}

function buttonClick(event) {
  const buttonId = event.target.id
  switch (buttonId) {
    case 'minimize':
      window.electron?.ipcRenderer.send('win:invoke', 'min')
      break
    case 'close':
      window.electron?.ipcRenderer.send('win:invoke', 'close')
      break
    case 'resetConfig':
      window.electron?.ipcRenderer.send('deleteConfig')
      notify('Info', 'Config has been reset. Please restart the app', 'success')
      break
    case 'nameFileLabel':
      window.electron?.ipcRenderer.send('open', 'nameFileLabel', 'Name File')
      break
    case 'selectAll':
      selectAll(true)
      break
    case 'deselectAll':
      selectAll(false)
      break
    case 'proxyClearDupe':
      clearDupe()
      notify('Info', 'Cleared duplicate proxies', 'success')
      break
    case 'btnChat': {
      const chatVal = document.getElementById('chatMsg')?.value?.trim()
      if (chatVal) {
        window.electron?.ipcRenderer.send('sendChat', chatVal)
      } else {
        notify('Warning', 'Please enter a message or command to send', 'error')
      }
      break
    }
    case 'btnAddSpamMsg':
      addSpamMessageFromInput()
      break
    case 'btnStartSpammer':
      window.electron?.ipcRenderer.send('spammerStart')
      break
    case 'btnStopSpammer':
      window.electron?.ipcRenderer.send('spammerStop')
      break
    default:
      window.electron?.ipcRenderer.send('btnClick', buttonId)
      break
  }
}

function checkboxClick(event) {
  const checkId = event.target.id
  const state = event.target.checked
  window.electron?.ipcRenderer.send('setConfig', 'boolean', checkId, state)
  window.electron?.ipcRenderer.send('checkboxClick', checkId, state)
}

function navClick(event) {
  const navElement = event.currentTarget
  const classes = navElement.classList
  const navName = navElement.dataset.target || navElement.innerText.toLowerCase()
  const tabContent = document.getElementsByClassName(classes[1])

  Array.from(tabContent).forEach((content) => {
    if (!content.classList.contains(classes[0])) {
      content.style.display = 'none'
    }
  })

  const selectedContent = document.getElementById(navName)
  selectedContent.style.display = 'block'

  const tabs = document.getElementsByClassName(classes[0])
  Array.from(tabs).forEach((tab) => {
    tab.classList.remove('selected')
  })

  navElement.classList.add('selected')
}

function checkUsername() {
  const nameType = document.getElementById('nameType')
  const fileDiv = document.getElementById('nameFileDiv')

  const isFileBased = nameType.value === 'file'
  fileDiv.style.display = isFileBased ? 'block' : 'none'
}

function setConfigValues(obj) {
  if (!obj || typeof obj !== 'object') return
  for (const keyType of ['value', 'boolean']) {
    const entries = obj[keyType]
    if (!entries || typeof entries !== 'object') continue
    const keys = Object.keys(entries)
    for (const key of keys) {
      const element = document.getElementById(key)
      if (element) {
        if (keyType === 'value') {
          element.value = obj.value[key]
        } else if (keyType === 'boolean') {
          element.checked = obj.boolean[key]
        }
      }
    }
  }
  if (obj?.value?.spammerMessages && Array.isArray(obj.value.spammerMessages)) {
    spammerMessages = obj.value.spammerMessages
    renderSpammerMessages()
  }
  updateDelayDisplay()
  checkUsername()
}

function notify(title, body, type, img, keep) {
  const notification = document.createElement('li')
  notification.className = type

  const top = document.createElement('div')
  top.className = 'space-h'

  const topbar = document.createElement('div')
  topbar.className = 'flex'

  const titleText = document.createElement('p')
  titleText.className = 'text-sm'
  titleText.innerHTML = title
  topbar.appendChild(titleText)

  const closeDiv = document.createElement('div')
  const closeBtn = document.createElement('p')
  closeBtn.className = 'text-sm'
  closeBtn.innerHTML = 'X'
  closeBtn.onclick = () => rmNotification()
  closeDiv.appendChild(closeBtn)

  top.appendChild(topbar)
  top.appendChild(closeDiv)

  const bodyDiv = document.createElement('div')
  bodyDiv.className = 'n-message'
  const bodyText = document.createElement('p')
  bodyText.className = 'tip-sm'
  bodyText.innerText = body
  bodyDiv.appendChild(bodyText)
  if (img) {
    const imgTag = document.createElement('img')
    imgTag.src = img
    bodyDiv.appendChild(imgTag)
  }

  notification.appendChild(top)
  notification.appendChild(bodyDiv)

  document.getElementById('notifications').appendChild(notification)

  if (!keep) {
    const progress = document.createElement('div')
    progress.className = 'n-progress'
    notification.appendChild(progress)
    setTimeout(() => {
      rmNotification()
    }, 3000)
  }
  function rmNotification() {
    notification.classList.add('fade')
    setTimeout(() => {
      notification.remove()
    }, 300)
  }
}

let updateSelectedTimeout = null
function debouncedUpdateSelected() {
  if (updateSelectedTimeout) clearTimeout(updateSelectedTimeout)
  updateSelectedTimeout = setTimeout(() => {
    updateSelected()
  }, 40)
}

function addPlayer(name) {
  const list = document.getElementById('botList')
  if (!list || !name) return
  const cleanName = String(name).trim()

  // Prevent duplicate list items
  const existing = Array.from(list.children).find(
    (li) => li.dataset.username === cleanName || li.textContent.trim() === cleanName
  )
  if (existing) {
    existing.dataset.username = cleanName
    const auto = document.getElementById('autoSelect')?.checked ?? true
    if (auto) existing.classList.add('selected')
    updateBotCount()
    debouncedUpdateSelected()
    return
  }

  const auto = document.getElementById('autoSelect')?.checked ?? true
  const b = document.createElement('li')
  b.className = 'botListItem'
  b.dataset.username = cleanName
  if (auto) b.classList.add('selected')

  const check = document.createElement('span')
  check.className = 'bot-check'

  const nameSpan = document.createElement('span')
  nameSpan.className = 'bot-name'
  nameSpan.textContent = cleanName

  b.appendChild(check)
  b.appendChild(nameSpan)

  b.onclick = () => {
    b.classList.toggle('selected')
    updateBotCount()
    debouncedUpdateSelected()
  }

  list.appendChild(b)
  list.scrollTop = list.scrollHeight
  updateBotCount()
  debouncedUpdateSelected()
}

function removePlayer(name) {
  const list = document.querySelectorAll('.botListItem')
  const cleanName = String(name).trim()
  let changed = false
  list.forEach((bot) => {
    if (bot.dataset.username === cleanName || bot.textContent.trim() === cleanName) {
      bot.remove()
      changed = true
    }
  })
  if (changed) {
    updateBotCount()
    debouncedUpdateSelected()
  }
}

function clearAllPlayers() {
  const list = document.getElementById('botList')
  if (list) {
    list.innerHTML = ''
    updateBotCount()
    debouncedUpdateSelected()
  }
}

function updateBotCount() {
  const list = document.getElementById('botList')
  if (!list) return
  const total = list.children.length
  const selected = Array.from(list.children).filter((bot) =>
    bot.classList.contains('selected')
  ).length

  const badge = document.getElementById('botCountBadge')
  if (badge) {
    badge.textContent = `${selected} / ${total}`
  }

  const countLegacy = document.getElementById('botCount')
  if (countLegacy) {
    countLegacy.innerHTML = total
  }
}

function selectAll(forceState) {
  const list = document.getElementById('botList')
  if (!list) return
  const allSelected = Array.from(list.children).every((li) => li.classList.contains('selected'))
  const targetState = typeof forceState === 'boolean' ? forceState : !allSelected
  Array.from(list.children).forEach((bot) => {
    bot.classList.toggle('selected', targetState)
  })
  updateBotCount()
  updateSelected()
}

function updateSelected() {
  const list = document.getElementById('botList')
  if (!list) return
  const selectedBots = Array.from(list.children).filter((bot) => bot.classList.contains('selected'))
  const selectedNames = selectedBots
    .map(
      (bot) =>
        bot.dataset.username ||
        bot.querySelector('.bot-name')?.textContent?.trim() ||
        bot.textContent.trim()
    )
    .filter(Boolean)
  window.electron?.ipcRenderer.send('playerList', selectedNames)
}

let proxyScrollScheduled = false
function logProxy(proxy, type, message) {
  const scroll = document.getElementById('autoScrollProxy')?.checked
  const logBox = document.getElementById('proxyLogbox')
  if (!logBox) return

  while (logBox.children.length >= 250) {
    logBox.removeChild(logBox.firstChild)
  }

  const li = document.createElement('li')
  li.className = type
  const updiv = document.createElement('div')
  updiv.className = 'space-h'

  const ddiv = document.createElement('div')
  const msg = document.createElement('p')
  msg.className = 'text-sm-2 mu-1'
  msg.style = 'user-select: text;'
  msg.textContent = message
  ddiv.appendChild(msg)

  const pl = document.createElement('p')
  pl.style = 'user-select: text;'
  pl.className = 'text-sm'
  pl.textContent = proxy
  updiv.appendChild(pl)

  const pr = document.createElement('p')
  pr.className = 'text-sm'
  pr.textContent = type

  updiv.appendChild(pr)

  li.appendChild(updiv)
  li.appendChild(ddiv)

  logBox.appendChild(li)
  if (scroll && !proxyScrollScheduled) {
    proxyScrollScheduled = true
    requestAnimationFrame(() => {
      logBox.scrollTop = logBox.scrollHeight
      proxyScrollScheduled = false
    })
  }
}

function clearProxyEmpty() {
  const textarea = document.getElementById('proxyList')
  const lines = textarea.value.split('\n')
  const nonEmptyLines = lines.filter(function (line) {
    return line.trim() !== ''
  })
  textarea.value = nonEmptyLines.join('\n')
}

function clearDupe() {
  const textarea = document.getElementById('proxyList')
  const lines = textarea.value.split('\n')
  const uniqueLines = {}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    uniqueLines[line] = true
  }
  const uniqueLinesArray = Object.keys(uniqueLines)
  const result = uniqueLinesArray.join('\n')
  textarea.value = result
}

function updateProxyList() {
  window.electron?.ipcRenderer.send(
    'setConfig',
    'value',
    'proxyList',
    document.getElementById('proxyList').value
  )
}

const chatQueue = []
let chatFlushScheduled = false
const MAX_CHAT_NODES = 250
const MAX_CHAT_ITEMS_PER_FRAME = 75

function getLocalTimestamp() {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `[${h}:${m}:${s}]`
}

function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function flushChatQueue() {
  chatFlushScheduled = false
  const enable = document.getElementById('enableChat')?.checked
  if (!enable) {
    chatQueue.length = 0
    return
  }

  const chatBox = document.getElementById('chatBox')
  if (!chatBox || chatQueue.length === 0) return

  const scroll = document.getElementById('autoScrollChat')?.checked
  const itemsToRender = chatQueue.splice(0, MAX_CHAT_ITEMS_PER_FRAME)
  const fragment = document.createDocumentFragment()

  for (let i = 0; i < itemsToRender.length; i++) {
    const item = itemsToRender[i]
    const li = document.createElement('li')
    if (item.type === 'console') {
      li.className = item.lineClass || 'line-server'
      let tagClass = 'tag-server'
      if (item.lineClass === 'line-whisper') tagClass = 'tag-whisper'
      else if (item.lineClass === 'line-bot') tagClass = 'tag-bot'
      else if (item.lineClass === 'line-system') tagClass = 'tag-system'
      else if (item.lineClass === 'line-warn') tagClass = 'tag-warn'

      li.innerHTML = `<span class="console-ts">${escapeHtml(item.ts)}</span><span class="console-tag ${tagClass}">[${escapeHtml(item.tag)}]</span><span class="console-msg">${escapeHtml(item.text)}</span>`
    } else if (item.type === 'direct') {
      li.innerHTML = item.html
    } else {
      li.className = 'line-bot'
      li.innerHTML = `<span class="console-ts">${getLocalTimestamp()}</span><span class="console-tag tag-bot">[${escapeHtml(item.prefix || 'Bot')}${item.name ? '/' + escapeHtml(item.name) : ''}]</span><span class="console-msg">${escapeHtml(item.text)}</span>`
    }
    fragment.appendChild(li)
  }

  // Bulk prune older nodes before appending to prevent layout tree degradation
  const currentCount = chatBox.children.length
  const overflow = currentCount + itemsToRender.length - MAX_CHAT_NODES
  if (overflow > 0) {
    const removeCount = Math.min(overflow, currentCount)
    for (let i = 0; i < removeCount; i++) {
      chatBox.removeChild(chatBox.firstChild)
    }
  }

  // Single batched DOM insertion
  chatBox.appendChild(fragment)

  if (scroll) {
    chatBox.scrollTop = chatBox.scrollHeight
  }

  if (chatQueue.length > 0 && !chatFlushScheduled) {
    chatFlushScheduled = true
    requestAnimationFrame(flushChatQueue)
  }
}

function logConsole(tag, text, lineClass = 'line-server', source = '') {
  const enable = document.getElementById('enableChat')?.checked
  if (!enable) return

  const ts = getLocalTimestamp()
  chatQueue.push({
    type: 'console',
    ts,
    tag,
    text: String(text ?? ''),
    lineClass,
    source
  })

  if (chatQueue.length > MAX_CHAT_NODES) {
    chatQueue.splice(0, chatQueue.length - MAX_CHAT_NODES)
  }

  if (!chatFlushScheduled) {
    chatFlushScheduled = true
    requestAnimationFrame(flushChatQueue)
  }
}

function directChat(string) {
  const enable = document.getElementById('enableChat')?.checked
  if (!enable) return

  chatQueue.push({ type: 'direct', html: string })

  if (chatQueue.length > MAX_CHAT_NODES) {
    chatQueue.splice(0, chatQueue.length - MAX_CHAT_NODES)
  }

  if (!chatFlushScheduled) {
    chatFlushScheduled = true
    requestAnimationFrame(flushChatQueue)
  }
}
