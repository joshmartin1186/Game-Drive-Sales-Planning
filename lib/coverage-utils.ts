/**
 * Coverage utility functions — domain classification, URL helpers
 */

/** Domains that should be auto-classified as 'informational' coverage type.
 *  These are non-press pages (game storefronts, wikis, databases) that
 *  inflate UMV numbers and aren't real press coverage. */
const INFORMATIONAL_DOMAINS = [
  'wikipedia.org',
  'store.steampowered.com',
  'steamcommunity.com',
  'steamdb.info',
]

/**
 * Returns true if the given URL belongs to an informational (non-press) domain.
 * Matches exact domain or any subdomain (e.g. en.wikipedia.org).
 */
export function isInformationalUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return INFORMATIONAL_DOMAINS.some(
      d => hostname === d || hostname.endsWith('.' + d)
    )
  } catch {
    return false
  }
}

/**
 * Given a coverage_type value (which may be null/undefined) and a URL,
 * returns the appropriate coverage_type. If the URL is informational and
 * no explicit type was provided (or it was 'news'), overrides to 'informational'.
 */
export function classifyCoverageType(
  coverageType: string | null | undefined,
  url: string
): string | null {
  if (isInformationalUrl(url)) {
    return 'informational'
  }
  return coverageType || null
}
