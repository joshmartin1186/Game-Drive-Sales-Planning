'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { format, parseISO, eachWeekOfInterval, endOfWeek, isWithinInterval, eachDayOfInterval } from 'date-fns'
import { SaleWithDetails } from '@/lib/types'
import { CoverageDayData } from './GanttChart'

interface CoverageCorrelationProps {
  coverageByDate: Record<string, CoverageDayData>
  sales: SaleWithDetails[]
  timelineStart: Date
  monthCount: number
  clientId?: string
  gameId?: string
}

interface WeekData {
  weekStart: Date
  weekEnd: Date
  label: string
  coverageCount: number
  coverageReach: number
  activeSales: number
  saleNames: string[]
  topTier: string
}

interface AttributionNote {
  id: string
  text: string
  timestamp: string
}

export default function CoverageCorrelation({ coverageByDate, sales, timelineStart, monthCount, clientId, gameId }: CoverageCorrelationProps) {
  const [metric, setMetric] = useState<'count' | 'reach'>('count')
  const [annotations, setAnnotations] = useState<Record<string, AttributionNote[]>>({})
  const [editingWeek, setEditingWeek] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  // Fetch persisted attributions
  const fetchAttributions = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (clientId) params.set('client_id', clientId)
      if (gameId) params.set('game_id', gameId)
      const res = await fetch(`/api/campaign-attributions?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      const grouped: Record<string, AttributionNote[]> = {}
      for (const item of data) {
        const key = item.week_start
        if (!grouped[key]) grouped[key] = []
        grouped[key].push({ id: item.id, text: item.note, timestamp: item.created_at })
      }
      setAnnotations(grouped)
    } catch (err) { console.error('Error fetching attributions:', err) }
  }, [clientId, gameId])

  useEffect(() => { fetchAttributions() }, [fetchAttributions])

  const timelineEnd = useMemo(() => {
    const end = new Date(timelineStart)
    end.setMonth(end.getMonth() + monthCount)
    return end
  }, [timelineStart, monthCount])

  const weeklyData = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: timelineStart, end: timelineEnd }, { weekStartsOn: 1 })
    return weeks.map((weekStart): WeekData => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
      const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
      let coverageCount = 0
      let coverageReach = 0
      let topTier = ''
      const tierRank: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 }

      for (const day of days) {
        const key = format(day, 'yyyy-MM-dd')
        const cov = coverageByDate[key]
        if (cov) {
          coverageCount += cov.count
          coverageReach += cov.totalReach
          if ((tierRank[cov.topTier] || 0) > (tierRank[topTier] || 0)) topTier = cov.topTier
        }
      }

      const activeSales = sales.filter(s => {
        const sStart = parseISO(s.start_date)
        const sEnd = parseISO(s.end_date)
        return isWithinInterval(weekStart, { start: sStart, end: sEnd }) ||
               isWithinInterval(weekEnd, { start: sStart, end: sEnd }) ||
               (sStart <= weekStart && sEnd >= weekEnd)
      })

      return {
        weekStart,
        weekEnd,
        label: format(weekStart, 'MMM d'),
        coverageCount,
        coverageReach,
        activeSales: activeSales.length,
        saleNames: Array.from(new Set(activeSales.map(s => s.sale_name || s.product?.name || 'Sale'))),
        topTier,
      }
    })
  }, [coverageByDate, sales, timelineStart, timelineEnd])

  const maxCoverage = useMemo(() => Math.max(...weeklyData.map(w => metric === 'count' ? w.coverageCount : w.coverageReach), 1), [weeklyData, metric])
  const maxSales = useMemo(() => Math.max(...weeklyData.map(w => w.activeSales), 1), [weeklyData])

  const totalCoverage = useMemo(() => weeklyData.reduce((sum, w) => sum + w.coverageCount, 0), [weeklyData])
  const totalReach = useMemo(() => weeklyData.reduce((sum, w) => sum + w.coverageReach, 0), [weeklyData])
  const peakWeek = useMemo(() => weeklyData.reduce((peak, w) => (w.coverageCount > peak.coverageCount) ? w : peak, weeklyData[0]), [weeklyData])

  const handleAddNote = async (weekKey: string) => {
    if (!noteText.trim()) return
    try {
      const res = await fetch('/api/campaign-attributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekKey, note: noteText, client_id: clientId || null, game_id: gameId || null }),
      })
      if (!res.ok) return
      const data = await res.json()
      const note: AttributionNote = { id: data.id, text: data.note, timestamp: data.created_at }
      setAnnotations(prev => ({ ...prev, [weekKey]: [...(prev[weekKey] || []), note] }))
      setNoteText('')
      setEditingWeek(null)
    } catch (err) { console.error('Error saving attribution:', err) }
  }

  const handleDeleteNote = async (weekKey: string, noteId: string) => {
    try {
      await fetch(`/api/campaign-attributions?id=${noteId}`, { method: 'DELETE' })
      setAnnotations(prev => ({ ...prev, [weekKey]: (prev[weekKey] || []).filter(n => n.id !== noteId) }))
    } catch (err) { console.error('Error deleting attribution:', err) }
  }

  if (!weeklyData.length) return null

  const chartHeight = 200
  const barWidth = Math.max(Math.min(Math.floor((100 / weeklyData.length) * 0.8), 4), 0.5)
  const gapWidth = Math.max(100 / weeklyData.length - barWidth, 0.2)

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>Coverage ↔ Sales Correlation</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>Weekly coverage volume overlaid with active sale periods</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as 'count' | 'reach')}
            style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#f8fafc' }}
          >
            <option value="count">Article Count</option>
            <option value="reach">Total Reach</option>
          </select>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>{totalCoverage}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Total Articles</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>{totalReach >= 1000000 ? `${(totalReach / 1000000).toFixed(1)}M` : totalReach >= 1000 ? `${(totalReach / 1000).toFixed(0)}K` : totalReach}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Total Reach</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>{peakWeek ? format(peakWeek.weekStart, 'MMM d') : '-'}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Peak Coverage Week</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>{peakWeek?.coverageCount || 0}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Peak Articles</div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: '20px', position: 'relative' }}>
        {/* Y-axis labels */}
        <div style={{ display: 'flex', gap: '0' }}>
          <div style={{ width: '50px', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: chartHeight, paddingRight: '8px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'right' }}>{metric === 'count' ? maxCoverage : maxCoverage >= 1000000 ? `${(maxCoverage / 1000000).toFixed(0)}M` : `${(maxCoverage / 1000).toFixed(0)}K`}</span>
            <span style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'right' }}>0</span>
          </div>

          {/* Bars */}
          <div style={{ flex: 1, height: chartHeight, position: 'relative', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
            {weeklyData.map((week, idx) => {
              const covValue = metric === 'count' ? week.coverageCount : week.coverageReach
              const covHeight = (covValue / maxCoverage) * chartHeight
              const salesHeight = (week.activeSales / maxSales) * chartHeight
              const weekKey = format(week.weekStart, 'yyyy-MM-dd')
              const hasNotes = (annotations[weekKey] || []).length > 0
              const tierColor = week.topTier === 'A' ? '#ef4444' : week.topTier === 'B' ? '#f59e0b' : week.topTier === 'C' ? '#3b82f6' : '#94a3b8'

              return (
                <div
                  key={idx}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', cursor: 'pointer' }}
                  title={`Week of ${week.label}\n${week.coverageCount} articles (${week.coverageReach.toLocaleString()} reach)\n${week.activeSales} active sales${week.saleNames.length ? ': ' + week.saleNames.join(', ') : ''}`}
                  onClick={() => { setEditingWeek(editingWeek === weekKey ? null : weekKey); setNoteText('') }}
                >
                  {/* Sale background highlight */}
                  {week.activeSales > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: '10%', right: '10%',
                      height: `${Math.max(salesHeight, 20)}px`,
                      background: 'linear-gradient(to top, #dbeafe, transparent)',
                      borderRadius: '2px 2px 0 0',
                      opacity: 0.5,
                    }} />
                  )}

                  {/* Coverage bar */}
                  <div style={{
                    width: '60%', height: `${Math.max(covHeight, covValue > 0 ? 3 : 0)}px`,
                    background: tierColor,
                    borderRadius: '2px 2px 0 0',
                    opacity: 0.8,
                    position: 'relative',
                    zIndex: 1,
                    transition: 'height 0.3s',
                  }} />

                  {/* Note indicator */}
                  {hasNotes && (
                    <div style={{
                      position: 'absolute', top: -4, right: '20%',
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#8b5cf6', border: '1px solid #fff',
                    }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* X-axis labels — show every Nth */}
        <div style={{ display: 'flex', marginLeft: '50px', marginTop: '4px' }}>
          {weeklyData.map((week, idx) => {
            const showLabel = idx % Math.max(Math.ceil(weeklyData.length / 12), 1) === 0
            return (
              <div key={idx} style={{ flex: 1, textAlign: 'center', fontSize: '9px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                {showLabel ? week.label : ''}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '12px', fontSize: '11px', color: '#64748b' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, background: '#ef4444', borderRadius: '2px', display: 'inline-block' }} /> Tier A</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, background: '#f59e0b', borderRadius: '2px', display: 'inline-block' }} /> Tier B</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: '2px', display: 'inline-block' }} /> Tier C</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, background: '#94a3b8', borderRadius: '2px', display: 'inline-block' }} /> Tier D</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, background: '#dbeafe', borderRadius: '2px', display: 'inline-block' }} /> Sale Period</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 8, height: 8, background: '#8b5cf6', borderRadius: '50%', display: 'inline-block' }} /> Has Note</span>
        </div>
      </div>

      {/* Attribution annotation panel */}
      {editingWeek && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: '#faf5ff' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#6b21a8', marginBottom: '8px' }}>
            Campaign Attribution — Week of {format(parseISO(editingWeek), 'MMM d, yyyy')}
          </div>

          {/* Existing notes */}
          {(annotations[editingWeek] || []).map(note => (
            <div key={note.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#fff', borderRadius: '4px', marginBottom: '4px', fontSize: '12px', border: '1px solid #e9d5ff' }}>
              <span style={{ color: '#374151' }}>{note.text}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteNote(editingWeek, note.id) }}
                style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
              >
                ×
              </button>
            </div>
          ))}

          {/* Add note */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(editingWeek) }}
              placeholder="e.g., This coverage cluster drove 30% of launch week sales"
              style={{ flex: 1, padding: '6px 10px', fontSize: '12px', border: '1px solid #d8b4fe', borderRadius: '4px', background: '#fff' }}
            />
            <button
              onClick={() => handleAddNote(editingWeek)}
              style={{ padding: '6px 12px', fontSize: '12px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Add Note
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
