'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

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

function formatFullNumber(val: number | null | undefined): string {
  if (val == null || val === 0) return '—'
  return val.toLocaleString()
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return dateStr
  }
}

const tierColors: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  B: { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  C: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  D: { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' },
  untiered: { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
}

export default function PublicFeedPage() {
  const params = useParams()
  const searchParams = useSearchParams()
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
      const qp = new URLSearchParams()
      if (pw) qp.set('password', pw)
      // Forward date filters from URL query params
      const dateFrom = searchParams.get('date_from')
      const dateTo = searchParams.get('date_to')
      if (dateFrom) qp.set('date_from', dateFrom)
      if (dateTo) qp.set('date_to', dateTo)
      const res = await fetch(`/api/public-feed/${slug}?${qp}`)
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
  }, [slug, searchParams])

  useEffect(() => { fetchFeed() }, [fetchFeed])

  // Password gate
  if (needsPassword) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f4ff 0%, #f8fafc 100%)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ background: '#fff', padding: '48px', borderRadius: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px' }}>🔒</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Password Required</h2>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '28px', lineHeight: 1.5 }}>Enter the password to view this coverage report.</p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchFeed(password)}
            placeholder="Enter password..."
            style={{ width: '100%', padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', marginBottom: '16px', outline: 'none', transition: 'border-color 0.2s' }}
            onFocus={e => e.target.style.borderColor = '#3b82f6'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
          <button
            onClick={() => fetchFeed(password)}
            style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.2s', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}
            onMouseDown={e => (e.target as HTMLElement).style.transform = 'scale(0.98)'}
            onMouseUp={e => (e.target as HTMLElement).style.transform = 'scale(1)'}
          >View Coverage Report</button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ width: '48px', height: '48px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: '15px', fontWeight: 500 }}>Loading coverage report...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Feed Not Available</h2>
          <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (!feedData) return null

  const { game, client, summary, items, campaign_sections, coverage_types } = feedData
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

  // Check if any items have review scores or quotes
  const hasReviewScores = filteredItems.some(i => i.review_score != null)
  const hasQuotes = filteredItems.some(i => i.quotes)

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
        color: '#fff', padding: '52px 32px 48px', textAlign: 'center',
        borderBottom: '4px solid #3b82f6'
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          {/* Client name */}
          <div style={{
            display: 'inline-block', padding: '4px 16px', borderRadius: '20px',
            background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.3)',
            fontSize: '13px', fontWeight: 600, color: '#93c5fd', letterSpacing: '0.5px',
            textTransform: 'uppercase', marginBottom: '16px'
          }}>
            {client.name}
          </div>

          {/* Game name */}
          <h1 style={{
            fontSize: '36px', fontWeight: 800, marginBottom: '8px',
            color: '#ffffff', letterSpacing: '-0.5px',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            {game.name}
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: '15px', color: '#cbd5e1', marginBottom: '32px', fontWeight: 400 }}>
            Media Coverage Report{dateRange.from && dateRange.to ? ` \u2014 ${formatDate(dateRange.from)} to ${formatDate(dateRange.to)}` : ''}
          </p>

          {/* Summary stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px',
            maxWidth: '860px', margin: '0 auto'
          }}>
            {[
              { label: 'Total Pieces', value: summary.total_pieces.toLocaleString(), icon: '📊' },
              { label: 'Audience Reach', value: formatNumber(summary.total_audience_reach), icon: '👥' },
              { label: 'Est. Views', value: formatNumber(summary.estimated_views), icon: '👁️' },
              { label: 'Avg Review Score', value: summary.avg_review_score ? `${summary.avg_review_score.toFixed(1)}/10` : 'N/A', icon: '⭐' },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px 16px',
                backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)',
                transition: 'background 0.2s'
              }}>
                <div style={{ fontSize: '13px', marginBottom: '8px' }}>{stat.icon}</div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>{stat.value}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 24px' }}>
        {/* Filters bar */}
        <div style={{
          display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px',
          alignItems: 'center', padding: '14px 20px',
          background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0'
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginRight: '4px' }}>Filter:</span>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{
              padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: '8px',
              fontSize: '13px', background: '#f8fafc', color: '#334155', cursor: 'pointer',
              fontWeight: 500, outline: 'none'
            }}
          >
            <option value="">All Types</option>
            {coverage_types.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          {campaign_sections.length > 0 && (
            <select
              value={filterSection}
              onChange={e => setFilterSection(e.target.value)}
              style={{
                padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: '8px',
                fontSize: '13px', background: '#f8fafc', color: '#334155', cursor: 'pointer',
                fontWeight: 500, outline: 'none'
              }}
            >
              <option value="">All Sections</option>
              {campaign_sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
            Showing <strong style={{ color: '#1e293b' }}>{filteredItems.length}</strong> of {items.length} pieces
          </div>
        </div>

        {/* Coverage items grouped by section — TABLE layout */}
        {Object.entries(grouped).map(([section, sectionItems]) => (
          <div key={section} style={{ marginBottom: '32px' }}>
            {/* Section header */}
            <div style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
              padding: '14px 20px', borderRadius: '12px 12px 0 0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#fff', letterSpacing: '-0.2px' }}>
                {section}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#94a3b8' }}>
                {sectionItems.length} {sectionItems.length === 1 ? 'piece' : 'pieces'}
              </span>
            </div>

            {/* Table */}
            <div style={{
              background: '#fff', borderRadius: '0 0 12px 12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden',
              border: '1px solid #e2e8f0', borderTop: 'none'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', width: '90px' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', width: '90px' }}>Territory</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', width: '160px' }}>Media Outlet</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', width: '50px' }}>Tier</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', width: '80px' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc' }}>Title</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 600, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', width: '120px' }}>Monthly Visitors</th>
                    {hasReviewScores && (
                      <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', width: '70px' }}>Score</th>
                    )}
                    {hasQuotes && (
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', width: '180px' }}>Notes</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sectionItems.map((item, i) => {
                    const outlet = item.outlet as unknown as OutletData | null
                    const tier = outlet?.tier || 'untiered'
                    const tc = tierColors[tier] || tierColors.untiered
                    const visitors = outlet?.monthly_unique_visitors || item.monthly_unique_visitors

                    return (
                      <tr key={item.id} style={{
                        borderBottom: i < sectionItems.length - 1 ? '1px solid #f1f5f9' : 'none',
                        background: i % 2 === 0 ? '#ffffff' : '#fafbfc',
                        transition: 'background 0.15s'
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f7ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#ffffff' : '#fafbfc')}
                      >
                        {/* Date */}
                        <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {formatDate(item.publish_date)}
                        </td>

                        {/* Territory */}
                        <td style={{ padding: '10px 14px', color: '#475569', fontSize: '12px' }}>
                          {item.territory || outlet?.country || '—'}
                        </td>

                        {/* Media Outlet */}
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>
                          {outlet?.name || '—'}
                        </td>

                        {/* Tier */}
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {tier !== 'untiered' ? (
                            <span style={{
                              display: 'inline-block', padding: '2px 10px', borderRadius: '10px',
                              fontSize: '11px', fontWeight: 700,
                              background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`
                            }}>{tier}</span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                          )}
                        </td>

                        {/* Type */}
                        <td style={{ padding: '10px 14px', fontSize: '12px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
                            background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 500,
                            textTransform: 'capitalize'
                          }}>
                            {item.coverage_type || '—'}
                          </span>
                        </td>

                        {/* Title */}
                        <td style={{ padding: '10px 14px', maxWidth: '300px' }}>
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{
                              color: '#2563eb', textDecoration: 'none', fontSize: '13px',
                              lineHeight: 1.4, fontWeight: 500,
                              display: 'block', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}
                              onMouseEnter={e => (e.target as HTMLElement).style.textDecoration = 'underline'}
                              onMouseLeave={e => (e.target as HTMLElement).style.textDecoration = 'none'}
                            >
                              {item.title || item.url}
                            </a>
                          ) : (
                            <span style={{ color: '#334155', fontSize: '13px' }}>{item.title || 'Untitled'}</span>
                          )}
                        </td>

                        {/* Monthly Visitors */}
                        <td style={{
                          padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          color: '#334155', fontSize: '12px', fontWeight: 500
                        }}>
                          {formatFullNumber(visitors)}
                        </td>

                        {/* Review Score */}
                        {hasReviewScores && (
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            {item.review_score != null ? (
                              <span style={{
                                fontWeight: 700, fontSize: '13px',
                                color: Number(item.review_score) >= 8 ? '#166534' : Number(item.review_score) >= 6 ? '#1e40af' : Number(item.review_score) >= 5 ? '#92400e' : '#dc2626'
                              }}>
                                {item.review_score}
                              </span>
                            ) : (
                              <span style={{ color: '#d1d5db' }}>—</span>
                            )}
                          </td>
                        )}

                        {/* Quotes/Notes */}
                        {hasQuotes && (
                          <td style={{ padding: '10px 14px', fontSize: '12px', color: '#64748b', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.quotes || ''}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '64px 24px', color: '#64748b',
            background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
            <div style={{ fontSize: '15px', fontWeight: 500 }}>No coverage items match the selected filters.</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        textAlign: 'center', padding: '28px 24px',
        borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '12px',
        background: '#fff'
      }}>
        <span style={{ fontWeight: 600, color: '#64748b' }}>GameDrive</span>
        <span style={{ margin: '0 8px', color: '#d1d5db' }}>|</span>
        Coverage Tracking & Media Intelligence
      </div>
    </div>
  )
}
