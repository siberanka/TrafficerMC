import assert from 'assert'
import { execFileSync, spawn } from 'child_process'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import puppeteer from 'puppeteer-core'

console.log('--- Testing Packaged Config Migration & UI Restore ---')

const exePath = path.resolve('dist/win-unpacked/TrafficerMC.exe')
if (process.platform !== 'win32' || !fs.existsSync(exePath)) {
  console.log('Skipping packaged config UI test: Windows unpacked build is not available.')
  process.exit(0)
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function waitForDebugger(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return
    } catch {
      // Electron has not opened its debugger endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Timed out waiting for the packaged Electron debugger endpoint')
}

function stopProcess(pid) {
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Stop-Process -Id ${Number(pid)} -Force -ErrorAction SilentlyContinue`
      ],
      { windowsHide: true }
    )
  } catch {
    // Process already exited.
  }
}

const useCurrentProfile = process.env.TRAFFICER_VALIDATE_CURRENT_PROFILE === '1'
const userDataDir = useCurrentProfile
  ? path.join(process.env.APPDATA, 'trafficermc')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'trafficermc-config-ui-'))
const configPath = path.join(userDataDir, 'config.json')
let fixture
if (useCurrentProfile) {
  assert.ok(fs.existsSync(configPath), 'Current TrafficerMC configuration does not exist')
  fixture = JSON.parse(fs.readFileSync(configPath, 'utf8'))
} else {
  fixture = {
    version: { current: 3.5 },
    config: {
      value: {
        server: 'migration.test.local:25565',
        username: 'PersistedBot',
        reconnectDelay: 12500,
        spamDelay: 2100
      },
      boolean: {
        autoReconnect: true,
        bypassChat: false
      }
    }
  }
  fs.writeFileSync(configPath, JSON.stringify(fixture), 'utf8')
}
const expectedServer = fixture.config.value.server ?? ''

const port = await reservePort()
const childEnv = { ...process.env }
delete childEnv.ELECTRON_RUN_AS_NODE
if (!useCurrentProfile) childEnv.TRAFFICER_TEST_CONFIG_DIR = userDataDir
const proc = spawn(
  exePath,
  [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, '--enable-logging'],
  { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }
)
let stderr = ''
proc.stderr.on('data', (chunk) => (stderr += chunk.toString()))

let browser
try {
  await waitForDebugger(port)
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` })
  const deadline = Date.now() + 15000
  let page
  while (Date.now() < deadline) {
    const pages = await browser.pages()
    page = pages.find((candidate) => candidate.url().includes('index.html'))
    if (page) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.ok(page, `Packaged renderer did not load. ${stderr}`)

  try {
    await page.waitForFunction(
      (server) => document.getElementById('server')?.value === server,
      { timeout: 15000 },
      expectedServer
    )
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      currentServer: document.getElementById('server')?.value,
      hasElectronApi: typeof window.electron?.ipcRenderer?.invoke === 'function',
      version: document.getElementById('versionString')?.textContent
    }))
    const storedDiagnostic = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    throw new Error(
      `Saved settings were not restored: ${JSON.stringify({
        serverMatches: diagnostic.currentServer === storedDiagnostic.config?.value?.server,
        hasElectronApi: diagnostic.hasElectronApi,
        version: diagnostic.version,
        schemaVersion: storedDiagnostic.config?.schemaVersion,
        stderr
      })}`,
      { cause: error }
    )
  }
  const state = await page.evaluate(() => {
    const label = document.querySelector('.rejoin-delay-field > .text-sm')
    const inputs = [...document.querySelectorAll('.rejoin-delay-inputs input')]
    const labelRect = label.getBoundingClientRect()
    const minRect = inputs[0].getBoundingClientRect()
    const maxRect = inputs[1].getBoundingClientRect()
    return {
      server: document.getElementById('server').value,
      username: document.getElementById('username').value,
      autoReconnect: document.getElementById('autoReconnect').checked,
      reconnectDelayMin: document.getElementById('reconnectDelayMin').value,
      reconnectDelayMax: document.getElementById('reconnectDelayMax').value,
      layoutClear: labelRect.bottom <= minRect.top && minRect.right < maxRect.left,
      inputWidth: Math.min(minRect.width, maxRect.width),
      controls: Object.fromEntries(
        [...document.querySelectorAll('input[id], select[id], textarea[id]')].map((element) => [
          element.id,
          element.type === 'checkbox' ? element.checked : element.value
        ])
      )
    }
  })

  assert.equal(state.layoutClear, true, 'rejoin label and inputs must not overlap')
  assert.ok(state.inputWidth >= 100, 'rejoin inputs must retain a usable width')

  const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  assert.equal(stored.config.schemaVersion, 2)
  let matchedControls = 0
  for (const [id, value] of Object.entries(stored.config.value)) {
    if (!(id in state.controls) || (value !== null && typeof value === 'object')) continue
    assert.equal(state.controls[id], String(value ?? ''), `Saved value was not restored: ${id}`)
    matchedControls++
  }
  for (const [id, value] of Object.entries(stored.config.boolean)) {
    if (!(id in state.controls)) continue
    assert.equal(state.controls[id], Boolean(value), `Saved checkbox was not restored: ${id}`)
    matchedControls++
  }
  const minimumExpectedControls = useCurrentProfile ? 20 : 10
  assert.ok(
    matchedControls >= minimumExpectedControls,
    `Expected the UI to restore at least ${minimumExpectedControls} persisted controls`
  )
  assert.ok(fs.existsSync(path.join(userDataDir, 'config.before-schema-v2.backup.json')))
  assert.doesNotMatch(
    stderr,
    /Unable to load preload script|Named export 'webUtils' not found|Cannot find module.*preload/i
  )
  if (!useCurrentProfile) {
    assert.equal(state.server, fixture.config.value.server)
    assert.equal(state.username, fixture.config.value.username)
    assert.equal(state.autoReconnect, true)
    assert.equal(state.reconnectDelayMin, '12500')
    assert.equal(state.reconnectDelayMax, '18750')
    assert.equal(stored.config.value.spammerDelayMin, 2100)
  }

  for (const viewport of [
    { width: 1240, height: 780 },
    { width: 1040, height: 640 }
  ]) {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 })
    for (const target of ['general', 'botting', 'scripting', 'proxy', 'about']) {
      await page.evaluate((tabTarget) => {
        document.querySelector(`.sidebar .tab[data-target="${tabTarget}"]`)?.click()
        document.querySelector('.controlArea').scrollTop = 0
      }, target)
      await new Promise((resolve) => setTimeout(resolve, 75))
      const layout = await page.evaluate((tabTarget) => {
        const control = document.querySelector('.controlArea')
        const pane = document.getElementById(tabTarget)
        const controlRect = control.getBoundingClientRect()
        const paneRect = pane.getBoundingClientRect()
        const visibleCards = [...pane.querySelectorAll('.ui-card')].filter(
          (card) => getComputedStyle(card).display !== 'none' && card.getClientRects().length > 0
        )
        const visibleControls = [
          ...pane.querySelectorAll('input, select, textarea, button, a')
        ].filter(
          (element) =>
            getComputedStyle(element).display !== 'none' && element.getClientRects().length > 0
        )
        control.scrollTop = control.scrollHeight
        return {
          documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          controlOverflow: control.scrollWidth > control.clientWidth + 1,
          paneOverflow:
            paneRect.left < controlRect.left - 1 || paneRect.right > controlRect.right + 1,
          overflowingCards: visibleCards.filter((card) => {
            const rect = card.getBoundingClientRect()
            return rect.left < controlRect.left - 1 || rect.right > controlRect.right + 1
          }).length,
          overflowingControls: visibleControls.filter((element) => {
            const rect = element.getBoundingClientRect()
            return rect.left < controlRect.left - 1 || rect.right > controlRect.right + 1
          }).length,
          bottomReachable:
            Math.abs(control.scrollTop + control.clientHeight - control.scrollHeight) <= 2
        }
      }, target)
      assert.deepEqual(
        layout,
        {
          documentOverflow: false,
          controlOverflow: false,
          paneOverflow: false,
          overflowingCards: 0,
          overflowingControls: 0,
          bottomReachable: true
        },
        `${target} layout must fit ${viewport.width}x${viewport.height}`
      )
    }

    const settingsLayout = await page.evaluate(() => {
      document.getElementById('openSettings').click()
      const modal = document.querySelector('.settings-tab-content')
      const rect = modal.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollableIfNeeded: modal.scrollHeight <= modal.clientHeight || modal.clientHeight > 0
      }
    })
    assert.ok(
      settingsLayout.left >= 0 && settingsLayout.top >= 0,
      'settings must start in viewport'
    )
    assert.ok(
      settingsLayout.right <= settingsLayout.viewportWidth + 1 &&
        settingsLayout.bottom <= settingsLayout.viewportHeight + 1,
      `settings layout must fit ${viewport.width}x${viewport.height}`
    )
    assert.equal(settingsLayout.scrollableIfNeeded, true)
    await page.evaluate(() => document.getElementById('closeSettings').click())
  }
  if (process.env.TRAFFICER_UI_SCREENSHOT) {
    const screenshotPath = path.resolve(process.env.TRAFFICER_UI_SCREENSHOT)
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath })
  }
  console.log(
    `PASS: ${matchedControls} saved controls restored; migration, rejoin layout, and 1240x780/1040x640 viewport matrices passed`
  )
} finally {
  browser?.disconnect()
  stopProcess(proc.pid)
  const resolvedTempRoot = path.resolve(os.tmpdir()) + path.sep
  const resolvedUserData = path.resolve(userDataDir)
  if (!useCurrentProfile && resolvedUserData.startsWith(resolvedTempRoot)) {
    fs.rmSync(resolvedUserData, { recursive: true, force: true })
  }
}
