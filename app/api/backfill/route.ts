import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { domainToOutletName, extractDomain } from '@/lib/outlet-utils'
import { inferTerritory } from '@/lib/territory'
import { detectOutletCountry } from '@/lib/outlet-country'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// ─── Tier suggestion ─────────────────────────────────────────────────────────

function suggestTier(monthlyVisitors: number | null): string | null {
  if (!monthlyVisitors) return null
  if (monthlyVisitors >= 10_000_000) return 'A'
  if (monthlyVisitors >= 1_000_000) return 'B'
  if (monthlyVisitors >= 100_000) return 'C'
  return 'D'
}

// ─── HypeStat HTML parser ────────────────────────────────────────────────────

function parseTrafficFromHtml(html: string): number | null {
  const patterns = [
    /Monthly\s+Visits?\s*[:\-]\s*([\d,]+)/i,
    /monthly\s+unique\s+visitors?\s*[:\-]\s*([\d,]+)/i,
    /Estimated\s+Monthly\s+Visits?\s*[:\-]\s*([\d,]+)/i,
    /<td[^>]*>Monthly\s+Visits?<\/td>\s*<td[^>]*>([\d,]+)/i,
    /data-monthly-visits="([\d,]+)"/i,
    /visitors?\s+per\s+month\s*[:\-]\s*([\d,]+)/i,
    /monthly_visits['":\s]+([\d,]+)/i,
    /([\d,]{4,})\s+monthly\s+visits?/i,
    /([\d,]{4,})\s+unique\s+visitors?\s+per\s+month/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) {
      const num = parseInt(match[1].replace(/,/g, ''))
      if (!isNaN(num) && num > 0) return num
    }
  }

  const visitSection = html.match(/visit[^<]{0,200}/gi)
  if (visitSection) {
    for (const section of visitSection) {
      const numMatch = section.match(/([\d,]{4,})/)
      if (numMatch) {
        const num = parseInt(numMatch[1].replace(/,/g, ''))
        if (!isNaN(num) && num > 100) return num
      }
    }
  }
  return null
}

async function fetchHypestatDirect(domain: string): Promise<number | null> {
  try {
    const url = `https://hypestat.com/info/${domain}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GameDrive/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(10000)
    })
    if (response.ok) {
      const html = await response.text()
      return parseTrafficFromHtml(html)
    }
  } catch { /* ignore */ }
  return null
}

// ─── POST: Run a specific backfill task ──────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase()

  try {
    const body = await request.json()
    const task = body.task as string

    switch (task) {

      // ── 1. Link orphan items to outlets by URL domain ──────────────────
      case 'link_outlets': {
        const { data: orphans } = await supabase
          .from('coverage_items')
          .select('id, url')
          .is('outlet_id', null)
          .not('url', 'is', null)
          .limit(200)

        if (!orphans || orphans.length === 0) {
          return NextResponse.json({ task, result: 'No orphan items found', linked: 0, created: 0 })
        }

        let linked = 0
        let created = 0
        const errors: string[] = []

        for (const item of orphans) {
          try {
            const domain = extractDomain(item.url)
            if (!domain) continue

            // Try to find existing outlet by domain
            const { data: outlet } = await supabase
              .from('outlets')
              .select('id')
              .eq('domain', domain)
              .single()

            if (outlet) {
              await supabase
                .from('coverage_items')
                .update({ outlet_id: outlet.id })
                .eq('id', item.id)
              linked++
            } else {
              // Create new outlet
              const outletName = domainToOutletName(domain)
              const { data: newOutlet } = await supabase
                .from('outlets')
                .insert({ name: outletName, domain, country: detectOutletCountry(domain), tier: null })
                .select('id')
                .single()
              if (newOutlet) {
                await supabase
                  .from('coverage_items')
                  .update({ outlet_id: newOutlet.id })
                  .eq('id', item.id)
                linked++
                created++
              }
            }
          } catch (err) {
            errors.push(`Item ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }

        return NextResponse.json({ task, total: orphans.length, linked, created, errors: errors.slice(0, 10) })
      }

      // ── 2. Backfill missing publish_dates from discovered_at ───────────
      case 'backfill_dates': {
        const { data: items } = await supabase
          .from('coverage_items')
          .select('id, discovered_at, created_at')
          .is('publish_date', null)
          .limit(500)

        if (!items || items.length === 0) {
          return NextResponse.json({ task, result: 'No items missing dates', updated: 0 })
        }

        let updated = 0
        for (const item of items) {
          const fallbackDate = item.discovered_at || item.created_at
          if (fallbackDate) {
            const dateOnly = fallbackDate.split('T')[0]
            await supabase
              .from('coverage_items')
              .update({ publish_date: dateOnly })
              .eq('id', item.id)
            updated++
          }
        }

        return NextResponse.json({ task, total: items.length, updated })
      }

      // ── 3. Backfill missing territories from outlet domain TLDs ────────
      case 'backfill_territories': {
        const { data: items } = await supabase
          .from('coverage_items')
          .select('id, url, outlet:outlets(domain, country)')
          .or('territory.is.null,territory.eq.')
          .limit(500)

        if (!items || items.length === 0) {
          return NextResponse.json({ task, result: 'No items missing territory', updated: 0 })
        }

        let updated = 0
        for (const item of items) {
          const outlet = item.outlet as { domain?: string; country?: string } | null
          const url = item.url as string | null

          // Try outlet domain first, then URL
          let domain = outlet?.domain || null
          if (!domain && url) {
            domain = extractDomain(url)
          }

          const territory = inferTerritory(domain, outlet?.country)
          if (territory) {
            await supabase
              .from('coverage_items')
              .update({ territory })
              .eq('id', item.id)
            updated++
          }
        }

        return NextResponse.json({ task, total: items.length, updated })
      }

      // ── 4. Fix outlet names using domainToOutletName ───────────────────
      case 'fix_outlet_names': {
        // Get all outlets and check if their name can be improved
        const { data: outlets } = await supabase
          .from('outlets')
          .select('id, name, domain')
          .not('domain', 'is', null)
          .limit(2000)

        if (!outlets || outlets.length === 0) {
          return NextResponse.json({ task, result: 'No outlets found', updated: 0 })
        }

        let updated = 0
        const changes: Array<{ domain: string; old: string; new: string }> = []

        for (const outlet of outlets) {
          if (!outlet.domain) continue
          const betterName = domainToOutletName(outlet.domain)

          // Only update if the new name is different and better
          // "Better" = it's a known outlet name (from our mapping) and different from current
          if (betterName !== outlet.name && betterName !== outlet.domain) {
            // Don't downgrade a good custom name to a generic one
            // Only update if current name looks auto-generated (single word, matches domain pattern)
            const currentLooksAutoGenerated =
              outlet.name.toLowerCase() === outlet.domain.replace(/\.(com|net|org|co\.uk|io|gg|tv)$/i, '').split('.').pop()?.toLowerCase() ||
              outlet.name.toLowerCase() === outlet.domain.toLowerCase()

            if (currentLooksAutoGenerated) {
              await supabase
                .from('outlets')
                .update({ name: betterName })
                .eq('id', outlet.id)
              changes.push({ domain: outlet.domain, old: outlet.name, new: betterName })
              updated++
            }
          }
        }

        return NextResponse.json({ task, total: outlets.length, updated, changes: changes.slice(0, 50) })
      }

      // ── 5. HypeStat batch enrichment (batched, with limit) ─────────────
      case 'enrich_traffic': {
        const batchSize = body.batch_size || 20
        const offset = body.offset || 0

        const { data: outlets } = await supabase
          .from('outlets')
          .select('id, domain')
          .is('monthly_unique_visitors', null)
          .not('domain', 'is', null)
          .order('created_at', { ascending: true })
          .range(offset, offset + batchSize - 1)

        if (!outlets || outlets.length === 0) {
          return NextResponse.json({ task, result: 'No more outlets to enrich', enriched: 0, failed: 0, offset })
        }

        let enriched = 0
        let failed = 0
        const results: Array<{ domain: string; visitors: number | null; tier: string | null }> = []

        for (const outlet of outlets) {
          const visitors = await fetchHypestatDirect(outlet.domain)

          if (visitors) {
            const tier = suggestTier(visitors)
            await supabase
              .from('outlets')
              .update({
                monthly_unique_visitors: visitors,
                tier,
                traffic_last_updated: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', outlet.id)

            // Also update any coverage items pointing to this outlet
            await supabase
              .from('coverage_items')
              .update({ monthly_unique_visitors: visitors })
              .eq('outlet_id', outlet.id)

            enriched++
            results.push({ domain: outlet.domain, visitors, tier })
          } else {
            failed++
            results.push({ domain: outlet.domain, visitors: null, tier: null })
          }
        }

        return NextResponse.json({
          task,
          batch_size: batchSize,
          offset,
          next_offset: offset + batchSize,
          processed: outlets.length,
          enriched,
          failed,
          results
        })
      }

      // ── 6. Auto-assign tiers based on existing MUV data ────────────────
      case 'assign_tiers': {
        const { data: outlets } = await supabase
          .from('outlets')
          .select('id, monthly_unique_visitors')
          .is('tier', null)
          .not('monthly_unique_visitors', 'is', null)
          .limit(500)

        if (!outlets || outlets.length === 0) {
          return NextResponse.json({ task, result: 'No outlets needing tier assignment', updated: 0 })
        }

        let updated = 0
        for (const outlet of outlets) {
          const tier = suggestTier(outlet.monthly_unique_visitors)
          if (tier) {
            await supabase
              .from('outlets')
              .update({ tier })
              .eq('id', outlet.id)
            updated++
          }
        }

        return NextResponse.json({ task, total: outlets.length, updated })
      }

      // ── 7. Backfill outlet countries from domain ──────────────────────
      case 'backfill_countries': {
        const { data: outlets } = await supabase
          .from('outlets')
          .select('id, domain, country')
          .not('domain', 'is', null)
          .or('country.is.null,country.eq.,country.eq.International')
          .limit(2000)

        if (!outlets || outlets.length === 0) {
          return NextResponse.json({ task, result: 'No outlets need country backfill', updated: 0 })
        }

        let updated = 0
        const changes: Array<{ domain: string; old: string; new: string }> = []

        for (const outlet of outlets) {
          if (!outlet.domain) continue
          const detected = detectOutletCountry(outlet.domain)

          // Only update if we detected a specific country (not "International")
          // or if the current value is null/empty
          if (detected !== 'International' || !outlet.country) {
            if (detected !== (outlet.country || '')) {
              await supabase
                .from('outlets')
                .update({ country: detected, updated_at: new Date().toISOString() })
                .eq('id', outlet.id)
              changes.push({ domain: outlet.domain, old: outlet.country || '(none)', new: detected })
              updated++
            }
          }
        }

        return NextResponse.json({ task, total: outlets.length, updated, changes: changes.slice(0, 50) })
      }

      // ── 8. Summary / status check ──────────────────────────────────────
      case 'status': {
        const [
          { count: totalItems },
          { count: missingOutlet },
          { count: missingDate },
          { count: missingTerritory },
          { count: totalOutlets },
          { count: outletsMissingMuv },
          { count: outletsMissingTier },
          { count: outletsMissingCountry },
        ] = await Promise.all([
          supabase.from('coverage_items').select('*', { count: 'exact', head: true }),
          supabase.from('coverage_items').select('*', { count: 'exact', head: true }).is('outlet_id', null),
          supabase.from('coverage_items').select('*', { count: 'exact', head: true }).is('publish_date', null),
          supabase.from('coverage_items').select('*', { count: 'exact', head: true }).or('territory.is.null,territory.eq.'),
          supabase.from('outlets').select('*', { count: 'exact', head: true }),
          supabase.from('outlets').select('*', { count: 'exact', head: true }).is('monthly_unique_visitors', null),
          supabase.from('outlets').select('*', { count: 'exact', head: true }).is('tier', null),
          supabase.from('outlets').select('*', { count: 'exact', head: true }).or('country.is.null,country.eq.,country.eq.International'),
        ])

        return NextResponse.json({
          task: 'status',
          coverage_items: {
            total: totalItems,
            missing_outlet: missingOutlet,
            missing_date: missingDate,
            missing_territory: missingTerritory,
          },
          outlets: {
            total: totalOutlets,
            missing_muv: outletsMissingMuv,
            missing_tier: outletsMissingTier,
            missing_country: outletsMissingCountry,
          }
        })
      }

      default:
        return NextResponse.json({ error: `Unknown task: ${task}` }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Backfill failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
