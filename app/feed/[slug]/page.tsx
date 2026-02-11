'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface OutletData { name: string; domain: string; tier: string; monthly_unique_visitors: number; country: string }
interface CampaignData { name: string }
interface CoverageItem {
  id: string; title: string; url: string; publish_date: string; territory: string
  coverage_type: string; monthly_unique_visitors: number; review_score: number | null
  quotes: string | null; sentiment: string | null; campaign_section: string | null
  outlet: OutletData | null; campaign: CampaignData | null
}

interface FeedData {
  game: { name: string; slug: string; steam_store_url: string | null; release_date: string | null }
  client: { name: string }
  summary: {
    total_pieces: number; total_audience_reach: number; estimated_views: number
    avg_review_score: number | null; tier_breakdown: [string, number][]
    type_breakdown: [string, number][]; territory_breakdown: [string, number][]
    date_range: { from: string | null; to: string | null }
  }
  campaign_sections: string[]
  items: CoverageItem[]
  coverage_types: string[]
}

function formatNumber(val: number): string {
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`
  return val.toLocaleString()
}

const tierColors: Record<string, { bg: string; text: string }> = {
  A: { bg: '#dcfce7', text: '#166534' },
  B: { bg: '#dbeafe', text: '#1e40af' },
  C: { bg: '#fef3c7', text: '#92400e' },
  D: { bg: '#f3f4f6', text: '#374151' },
  untiered: { bg: '#f3f4f6', text: '#6b7280' },
}

const typeIcons: Record<string, string> = {
  review: '★', news: '📰', preview: '👀', interview: '🎤',
  trailer: '🎬', stream: '🔴', video: '📺', guide: '📖',
  'round-up': '📋', mention: '💬', feature: '📝', article: '📄',
}

export default function PublicFeedPage() {
  const params = useParams()
  const slug = params.slug as string

  const [feedData, setFeedData] = useState<FeedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSection, setFilterSection] = useState('')

  const fetchFeed = useCallback(async (pw?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (pw) params.set('password', pw)
      const res = await fetch(`/api/public-feed/${slug}?${params}`)
      const data = await res.json()

      if (res.status === 401 && data.needs_password) {
        setNeedsPassword(true)
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error(data.error || 'Failed to load feed')

      setFeedData(data)
      setNeedsPassword(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { fetchFeed() }, [fetchFeed])

  // Password gate
  if (needsPassword) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ background: '#fff', padding: '40px', borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>Password Required</h2>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>Enter the password to view this coverage feed.</p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchFeed(password)}
            placeholder="Enter password..."
            style={{ width: '100%', padding: '10px 16px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}
          />
          <button
            onClick={() => fetchFeed(password)}
            style={{ width: '100%', padding: '10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
          >View Feed</button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          <div>Loading coverage feed...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#dc2626', maxWidth: '400px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>😞</div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Feed Not Available</h2>
          <p style={{ fontSize: '14px', color: '#64748b' }}>{error}</p>
        </div>
      </div>
    )
  }

  if (!feedData) return null

  const { game, summary, items, campaign_sections, coverage_types } = feedData
  const dateRange = summary.date_range

  // Filter items
  let filteredItems = items
  if (filterType) filteredItems = filteredItems.filter(i => i.coverage_type === filterType)
  if (filterSection) filteredItems = filteredItems.filter(i => i.campaign_section === filterSection)

  // Group by campaign section
  const grouped: Record<string, CoverageItem[]> = {}
  for (const item of filteredItems) {
    const section = item.campaign_section || 'Coverage'
    if (!grouped[section]) grouped[section] = []
    grouped[section].push(item)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', color: '#fff', padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>{game.name}</h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px' }}>
            Media Coverage Report{dateRange.from && dateRange.to ? ` — ${dateRange.from} to ${dateRange.to}` : ''}
          </p>

          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', maxWidth: '800px', margin: '0 auto' }}>
            {[
              { label: 'Total Pieces', value: formatNumber(summary.total_pieces) },
              { label: 'Audience Reach', value: formatNumber(summary.total_audience_reach) },
              { label: 'Est. Views', value: formatNumber(summary.estimated_views) },
              { label: 'Avg Review Score', value: summary.avg_review_score?.toString() ?? 'N/A' },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '28px', fontWeight: 700 }}>{stat.value}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
          >
            <option value="">All Types</option>
            {coverage_types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {campaign_sections.length > 0 && (
            <select
              value={filterSection}
              onChange={e => setFilterSection(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
            >
              <option value="">All Sections</option>
              {campaign_sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#64748b', alignSelf: 'center' }}>
            Showing {filteredItems.length} of {items.length} pieces
          </div>
        </div>

        {/* Coverage items grouped by section */}
        {Object.entries(grouped).map(([section, sectionItems]) => (
          <div key={section} style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '16px', paddingBottom: '8px', borderBottom: '2px solid #e2e8f0' }}>
              {section}
              <span style={{ fontSize: '13px', fontWeight: 400, color: '#64748b', marginLeft: '8px' }}>({sectionItems.length})</span>
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sectionItems.map(item => {
                const outlet = item.outlet as unknown as OutletData | null
                const tier = outlet?.tier || 'untiered'
                const tc = tierColors[tier] || tierColors.untiered

                return (
                  <div key={item.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                    {/* Type icon */}
                    <div style={{ fontSize: '24px', minWidth: '36px', textAlign: 'center', paddingTop: '2px' }}>
                      {typeIcons[item.coverage_type] || '📄'}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        {/* Outlet name */}
                        <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '14px' }}>
                          {outlet?.name || 'Unknown Outlet'}
                        </span>
                        {/* Tier badge */}
                        <span style={{ background: tc.bg, color: tc.text, padding: '1px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                          Tier {tier}
                        </span>
                        {/* Type badge */}
                        <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 8px', borderRadius: '12px', fontSize: '11px' }}>
                          {item.coverage_type}
                        </span>
                        {/* Territory */}
                        {item.territory && (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>{item.territory}</span>
                        )}
                      </div>

                      {/* Title */}
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '14px', lineHeight: '1.4' }}>
                          {item.title || item.url}
                        </a>
                      ) : (
                        <span style={{ color: '#334155', fontSize: '14px' }}>{item.title || 'Untitled'}</span>
                      )}

                      {/* Meta row */}
                      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                        {item.publish_date && <span>{item.publish_date}</span>}
                        {outlet?.monthly_unique_visitors && (
                          <span>{formatNumber(outlet.monthly_unique_visitors)} monthly visitors</span>
                        )}
                        {item.review_score != null && (
                          <span style={{ fontWeight: 600, color: Number(item.review_score) >= 7 ? '#166534' : Number(item.review_score) >= 5 ? '#92400e' : '#dc2626' }}>
                            Score: {item.review_score}/10
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
            <div>No coverage items match the selected filters.</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '24px', borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '12px' }}>
        Powered by GameDrive
      </div>
    </div>
  )
}
