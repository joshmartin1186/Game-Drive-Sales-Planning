'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'

interface NameValue { name: string; value: number }
interface OutletSummary { name: string; count: number; tier: string; visitors: number }
interface Annotation { id: string; report_section: string; period_key: string; annotation_text: string; custom_fields: Record<string, unknown> }
interface CoverageItem { id: string; title: string; url: string; publish_date: string; territory: string; coverage_type: string; monthly_unique_visitors: number; review_score: number | null; quotes: string | null; outlet: { name: string; tier: string } | null; game: { name: string } | null; campaign: { name: string } | null; campaign_section: string | null }

interface SalesData {
  total_rows: number; total_gross_revenue: number; total_net_revenue: number
  total_gross_units: number; total_net_units: number; avg_price: number
  platform_revenue: NameValue[]; platform_units: NameValue[]
  country_revenue: NameValue[]; product_revenue: NameValue[]; product_units: NameValue[]
  daily_revenue: { date: string; value: number }[]
}

interface CoverageData {
  total_pieces: number; total_audience_reach: number; estimated_views: number
  avg_review_score: number | null; tier_breakdown: NameValue[]
  type_breakdown: NameValue[]; territory_breakdown: NameValue[]
  top_outlets: OutletSummary[]; items: CoverageItem[]
}

interface ReportData {
  sales?: SalesData; coverage?: CoverageData
  annotations: Annotation[]; client: { id: string; name: string } | null
  game?: { id: string; name: string } | null
}

const DATE_PRESETS = [
  { label: 'Last 30 Days', value: 'last30' },
  { label: 'Last 90 Days', value: 'last90' },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'This Quarter', value: 'thisQuarter' },
  { label: 'Last Quarter', value: 'lastQuarter' },
  { label: 'YTD', value: 'ytd' },
  { label: 'Last Year', value: 'lastYear' },
  { label: 'All Time', value: 'all' },
  { label: 'Custom', value: 'custom' },
]

function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  const fmt = (dt: Date) => dt.toISOString().split('T')[0]
  switch (preset) {
    case 'last30': return { from: fmt(new Date(y, m, d - 30)), to: fmt(now) }
    case 'last90': return { from: fmt(new Date(y, m, d - 90)), to: fmt(now) }
    case 'thisMonth': return { from: fmt(new Date(y, m, 1)), to: fmt(now) }
    case 'lastMonth': return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) }
    case 'thisQuarter': { const qStart = new Date(y, Math.floor(m / 3) * 3, 1); return { from: fmt(qStart), to: fmt(now) } }
    case 'lastQuarter': { const qs = Math.floor(m / 3) * 3; return { from: fmt(new Date(y, qs - 3, 1)), to: fmt(new Date(y, qs, 0)) } }
    case 'ytd': return { from: fmt(new Date(y, 0, 1)), to: fmt(now) }
    case 'lastYear': return { from: fmt(new Date(y - 1, 0, 1)), to: fmt(new Date(y - 1, 11, 31)) }
    default: return { from: '', to: '' }
  }
}

function getPeriodKey(preset: string, dateFrom: string, dateTo: string): string {
  if (preset === 'custom') return `custom-${dateFrom}-${dateTo}`
  return preset
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val)
}

function formatNumber(val: number): string {
  return new Intl.NumberFormat('en-US').format(val)
}

const TABS = ['Summary', 'Sales Report', 'PR Coverage'] as const
type Tab = typeof TABS[number]

export default function ReportsPage() {
  const supabase = createClientComponentClient()
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [games, setGames] = useState<{ id: string; name: string }[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [selectedGame, setSelectedGame] = useState('')
  const [datePreset, setDatePreset] = useState('last30')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('Summary')
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [annotations, setAnnotations] = useState<Record<string, string>>({})
  const [savingAnnotation, setSavingAnnotation] = useState<string | null>(null)

  // Load clients
  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then(({ data }) => {
      if (data) setClients(data)
    })
  }, [supabase])

  // Load games when client changes
  useEffect(() => {
    if (!selectedClient) { setGames([]); return }
    supabase.from('games').select('id, name').eq('client_id', selectedClient).order('name').then(({ data }) => {
      if (data) setGames(data)
    })
  }, [selectedClient, supabase])

  const fetchReport = useCallback(async () => {
    if (!selectedClient) return
    setLoading(true)
    try {
      const range = datePreset === 'custom' ? { from: dateFrom, to: dateTo } : getDateRange(datePreset)
      const params = new URLSearchParams({ client_id: selectedClient })
      if (selectedGame) params.set('game_id', selectedGame)
      if (range.from) params.set('date_from', range.from)
      if (range.to) params.set('date_to', range.to)

      const res = await fetch(`/api/reports?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setReportData(data)
      // Populate annotations from fetched data
      const annMap: Record<string, string> = {}
      for (const ann of (data.annotations || [])) {
        annMap[ann.report_section] = ann.annotation_text || ''
      }
      setAnnotations(annMap)
    } catch (err) {
      console.error('Failed to fetch report:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedClient, selectedGame, datePreset, dateFrom, dateTo])

  const saveAnnotation = async (section: string) => {
    if (!selectedClient) return
    setSavingAnnotation(section)
    try {
      const range = datePreset === 'custom' ? { from: dateFrom, to: dateTo } : getDateRange(datePreset)
      const periodKey = getPeriodKey(datePreset, range.from, range.to)
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClient,
          game_id: selectedGame || null,
          report_section: section,
          period_key: periodKey,
          annotation_text: annotations[section] || '',
        }),
      })
    } catch (err) {
      console.error('Failed to save annotation:', err)
    } finally {
      setSavingAnnotation(null)
    }
  }

  const exportPDF = () => {
    if (!reportData) return
    const clientName = reportData.client?.name || 'Client'
    const gameName = reportData.game?.name || ''
    const range = datePreset === 'custom' ? { from: dateFrom, to: dateTo } : getDateRange(datePreset)
    const periodLabel = datePreset === 'custom' ? `${range.from} to ${range.to}` : DATE_PRESETS.find(p => p.value === datePreset)?.label || datePreset

    const w = window.open('', '_blank')
    if (!w) return

    const sales = reportData.sales
    const cov = reportData.coverage

    w.document.write(`<!DOCTYPE html><html><head><title>${clientName} Report - ${periodLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; background: #fff; padding: 40px; }
  .header { text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #3b82f6; }
  .header h1 { font-size: 28px; color: #1e293b; margin-bottom: 4px; }
  .header .subtitle { font-size: 14px; color: #64748b; }
  .section { margin-bottom: 32px; page-break-inside: avoid; }
  .section h2 { font-size: 20px; color: #1e293b; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
  .section h3 { font-size: 16px; color: #334155; margin-bottom: 12px; }
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
  .stat-card .value { font-size: 24px; font-weight: 700; color: #1e293b; }
  .stat-card .label { font-size: 12px; color: #64748b; margin-top: 4px; }
  .breakdown-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
  .breakdown-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  .breakdown-card h4 { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #334155; }
  .breakdown-item { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
  .breakdown-item .name { color: #475569; } .breakdown-item .val { font-weight: 600; color: #1e293b; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
  td { padding: 6px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
  .tier-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .tier-A { background: #dcfce7; color: #166534; } .tier-B { background: #dbeafe; color: #1e40af; }
  .tier-C { background: #fef3c7; color: #92400e; } .tier-D { background: #f3f4f6; color: #374151; }
  .annotation { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0; font-size: 14px; color: #334155; white-space: pre-wrap; }
  .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
  @media print { body { padding: 20px; } .stats-grid { grid-template-columns: repeat(4, 1fr); } }
</style></head><body>
<div class="header">
  <h1>${clientName}${gameName ? ' — ' + gameName : ''}</h1>
  <div class="subtitle">Performance Report | ${periodLabel} | Generated ${new Date().toLocaleDateString()}</div>
</div>

${annotations.summary ? `<div class="section"><h2>Executive Summary</h2><div class="annotation">${annotations.summary}</div></div>` : ''}

${sales ? `
<div class="section">
  <h2>Sales Performance</h2>
  <div class="stats-grid">
    <div class="stat-card"><div class="value">${formatCurrency(sales.total_net_revenue)}</div><div class="label">Net Revenue</div></div>
    <div class="stat-card"><div class="value">${formatNumber(sales.total_net_units)}</div><div class="label">Net Units Sold</div></div>
    <div class="stat-card"><div class="value">${formatCurrency(sales.avg_price)}</div><div class="label">Avg Price / Unit</div></div>
    <div class="stat-card"><div class="value">${sales.platform_revenue.length}</div><div class="label">Platforms</div></div>
  </div>
  <div class="breakdown-grid">
    <div class="breakdown-card"><h4>Revenue by Platform</h4>${sales.platform_revenue.map(p => `<div class="breakdown-item"><span class="name">${p.name}</span><span class="val">${formatCurrency(p.value)}</span></div>`).join('')}</div>
    <div class="breakdown-card"><h4>Revenue by Product</h4>${sales.product_revenue.slice(0, 10).map(p => `<div class="breakdown-item"><span class="name">${p.name}</span><span class="val">${formatCurrency(p.value)}</span></div>`).join('')}</div>
    <div class="breakdown-card"><h4>Top Countries</h4>${sales.country_revenue.slice(0, 10).map(p => `<div class="breakdown-item"><span class="name">${p.name}</span><span class="val">${formatCurrency(p.value)}</span></div>`).join('')}</div>
  </div>
  ${annotations.sales ? `<div class="annotation">${annotations.sales}</div>` : ''}
</div>` : ''}

${cov ? `
<div class="section">
  <h2>PR Coverage</h2>
  <div class="stats-grid">
    <div class="stat-card"><div class="value">${formatNumber(cov.total_pieces)}</div><div class="label">Total Pieces</div></div>
    <div class="stat-card"><div class="value">${formatNumber(cov.total_audience_reach)}</div><div class="label">Audience Reach</div></div>
    <div class="stat-card"><div class="value">${formatNumber(cov.estimated_views)}</div><div class="label">Est. Views</div></div>
    <div class="stat-card"><div class="value">${cov.avg_review_score ?? 'N/A'}</div><div class="label">Avg Review Score</div></div>
  </div>
  <div class="breakdown-grid">
    <div class="breakdown-card"><h4>By Tier</h4>${cov.tier_breakdown.map(t => `<div class="breakdown-item"><span class="name">Tier ${t.name}</span><span class="val">${t.value}</span></div>`).join('')}</div>
    <div class="breakdown-card"><h4>By Type</h4>${cov.type_breakdown.map(t => `<div class="breakdown-item"><span class="name">${t.name}</span><span class="val">${t.value}</span></div>`).join('')}</div>
    <div class="breakdown-card"><h4>By Territory</h4>${cov.territory_breakdown.slice(0, 8).map(t => `<div class="breakdown-item"><span class="name">${t.name}</span><span class="val">${t.value}</span></div>`).join('')}</div>
  </div>

  ${cov.top_outlets.length > 0 ? `<h3>Top Outlets</h3><table><thead><tr><th>Outlet</th><th>Tier</th><th>Pieces</th><th>Monthly Visitors</th></tr></thead><tbody>
    ${cov.top_outlets.map(o => `<tr><td>${o.name}</td><td><span class="tier-badge tier-${o.tier}">${o.tier}</span></td><td>${o.count}</td><td>${formatNumber(o.visitors)}</td></tr>`).join('')}
  </tbody></table>` : ''}

  ${cov.items.length > 0 ? `<h3>Coverage Items</h3><table><thead><tr><th>Date</th><th>Outlet</th><th>Title</th><th>Territory</th><th>Type</th></tr></thead><tbody>
    ${cov.items.slice(0, 50).map(i => `<tr><td>${i.publish_date || ''}</td><td>${(i.outlet as unknown as Record<string, string>)?.name || ''}</td><td>${i.title || ''}</td><td>${i.territory || ''}</td><td>${i.coverage_type || ''}</td></tr>`).join('')}
  </tbody></table>` : ''}
  ${annotations.pr_coverage ? `<div class="annotation">${annotations.pr_coverage}</div>` : ''}
</div>` : ''}

<div class="footer">Generated by GameDrive | ${new Date().toLocaleString()}</div>
</body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  // Styles
  const pageStyle: React.CSSProperties = { padding: '32px', maxWidth: '1400px', margin: '0 auto' }
  const headerStyle: React.CSSProperties = { marginBottom: '24px' }
  const h1Style: React.CSSProperties = { fontSize: '24px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }
  const subtitleStyle: React.CSSProperties = { fontSize: '14px', color: '#64748b' }
  const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }
  const filterRow: React.CSSProperties = { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }
  const selectStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', minWidth: '180px', background: '#fff' }
  const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }
  const btnPrimary: React.CSSProperties = { padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }
  const btnOutline: React.CSSProperties = { padding: '8px 16px', background: '#fff', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }
  const tabBar: React.CSSProperties = { display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }
  const statGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }
  const statCard: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', textAlign: 'center' }
  const statValue: React.CSSProperties = { fontSize: '24px', fontWeight: 700, color: '#1e293b' }
  const statLabel: React.CSSProperties = { fontSize: '12px', color: '#64748b', marginTop: '4px' }
  const breakGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }
  const breakCard: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }
  const breakTitle: React.CSSProperties = { fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '8px' }
  const breakItem: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }
  const textareaStyle: React.CSSProperties = { width: '100%', minHeight: '100px', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }
  const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }
  const thStyle: React.CSSProperties = { background: '#f1f5f9', textAlign: 'left' as const, padding: '8px 12px', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }
  const tdStyle: React.CSSProperties = { padding: '6px 12px', borderBottom: '1px solid #f1f5f9', color: '#334155' }
  const tierColors: Record<string, React.CSSProperties> = {
    A: { background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' },
    B: { background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' },
    C: { background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' },
    D: { background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block' },
  }

  const sales = reportData?.sales
  const cov = reportData?.coverage

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={h1Style}>Client Report Builder</h1>
        <p style={subtitleStyle}>Generate comprehensive performance reports combining sales data and PR coverage</p>
      </div>

      {/* Filters */}
      <div style={cardStyle}>
        <div style={filterRow}>
          <div>
            <label style={labelStyle}>Client</label>
            <select style={selectStyle} value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setSelectedGame('') }}>
              <option value="">Select Client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Game (optional)</label>
            <select style={selectStyle} value={selectedGame} onChange={e => setSelectedGame(e.target.value)}>
              <option value="">All Games</option>
              {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Period</label>
            <select style={selectStyle} value={datePreset} onChange={e => setDatePreset(e.target.value)}>
              {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {datePreset === 'custom' && (
            <>
              <div>
                <label style={labelStyle}>From</label>
                <input type="date" style={inputStyle} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>To</label>
                <input type="date" style={inputStyle} value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <button style={{ ...btnPrimary, opacity: loading || !selectedClient ? 0.6 : 1 }} onClick={fetchReport} disabled={loading || !selectedClient}>
              {loading ? 'Loading...' : 'Generate Report'}
            </button>
            {reportData && (
              <button style={btnOutline} onClick={exportPDF}>Export PDF</button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      {reportData && (
        <>
          <div style={tabBar}>
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '10px 20px', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === tab ? '#3b82f6' : '#64748b', fontWeight: activeTab === tab ? 600 : 400, fontSize: '14px', cursor: 'pointer', marginBottom: '-2px',
              }}>{tab}</button>
            ))}
          </div>

          {/* SUMMARY TAB */}
          {activeTab === 'Summary' && (
            <div>
              <div style={cardStyle}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>Executive Summary</h2>
                <textarea
                  style={textareaStyle}
                  placeholder="Write your executive summary here... This will be included in the exported report."
                  value={annotations.summary || ''}
                  onChange={e => setAnnotations(prev => ({ ...prev, summary: e.target.value }))}
                />
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button style={{ ...btnPrimary, fontSize: '13px', padding: '6px 16px' }} onClick={() => saveAnnotation('summary')} disabled={savingAnnotation === 'summary'}>
                    {savingAnnotation === 'summary' ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Key metrics overview */}
              <div style={statGrid}>
                <div style={statCard}>
                  <div style={statValue}>{sales ? formatCurrency(sales.total_net_revenue) : '$0'}</div>
                  <div style={statLabel}>Net Revenue</div>
                </div>
                <div style={statCard}>
                  <div style={statValue}>{sales ? formatNumber(sales.total_net_units) : '0'}</div>
                  <div style={statLabel}>Units Sold</div>
                </div>
                <div style={statCard}>
                  <div style={statValue}>{cov ? formatNumber(cov.total_pieces) : '0'}</div>
                  <div style={statLabel}>Coverage Pieces</div>
                </div>
                <div style={statCard}>
                  <div style={statValue}>{cov ? formatNumber(cov.total_audience_reach) : '0'}</div>
                  <div style={statLabel}>Audience Reach</div>
                </div>
              </div>

              {/* Quick breakdowns */}
              <div style={breakGrid}>
                {sales && sales.platform_revenue.length > 0 && (
                  <div style={breakCard}>
                    <div style={breakTitle}>Revenue by Platform</div>
                    {sales.platform_revenue.slice(0, 6).map(p => (
                      <div key={p.name} style={breakItem}>
                        <span style={{ color: '#475569' }}>{p.name}</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{formatCurrency(p.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {cov && cov.tier_breakdown.length > 0 && (
                  <div style={breakCard}>
                    <div style={breakTitle}>Coverage by Tier</div>
                    {cov.tier_breakdown.map(t => (
                      <div key={t.name} style={breakItem}>
                        <span style={{ color: '#475569' }}>Tier {t.name}</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{t.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {cov && cov.type_breakdown.length > 0 && (
                  <div style={breakCard}>
                    <div style={breakTitle}>Coverage by Type</div>
                    {cov.type_breakdown.map(t => (
                      <div key={t.name} style={breakItem}>
                        <span style={{ color: '#475569' }}>{t.name}</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{t.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SALES TAB */}
          {activeTab === 'Sales Report' && sales && (
            <div>
              <div style={cardStyle}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>Sales Performance</h2>
                <div style={statGrid}>
                  <div style={statCard}>
                    <div style={statValue}>{formatCurrency(sales.total_net_revenue)}</div>
                    <div style={statLabel}>Net Revenue</div>
                  </div>
                  <div style={statCard}>
                    <div style={statValue}>{formatNumber(sales.total_gross_units)}</div>
                    <div style={statLabel}>Gross Units</div>
                  </div>
                  <div style={statCard}>
                    <div style={statValue}>{formatNumber(sales.total_net_units)}</div>
                    <div style={statLabel}>Net Units</div>
                  </div>
                  <div style={statCard}>
                    <div style={statValue}>{formatCurrency(sales.avg_price)}</div>
                    <div style={statLabel}>Avg Price / Unit</div>
                  </div>
                </div>
              </div>

              <div style={breakGrid}>
                <div style={breakCard}>
                  <div style={breakTitle}>Revenue by Platform</div>
                  {sales.platform_revenue.map(p => (
                    <div key={p.name} style={breakItem}>
                      <span style={{ color: '#475569' }}>{p.name}</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{formatCurrency(p.value)}</span>
                    </div>
                  ))}
                </div>
                <div style={breakCard}>
                  <div style={breakTitle}>Revenue by Product</div>
                  {sales.product_revenue.slice(0, 10).map(p => (
                    <div key={p.name} style={breakItem}>
                      <span style={{ color: '#475569' }}>{p.name}</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{formatCurrency(p.value)}</span>
                    </div>
                  ))}
                </div>
                <div style={breakCard}>
                  <div style={breakTitle}>Top Countries</div>
                  {sales.country_revenue.slice(0, 10).map(p => (
                    <div key={p.name} style={breakItem}>
                      <span style={{ color: '#475569' }}>{p.name}</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{formatCurrency(p.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Units by platform */}
              {sales.platform_units.length > 0 && (
                <div style={cardStyle}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>Units by Platform</h3>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Platform</th>
                        <th style={thStyle}>Units Sold</th>
                        <th style={thStyle}>Revenue</th>
                        <th style={thStyle}>Rev / Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.platform_revenue.map(p => {
                        const units = sales.platform_units.find(u => u.name === p.name)?.value || 0
                        return (
                          <tr key={p.name}>
                            <td style={tdStyle}>{p.name}</td>
                            <td style={tdStyle}>{formatNumber(units)}</td>
                            <td style={tdStyle}>{formatCurrency(p.value)}</td>
                            <td style={tdStyle}>{units > 0 ? formatCurrency(p.value / units) : '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sales analysis */}
              <div style={cardStyle}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>Sales Analysis</h3>
                <textarea
                  style={textareaStyle}
                  placeholder="Add your sales analysis commentary here..."
                  value={annotations.sales || ''}
                  onChange={e => setAnnotations(prev => ({ ...prev, sales: e.target.value }))}
                />
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button style={{ ...btnPrimary, fontSize: '13px', padding: '6px 16px' }} onClick={() => saveAnnotation('sales')} disabled={savingAnnotation === 'sales'}>
                    {savingAnnotation === 'sales' ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PR COVERAGE TAB */}
          {activeTab === 'PR Coverage' && cov && (
            <div>
              <div style={cardStyle}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>PR Coverage Report</h2>
                <div style={statGrid}>
                  <div style={statCard}>
                    <div style={statValue}>{formatNumber(cov.total_pieces)}</div>
                    <div style={statLabel}>Total Pieces</div>
                  </div>
                  <div style={statCard}>
                    <div style={statValue}>{formatNumber(cov.total_audience_reach)}</div>
                    <div style={statLabel}>Audience Reach</div>
                  </div>
                  <div style={statCard}>
                    <div style={statValue}>{formatNumber(cov.estimated_views)}</div>
                    <div style={statLabel}>Est. Views</div>
                  </div>
                  <div style={statCard}>
                    <div style={statValue}>{cov.avg_review_score ?? 'N/A'}</div>
                    <div style={statLabel}>Avg Review Score</div>
                  </div>
                </div>
              </div>

              <div style={breakGrid}>
                <div style={breakCard}>
                  <div style={breakTitle}>By Tier</div>
                  {cov.tier_breakdown.map(t => (
                    <div key={t.name} style={breakItem}>
                      <span style={tierColors[t.name] || { color: '#475569' }}>Tier {t.name}</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{t.value}</span>
                    </div>
                  ))}
                </div>
                <div style={breakCard}>
                  <div style={breakTitle}>By Type</div>
                  {cov.type_breakdown.map(t => (
                    <div key={t.name} style={breakItem}>
                      <span style={{ color: '#475569' }}>{t.name}</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{t.value}</span>
                    </div>
                  ))}
                </div>
                <div style={breakCard}>
                  <div style={breakTitle}>By Territory</div>
                  {cov.territory_breakdown.slice(0, 8).map(t => (
                    <div key={t.name} style={breakItem}>
                      <span style={{ color: '#475569' }}>{t.name}</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{t.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top outlets table */}
              {cov.top_outlets.length > 0 && (
                <div style={cardStyle}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>Top Outlets</h3>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Outlet</th>
                        <th style={thStyle}>Tier</th>
                        <th style={thStyle}>Pieces</th>
                        <th style={thStyle}>Monthly Visitors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cov.top_outlets.map(o => (
                        <tr key={o.name}>
                          <td style={tdStyle}>{o.name}</td>
                          <td style={tdStyle}><span style={tierColors[o.tier] || {}}>{o.tier}</span></td>
                          <td style={tdStyle}>{o.count}</td>
                          <td style={tdStyle}>{formatNumber(o.visitors)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Coverage items table */}
              {cov.items.length > 0 && (
                <div style={cardStyle}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>Coverage Items ({cov.items.length})</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Date</th>
                          <th style={thStyle}>Outlet</th>
                          <th style={thStyle}>Tier</th>
                          <th style={thStyle}>Title</th>
                          <th style={thStyle}>Territory</th>
                          <th style={thStyle}>Type</th>
                          <th style={thStyle}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cov.items.map(item => (
                          <tr key={item.id}>
                            <td style={tdStyle}>{item.publish_date || '-'}</td>
                            <td style={tdStyle}>{(item.outlet as unknown as Record<string, string>)?.name || '-'}</td>
                            <td style={tdStyle}>
                              <span style={tierColors[(item.outlet as unknown as Record<string, string>)?.tier] || {}}>
                                {(item.outlet as unknown as Record<string, string>)?.tier || '-'}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>{item.title || item.url}</a> : (item.title || '-')}
                            </td>
                            <td style={tdStyle}>{item.territory || '-'}</td>
                            <td style={tdStyle}>{item.coverage_type || '-'}</td>
                            <td style={tdStyle}>{item.review_score ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* PR analysis */}
              <div style={cardStyle}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>PR Coverage Analysis</h3>
                <textarea
                  style={textareaStyle}
                  placeholder="Add your PR coverage analysis commentary here..."
                  value={annotations.pr_coverage || ''}
                  onChange={e => setAnnotations(prev => ({ ...prev, pr_coverage: e.target.value }))}
                />
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button style={{ ...btnPrimary, fontSize: '13px', padding: '6px 16px' }} onClick={() => saveAnnotation('pr_coverage')} disabled={savingAnnotation === 'pr_coverage'}>
                    {savingAnnotation === 'pr_coverage' ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* No data states */}
          {activeTab === 'Sales Report' && !sales && (
            <div style={{ ...cardStyle, textAlign: 'center', color: '#64748b', padding: '48px' }}>
              No sales data found for the selected filters.
            </div>
          )}
          {activeTab === 'PR Coverage' && !cov && (
            <div style={{ ...cardStyle, textAlign: 'center', color: '#64748b', padding: '48px' }}>
              No coverage data found for the selected filters.
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!reportData && !loading && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#64748b', padding: '64px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#128202;</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Generate a Client Report</div>
          <div>Select a client and period above, then click Generate Report to build a comprehensive performance report.</div>
        </div>
      )}
    </div>
  )
}
