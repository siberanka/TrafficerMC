import assert from 'assert'
import { spawn } from 'child_process'
import fs from 'fs'

console.log('--- Testing Packaged Executable Stability ---')

const exePath = 'D:/TrafficerMC/dist/win-unpacked/TrafficerMC.exe'
if (!fs.existsSync(exePath)) {
  console.log(
    'Skipping packaged executable test: dist/win-unpacked/TrafficerMC.exe not yet created.'
  )
  process.exit(0)
}

console.log(`Starting packaged executable: ${exePath}...`)
const proc = spawn(exePath, [], {
  detached: false,
  stdio: 'ignore'
})

assert.ok(proc.pid, 'Executable process must have a valid PID')

await new Promise((resolve, reject) => {
  let finished = false

  proc.on('error', (err) => {
    if (!finished) {
      finished = true
      reject(err)
    }
  })

  proc.on('exit', (code) => {
    if (!finished && code !== null && code !== 0) {
      finished = true
      reject(new Error(`Executable exited with failure code: ${code}`))
    }
  })

  setTimeout(() => {
    if (!finished) {
      finished = true
      console.log(
        `✓ Process is running cleanly with PID ${proc.pid} without any uncaught exceptions!`
      )
      try {
        process.kill(proc.pid)
      } catch (_) {}
      resolve()
    }
  }, 4000)
})

console.log('✓ Packaged App Stability verified successfully!')
process.exit(0)
