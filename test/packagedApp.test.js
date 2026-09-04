import assert from 'assert'
import { execFileSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

console.log('--- Testing Packaged Executable Window & Preload Startup ---')

const exePath = path.resolve(
  process.env.TRAFFICER_PACKAGED_EXE || 'dist/win-unpacked/TrafficerMC.exe'
)
const windowTimeoutMs = Number(process.env.TRAFFICER_WINDOW_TIMEOUT_MS || 15000)
if (!fs.existsSync(exePath)) {
  console.log(`Skipping packaged executable test: ${exePath} not yet created.`)
  process.exit(0)
}

const childEnv = { ...process.env }
// Development shells may set this flag for Electron helper processes. A GUI
// build must be tested in normal Electron mode, not Node-compatible mode.
delete childEnv.ELECTRON_RUN_AS_NODE

function getVisibleWindow(rootPid) {
  if (process.platform !== 'win32') return { pid: rootPid, handle: 1 }
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        [
          `$rootPid = [uint32]${Number(rootPid)}`,
          '$pending = [System.Collections.Generic.Queue[uint32]]::new()',
          '$seen = [System.Collections.Generic.HashSet[uint32]]::new()',
          '$pending.Enqueue($rootPid)',
          'while ($pending.Count -gt 0) {',
          '  $currentPid = $pending.Dequeue()',
          '  if (-not $seen.Add($currentPid)) { continue }',
          '  Get-CimInstance Win32_Process -Filter "ParentProcessId = $currentPid" -ErrorAction SilentlyContinue | ForEach-Object { $pending.Enqueue([uint32]$_.ProcessId) }',
          '}',
          'foreach ($candidatePid in $seen) {',
          '  $candidate = Get-Process -Id $candidatePid -ErrorAction SilentlyContinue',
          '  if ($null -eq $candidate) { continue }',
          '  $candidate.Refresh()',
          '  $handle = $candidate.MainWindowHandle.ToInt64()',
          '  if ($handle -ne 0) { [Console]::Write("$candidatePid,$handle"); break }',
          '}'
        ].join('; ')
      ],
      { encoding: 'utf8', windowsHide: true }
    )
    const [pid, handle] = output.trim().split(',').map(Number)
    return { pid: pid || 0, handle: handle || 0 }
  } catch {
    return { pid: 0, handle: 0 }
  }
}

function stopProcess(pid) {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Stop-Process -Id ${Number(pid)} -Force -ErrorAction SilentlyContinue`
        ],
        { windowsHide: true }
      )
    } else {
      process.kill(pid)
    }
  } catch {
    // Process already exited.
  }
}

console.log(`Starting packaged executable and waiting for a visible window: ${exePath}...`)
const proc = spawn(exePath, ['--enable-logging'], {
  detached: false,
  env: childEnv,
  stdio: ['ignore', 'pipe', 'pipe']
})

assert.ok(proc.pid, 'Executable process must have a valid PID')
let stdout = ''
let stderr = ''
proc.stdout.on('data', (chunk) => (stdout += chunk.toString()))
proc.stderr.on('data', (chunk) => (stderr += chunk.toString()))

let window = { pid: 0, handle: 0 }
try {
  const deadline = Date.now() + windowTimeoutMs
  while (Date.now() < deadline && proc.exitCode === null) {
    window = getVisibleWindow(proc.pid)
    if (window.handle !== 0) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  assert.equal(proc.exitCode, null, `Executable exited before showing a window. ${stderr}`)
  assert.notEqual(
    window.handle,
    0,
    `Packaged executable stayed alive but never showed its main window. ${stderr || stdout}`
  )
  assert.doesNotMatch(stderr, /Unable to load preload script|Cannot find module.*preload/i)
  console.log(`PASS: visible packaged window detected for PID ${window.pid}, HWND ${window.handle}`)
} finally {
  // Portable builds use a launcher process. Stop the GUI child first so its
  // renderer subprocesses exit, then stop the launcher itself.
  stopProcess(window?.pid)
  if (window?.pid !== proc.pid) stopProcess(proc.pid)
}

console.log('PASS: packaged app window and preload startup verified successfully')
process.exit(0)
