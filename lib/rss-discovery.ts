/**
 * RSS Feed Auto-Discovery
 *
 * When a new outlet is detected by any scanner, this module probes the outlet's
 * domain for RSS/Atom feeds and returns the best candidate URL.
 *
 * Discovery strategy (waterfall):
 * 1. Check well-known RSS paths (/feed, /rss, /feed.xml, etc.)
 * 2. Parse the homepage HTML for <link rel="alternate" type="application/rss+xml"> tags
 * 3. Return null if no feed found
 */

// Well-known RSS feed paths to probe (ordered by likelihood)
const COMMON_FEED_PATHS = [
  '/feed/',
  '/feed',
  '/rss',
  '/rss.xml',
  '/feed.xml',
  '/atom.xml',
  '/feeds/latest',
  '/rss/news.xml',
  '/index.xml',
  '/feed/rss2',
  '/rss/rss.php?texttype=4',
]

const FETCH_TIMEOUT = 8000 // 8 seconds per probe
const USER_AGENT = 'GameDrive/1.0 Coverage Monitor'

/**
 * Check if a response body looks like a valid RSS/Atom feed
 */
function looksLikeFeed(text: string): boolean {
  const start = text.trimStart().substring(0, 500).toLowerCase()
  return (
    start.includes('<rss') ||
    start.includes('<feed') ||
    start.includes('<atom') ||
    start.includes('<?xml') && (start.includes('<rss') || start.includes('<feed') || start.includes('<channel'))
  )
}

/**
 * Try fetching a URL and check if it returns a valid RSS/Atom feed
 */
async function probeFeedUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) return false

    const contentType = res.headers.get('content-type') || ''
    const isXmlType = contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')

    // Read first chunk to check content
    const text = await res.text()

    if (isXmlType && looksLikeFeed(text)) return true
    if (looksLikeFeed(text)) return true

    return false
  } catch {
    return false
  }
}

/**
 * Parse HTML for RSS/Atom feed links in <link> tags
 * e.g. <link rel="alternate" type="application/rss+xml" href="..." />
 */
function extractFeedLinksFromHtml(html: string, baseUrl: string): string[] {
  const feeds: string[] = []

  // Match <link> tags with rel="alternate" and RSS/Atom types
  const linkRegex = /<link[^>]*\brel\s*=\s*["']alternate["'][^>]*>/gi
  const matches = html.match(linkRegex) || []

  for (const tag of matches) {
    const typeMatch = tag.match(/\btype\s*=\s*["']([^"']+)["']/i)
    if (!typeMatch) continue

    const type = typeMatch[1].toLowerCase()
    if (!type.includes('rss') && !type.includes('atom') && !type.includes('xml')) continue

    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) continue

    let href = hrefMatch[1]

    // Resolve relative URLs
    try {
      href = new URL(href, baseUrl).toString()
    } catch {
      continue
    }

    feeds.push(href)
  }

  return feeds
}

/**
 * Discover RSS feed URL for a given domain
 *
 * @param domain - The outlet's domain (e.g., "pcgamer.com")
 * @returns The feed URL if found, or null
 */
export async function discoverRssFeed(domain: string): Promise<string | null> {
  const baseUrl = `https://${domain.replace(/^www\./, '')}`
  const baseUrlWww = `https://www.${domain.replace(/^www\./, '')}`

  // Strategy 1: Probe well-known feed paths
  // Try the first few most common paths in parallel for speed
  const quickPaths = COMMON_FEED_PATHS.slice(0, 4)
  const quickResults = await Promise.all(
    quickPaths.map(async (path) => {
      const url = `${baseUrl}${path}`
      const found = await probeFeedUrl(url)
      return found ? url : null
    })
  )

  const quickHit = quickResults.find(r => r !== null)
  if (quickHit) return quickHit

  // Try www variant for the most common path
  const wwwFeed = `${baseUrlWww}/feed/`
  if (await probeFeedUrl(wwwFeed)) return wwwFeed

  // Strategy 2: Parse homepage HTML for <link> feed tags
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    const res = await fetch(baseUrl, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (res.ok) {
      const html = await res.text()
      const feedLinks = extractFeedLinksFromHtml(html, baseUrl)

      // Validate found links
      for (const feedUrl of feedLinks.slice(0, 3)) {
        if (await probeFeedUrl(feedUrl)) return feedUrl
      }
    }
  } catch {
    // Homepage fetch failed — try remaining well-known paths
  }

  // Strategy 3: Try remaining well-known paths
  const remainingPaths = COMMON_FEED_PATHS.slice(4)
  for (const path of remainingPaths) {
    const url = `${baseUrl}${path}`
    if (await probeFeedUrl(url)) return url
  }

  return null
}

/**
 * Discover RSS feed and auto-create a coverage source + update outlet
 *
 * Call this after any scanner creates a new outlet. It runs the discovery
 * in the background and creates the source if found.
 *
 * @param outletId - The outlet's database ID
 * @param domain - The outlet's domain
 * @param outletName - The outlet's display name (for the source name)
 * @param supabase - Supabase client instance
 */
export async function autoDiscoverAndCreateRssSource(
  outletId: string,
  domain: string,
  outletName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ found: boolean; feedUrl?: string }> {
  // Skip domains that definitely won't have RSS feeds
  const skipDomains = [
    'youtube.com', 'reddit.com', 'twitter.com', 'x.com', 'twitch.tv',
    'tiktok.com', 'instagram.com', 'facebook.com', 'threads.com',
    'dailymotion.com', 'store.steampowered.com', 'steamcommunity.com',
    'store.playstation.com', 'store.epicgames.com', 'metacritic.com',
    'opencritic.com', 'howlongtobeat.com', 'steamdb.info', 'en.wikipedia.org',
    'dekudeals.com', 'instant-gaming.com', 'keylol.com',
  ]

  const domainLower = domain.toLowerCase()
  if (skipDomains.some(skip => domainLower === skip || domainLower.endsWith('.' + skip))) {
    return { found: false }
  }

  try {
    const feedUrl = await discoverRssFeed(domain)
    if (!feedUrl) return { found: false }

    // Update the outlet with the discovered feed URL
    await supabase
      .from('outlets')
      .update({ rss_feed_url: feedUrl, updated_at: new Date().toISOString() })
      .eq('id', outletId)

    // Check if an RSS source already exists for this outlet
    const { data: existing } = await supabase
      .from('coverage_sources')
      .select('id')
      .eq('outlet_id', outletId)
      .eq('source_type', 'rss')
      .limit(1)

    if (!existing || existing.length === 0) {
      // Create a new RSS coverage source
      await supabase
        .from('coverage_sources')
        .insert({
          source_type: 'rss',
          name: `${outletName} RSS`,
          config: { url: feedUrl },
          outlet_id: outletId,
          scan_frequency: 'daily',
          is_active: true,
        })
    }

    console.log(`[RSS Discovery] Found feed for ${domain}: ${feedUrl}`)
    return { found: true, feedUrl }
  } catch (err) {
    console.warn(`[RSS Discovery] Error discovering feed for ${domain}:`, err instanceof Error ? err.message : String(err))
    return { found: false }
  }
}
