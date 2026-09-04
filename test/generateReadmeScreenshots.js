import assert from 'assert'
import { execFileSync, spawn } from 'child_process'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import puppeteer from 'puppeteer-core'

const exePath = path.resolve('dist/win-unpacked/TrafficerMC.exe')
const outputDir = path.resolve('docs/images')
assert.equal(process.platform, 'win32', 'README previews currently require a Windows build')
assert.ok(fs.existsSync(exePath), 'Run npm run build:unpack before generating README previews')

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

async function waitForDebugger(port) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return
    } catch {
      // Electron has not opened the debugger endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Timed out waiting for Electron')
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

const isolatedProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'trafficermc-readme-preview-'))
fs.writeFileSync(
  path.join(isolatedProfile, 'config.json'),
  JSON.stringify({ version: { current: 4 }, config: { schemaVersion: 2, value: {}, boolean: {} } }),
  'utf8'
)
fs.mkdirSync(outputDir, { recursive: true })

const port = await reservePort()
const childEnv = {
  ...process.env,
  TRAFFICER_TEST_CONFIG_DIR: isolatedProfile,
  TRAFFICER_README_PREVIEW: '1'
}
delete childEnv.ELECTRON_RUN_AS_NODE
const proc = spawn(
  exePath,
  [`--user-data-dir=${isolatedProfile}`, `--remote-debugging-port=${port}`, '--enable-logging'],
  { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }
)

let browser
try {
  await waitForDebugger(port)
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` })
  const deadline = Date.now() + 15000
  let page
  while (Date.now() < deadline) {
    page = (await browser.pages()).find((candidate) => candidate.url().includes('index.html'))
    if (page) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.ok(page, 'Packaged renderer did not load')
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
  await page.waitForFunction(() => typeof window.electron?.ipcRenderer?.invoke === 'function')

  const sanitizePreview = async () => {
    await page.evaluate(() => {
      document.body.classList.add('privacy-preview')
      document.querySelectorAll('input').forEach((input) => {
        if (input.type === 'checkbox' || input.type === 'radio') input.checked = false
        else input.value = ''
      })
      document.querySelectorAll('textarea').forEach((textarea) => (textarea.value = ''))
      document.querySelectorAll('select').forEach((select) => (select.selectedIndex = -1))
      document.querySelectorAll('#chatBox, #proxyLogbox, #botList').forEach((list) => {
        list.replaceChildren()
      })
      const notifications = document.getElementById('notifications')
      notifications.replaceChildren()
      if (!window.__trafficPreviewNotificationGuard) {
        window.__trafficPreviewNotificationGuard = new MutationObserver(() => {
          notifications.replaceChildren()
        })
        window.__trafficPreviewNotificationGuard.observe(notifications, { childList: true })
      }
      document.querySelector('.controlArea').scrollTop = 0
    })
  }

  const openTab = async (target) => {
    await page.evaluate((tabTarget) => {
      document.querySelector(`.sidebar .tab[data-target="${tabTarget}"]`)?.click()
    }, target)
    await sanitizePreview()
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const capture = async (name) => {
    const privacyState = await page.evaluate(() => ({
      populatedEntries: [
        ...document.querySelectorAll('input[type="text"], input[type="number"], textarea')
      ].filter((element) => element.value !== '').length,
      selectedOptions: [...document.querySelectorAll('select')].filter(
        (element) => element.selectedIndex !== -1
      ).length,
      checkedControls: [
        ...document.querySelectorAll('input[type="checkbox"], input[type="radio"]')
      ].filter((element) => element.checked).length,
      notifications: document.getElementById('notifications').childElementCount,
      updateNoticeVisible: /new version available|update available/i.test(document.body.innerText)
    }))
    assert.deepEqual(privacyState, {
      populatedEntries: 0,
      selectedOptions: 0,
      checkedControls: 0,
      notifications: 0,
      updateNoticeVisible: false
    })
    await page.screenshot({ path: path.join(outputDir, `${name}.png`) })
  }

  await openTab('general')
  await capture('general')
  await openTab('botting')
  await capture('botting')
  await openTab('scripting')
  await capture('scripting')
  await openTab('proxy')
  await capture('proxy')
  await openTab('general')
  await page.evaluate(() => document.getElementById('openSettings').click())
  await sanitizePreview()
  await capture('settings')

  console.log('PASS: generated five privacy-safe README previews from an isolated empty profile')
} finally {
  browser?.disconnect()
  stopProcess(proc.pid)
  const resolvedTempRoot = path.resolve(os.tmpdir()) + path.sep
  const resolvedProfile = path.resolve(isolatedProfile)
  if (resolvedProfile.startsWith(resolvedTempRoot)) {
    fs.rmSync(resolvedProfile, { recursive: true, force: true })
  }
}
