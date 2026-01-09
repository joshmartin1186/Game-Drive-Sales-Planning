'use client'

import { useState, useMemo } from 'react'
import { format, startOfQuarter, endOfQuarter, eachQuarterOfInterval, differenceInDays, isWithinInterval, addDays } from 'date-fns'
import { SaleWithDetails, Product, Game, Client, Platform } from '@/lib/types'
import { normalizeToLocalDate } from '@/lib/dateUtils'
import styles from './GapAnalysis.module.css'

interface GapAnalysisProps {
  sales: SaleWithDetails[]
  products: (Product & { game: Game & { client: Client } })[]
  platforms: Platform[]
  timelineStart: Date
  monthCount: number
}

interface GapInfo {
  productId: string
  productName: string
  gameName: string
  platformId: string
  platformName: string
  platformColor: string
  quarter: string
  quarterStart: Date
  quarterEnd: Date
  totalDaysInQuarter: number
  daysWithSale: number
  daysWithoutSale: number
  longestGap: number
  longestGapStart?: Date
  longestGapEnd?: Date
  gapPercentage: number
}

export default function GapAnalysis({ sales, products, platforms, timelineStart, monthCount }: GapAnalysisProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [minGapDays, setMinGapDays] = useState<number>(14)
  const [sortBy, setSortBy] = useState<'gap' | 'percentage' | 'quarter'>('gap')

  const timelineEnd = useMemo(() => {
    const end = new Date(timelineStart)
    end.setMonth(end.getMonth() + monthCount)
    return end
  }, [timelineStart, monthCount])

  const quarters = useMemo(() => {
    return eachQuarterOfInterval({
      start: timelineStart,
      end: timelineEnd
    })
  }, [timelineStart, timelineEnd])

  const gapAnalysis = useMemo(() => {
    const gaps: GapInfo[] = []

    // Get unique product-platform combinations that have sales
    const productPlatformPairs = new Map<string, { product: typeof products[0], platform: Platform }>()
    
    for (const sale of sales) {
      const key = `${sale.product_id}-${sale.platform_id}`
      if (!productPlatformPairs.has(key)) {
        const product = products.find(p => p.id === sale.product_id)
        const platform = platforms.find(p => p.id === sale.platform_id)
        if (product && platform) {
          productPlatformPairs.set(key, { product, platform })
        }
      }
    }

    // Also include products without any sales yet
    for (const product of products) {
      for (const platform of platforms) {
        const key = `${product.id}-${platform.id}`
        if (!productPlatformPairs.has(key)) {
          // Only include if there's at least one sale for this product on ANY platform
          const hasAnySale = sales.some(s => s.product_id === product.id)
          if (hasAnySale) {
            productPlatformPairs.set(key, { product, platform })
          }
        }
      }
    }

    // Analyze each product-platform combination for each quarter
    productPlatformPairs.forEach(({ product, platform }) => {
      const productSales = sales
        .filter(s => s.product_id === product.id && s.platform_id === platform.id)
        .map(s => ({
          start: normalizeToLocalDate(s.start_date),
          end: normalizeToLocalDate(s.end_date)
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime())

      for (const quarterStart of quarters) {
        const quarterEnd = endOfQuarter(quarterStart)
        const quarterLabel = `Q${Math.floor(quarterStart.getMonth() / 3) + 1} ${quarterStart.getFullYear()}`
        
        // Calculate days covered by sales in this quarter
        const daysInQuarter = differenceInDays(quarterEnd, quarterStart) + 1
        const dayCoverage = new Array(daysInQuarter).fill(false)
        
        for (const sale of productSales) {
          // Check if sale overlaps with this quarter
          if (sale.end >= quarterStart && sale.start <= quarterEnd) {
            const overlapStart = sale.start < quarterStart ? quarterStart : sale.start
            const overlapEnd = sale.end > quarterEnd ? quarterEnd : sale.end
            
            const startIdx = differenceInDays(overlapStart, quarterStart)
            const endIdx = differenceInDays(overlapEnd, quarterStart)
            
            for (let i = startIdx; i <= endIdx && i < daysInQuarter; i++) {
              if (i >= 0) dayCoverage[i] = true
            }
          }
        }

        // Count days with and without sales
        const daysWithSale = dayCoverage.filter(Boolean).length
        const daysWithoutSale = daysInQuarter - daysWithSale

        // Find longest gap
        let longestGap = 0
        let currentGap = 0
        let longestGapStartIdx = -1
        let currentGapStartIdx = -1

        for (let i = 0; i < daysInQuarter; i++) {
          if (!dayCoverage[i]) {
            if (currentGap === 0) {
              currentGapStartIdx = i
            }
            currentGap++
          } else {
            if (currentGap > longestGap) {
              longestGap = currentGap
              longestGapStartIdx = currentGapStartIdx
            }
            currentGap = 0
          }
        }
        // Check final gap
        if (currentGap > longestGap) {
          longestGap = currentGap
          longestGapStartIdx = currentGapStartIdx
        }

        const gapPercentage = Math.round((daysWithoutSale / daysInQuarter) * 100)

        gaps.push({
          productId: product.id,
          productName: product.name,
          gameName: product.game?.name || 'Unknown',
          platformId: platform.id,
          platformName: platform.name,
          platformColor: platform.color_hex,
          quarter: quarterLabel,
          quarterStart,
          quarterEnd,
          totalDaysInQuarter: daysInQuarter,
          daysWithSale,
          daysWithoutSale,
          longestGap,
          longestGapStart: longestGapStartIdx >= 0 ? addDays(quarterStart, longestGapStartIdx) : undefined,
          longestGapEnd: longestGapStartIdx >= 0 ? addDays(quarterStart, longestGapStartIdx + longestGap - 1) : undefined,
          gapPercentage
        })
      }
    })

    return gaps
  }, [sales, products, platforms, quarters])

  const filteredGaps = useMemo(() => {
    let filtered = gapAnalysis.filter(g => g.longestGap >= minGapDays)
    
    if (filterPlatform !== 'all') {
      filtered = filtered.filter(g => g.platformId === filterPlatform)
    }

    // Sort
    switch (sortBy) {
      case 'gap':
        filtered.sort((a, b) => b.longestGap - a.longestGap)
        break
      case 'percentage':
        filtered.sort((a, b) => b.gapPercentage - a.gapPercentage)
        break
      case 'quarter':
        filtered.sort((a, b) => a.quarterStart.getTime() - b.quarterStart.getTime())
        break
    }

    return filtered
  }, [gapAnalysis, filterPlatform, minGapDays, sortBy])

  // Summary stats
  const summaryStats = useMemo(() => {
    if (filteredGaps.length === 0) return null

    const totalGaps = filteredGaps.length
    const avgGap = Math.round(filteredGaps.reduce((sum, g) => sum + g.longestGap, 0) / totalGaps)
    const maxGap = Math.max(...filteredGaps.map(g => g.longestGap))
    const criticalGaps = filteredGaps.filter(g => g.longestGap >= 30).length

    return { totalGaps, avgGap, maxGap, criticalGaps }
  }, [filteredGaps])

  // Get unique platforms that have gaps
  const platformsWithGaps = useMemo(() => {
    const ids = new Set(gapAnalysis.map(g => g.platformId))
    return platforms.filter(p => ids.has(p.id))
  }, [gapAnalysis, platforms])

  if (products.length === 0) return null

  return (
    <div className={styles.container}>
      <button 
        className={styles.toggleButton}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={styles.toggleIcon}>{isExpanded ? '▼' : '▶'}</span>
        <span className={styles.toggleTitle}>📊 Sales Gap Analysis</span>
        {summaryStats && !isExpanded && (
          <span className={styles.summaryBadge}>
            {summaryStats.criticalGaps > 0 && (
              <span className={styles.criticalBadge}>{summaryStats.criticalGaps} critical</span>
            )}
            <span>{summaryStats.totalGaps} gaps found</span>
          </span>
        )}
      </button>

      {isExpanded && (
        <div className={styles.content}>
          <div className={styles.filters}>
            <div className={styles.filterGroup}>
              <label>Platform:</label>
              <select 
                value={filterPlatform} 
                onChange={(e) => setFilterPlatform(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="all">All Platforms</option>
                {platformsWithGaps.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label>Min Gap:</label>
              <select 
                value={minGapDays} 
                onChange={(e) => setMinGapDays(Number(e.target.value))}
                className={styles.filterSelect}
              >
                <option value={7}>7+ days</option>
                <option value={14}>14+ days</option>
                <option value={21}>21+ days</option>
                <option value={30}>30+ days</option>
                <option value={45}>45+ days</option>
                <option value={60}>60+ days</option>
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label>Sort by:</label>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as 'gap' | 'percentage' | 'quarter')}
                className={styles.filterSelect}
              >
                <option value="gap">Longest Gap</option>
                <option value="percentage">Gap %</option>
                <option value="quarter">Quarter</option>
              </select>
            </div>
          </div>

          {summaryStats && (
            <div className={styles.summaryStats}>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{summaryStats.totalGaps}</span>
                <span className={styles.statLabel}>Total Gaps</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{summaryStats.avgGap}d</span>
                <span className={styles.statLabel}>Avg Gap</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{summaryStats.maxGap}d</span>
                <span className={styles.statLabel}>Max Gap</span>
              </div>
              <div className={`${styles.statCard} ${summaryStats.criticalGaps > 0 ? styles.criticalStat : ''}`}>
                <span className={styles.statValue}>{summaryStats.criticalGaps}</span>
                <span className={styles.statLabel}>Critical (30d+)</span>
              </div>
            </div>
          )}

          {filteredGaps.length === 0 ? (
            <div className={styles.noGaps}>
              ✅ No significant gaps found with current filters
            </div>
          ) : (
            <div className={styles.gapList}>
              {filteredGaps.map((gap, idx) => (
                <div 
                  key={`${gap.productId}-${gap.platformId}-${gap.quarter}`}
                  className={`${styles.gapItem} ${gap.longestGap >= 30 ? styles.criticalGap : ''}`}
                >
                  <div className={styles.gapHeader}>
                    <div className={styles.gapProduct}>
                      <span className={styles.gameName}>{gap.gameName}</span>
                      <span className={styles.productName}>{gap.productName}</span>
                    </div>
                    <div className={styles.gapPlatform}>
                      <span 
                        className={styles.platformDot}
                        style={{ backgroundColor: gap.platformColor }}
                      />
                      <span>{gap.platformName}</span>
                    </div>
                    <div className={styles.gapQuarter}>
                      {gap.quarter}
                    </div>
                  </div>

                  <div className={styles.gapDetails}>
                    <div className={styles.gapMetric}>
                      <span className={styles.gapValue}>{gap.longestGap}</span>
                      <span className={styles.gapLabel}>days longest gap</span>
                    </div>
                    
                    {gap.longestGapStart && gap.longestGapEnd && (
                      <div className={styles.gapDates}>
                        {format(gap.longestGapStart, 'MMM d')} - {format(gap.longestGapEnd, 'MMM d')}
                      </div>
                    )}

                    <div className={styles.gapBar}>
                      <div 
                        className={styles.gapBarFill}
                        style={{ 
                          width: `${100 - gap.gapPercentage}%`,
                          backgroundColor: gap.platformColor 
                        }}
                      />
                      <span className={styles.gapBarLabel}>
                        {gap.daysWithSale}d covered / {gap.totalDaysInQuarter}d ({100 - gap.gapPercentage}%)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
