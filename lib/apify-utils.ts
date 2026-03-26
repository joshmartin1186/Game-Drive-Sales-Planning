/**
 * Apify utilities — credit checking, budget management
 */

interface ApifyUsageInfo {
  hasCredits: boolean
  remainingUsd: number | null
  error: string | null
}

/**
 * Check if the Apify account has sufficient credits remaining.
 * Returns usage info including whether we should proceed with scanning.
 *
 * Threshold: $2.00 remaining — if below, skip the scan.
 */
export async function checkApifyCredits(apiKey: string, threshold = 2.0): Promise<ApifyUsageInfo> {
  try {
    const res = await fetch(`https://api.apify.com/v2/users/me?token=${apiKey}`)
    if (!res.ok) {
      return { hasCredits: false, remainingUsd: null, error: `Apify API returned ${res.status}` }
    }
    const data = await res.json()
    // Apify returns usage info in the user object
    const plan = data?.plan
    const usage = data?.usage

    // Try to determine remaining credits
    // Apify's /users/me response includes plan limits and current usage
    if (plan?.monthlyUsageLimitUsd && usage?.monthlyUsageUsd !== undefined) {
      const remaining = plan.monthlyUsageLimitUsd - usage.monthlyUsageUsd
      return {
        hasCredits: remaining > threshold,
        remainingUsd: Math.round(remaining * 100) / 100,
        error: null
      }
    }

    // If we can't determine credits, assume we have them (don't block on API changes)
    return { hasCredits: true, remainingUsd: null, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { hasCredits: true, remainingUsd: null, error: msg } // Don't block on check failure
  }
}

/**
 * Send a Discord notification about low Apify credits.
 */
export async function notifyLowCredits(remainingUsd: number): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) return

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: 'Apify Credits Low',
          description: `Only **$${remainingUsd.toFixed(2)}** remaining on the Apify account. Social media scanners (YouTube, Reddit, Twitter, TikTok, Instagram, Twitch, SullyGnome) will pause when credits run out.`,
          color: 0xff9900, // orange
          timestamp: new Date().toISOString()
        }]
      })
    })
  } catch { /* best effort */ }
}
