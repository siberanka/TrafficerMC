import assert from 'assert'
import {
  LATEST_RELEASE_URL,
  RELEASE_REPOSITORY,
  getLatestGitHubRelease,
  isNewerRelease
} from '../src/shared/releaseVersion.js'

console.log('--- Testing GitHub Release Version Check ---')

assert.equal(RELEASE_REPOSITORY, 'siberanka/TrafficerMC')
assert.equal(
  LATEST_RELEASE_URL,
  'https://api.github.com/repos/siberanka/TrafficerMC/releases/latest'
)
assert.equal(isNewerRelease('v4.1.0', '4.0.0'), true)
assert.equal(isNewerRelease('4.0.1', '4.0'), true)
assert.equal(isNewerRelease('v4.0.0', '4.0'), false)
assert.equal(isNewerRelease('3.6.0', '4.0.0'), false)
assert.equal(isNewerRelease('invalid', '4.0.0'), false)

let requestedUrl
const latest = await getLatestGitHubRelease(async (url, options) => {
  requestedUrl = url
  assert.equal(options.headers.Accept, 'application/vnd.github+json')
  return { ok: true, json: async () => ({ tag_name: 'v4.2.0' }) }
})
assert.equal(requestedUrl, LATEST_RELEASE_URL)
assert.equal(latest, '4.2.0')
assert.equal(
  await getLatestGitHubRelease(async () => ({ ok: false })),
  null,
  'GitHub failures must remain silent'
)

console.log('✓ GitHub release checks use siberanka/TrafficerMC and compare versions safely')
