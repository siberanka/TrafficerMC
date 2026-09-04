export const RELEASE_REPOSITORY = 'siberanka/TrafficerMC'
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`

function parseVersion(version) {
  const match = String(version ?? '')
    .trim()
    .match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/i)
  if (!match) return null
  return match.slice(1, 5).map((part) => Number(part ?? 0))
}

export function isNewerRelease(candidate, current) {
  const candidateParts = parseVersion(candidate)
  const currentParts = parseVersion(current)
  if (!candidateParts || !currentParts) return false

  for (let index = 0; index < candidateParts.length; index++) {
    if (candidateParts[index] > currentParts[index]) return true
    if (candidateParts[index] < currentParts[index]) return false
  }
  return false
}

export async function getLatestGitHubRelease(fetchImplementation) {
  if (typeof fetchImplementation !== 'function') return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetchImplementation(LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'TrafficerMC-Version-Check',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      signal: controller.signal
    })
    if (!response.ok) return null
    const release = await response.json()
    return parseVersion(release?.tag_name) ? String(release.tag_name).replace(/^v/i, '') : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
