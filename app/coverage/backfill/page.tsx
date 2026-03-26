'use client'

import { useState, useCallback } from 'react'
import styles from './page.module.css'

interface StatusData {
  coverage_items: {
    total: number
    missing_outlet: number
    missing_date: number
    missing_territory: number
  }
  outlets: {
    total: number
    missing_muv: number
    missing_tier: number
    missing_country: number
  }
}

interface LogEntry {
  time: string
  message: string
  type: 'info' | 'success' | 'error'
}

export default function BackfillPage() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(false)
  const [runningTask, setRunningTask] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [trafficProgress, setTrafficProgress] = useState<{ done: number; total: number } | null>(null)

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, { time, message, type }])
  }, [])

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'status' })
      })
      const data = await res.json()
      setStatus(data)
      addLog('Status refreshed', 'info')
    } catch (err) {
      addLog(`Status fetch failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [addLog])

  const runTask = useCallback(async (task: string, label: string) => {
    setRunningTask(task)
    addLog(`Starting: ${label}...`, 'info')

    try {
      const res = await fetch('/api/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task })
      })
      const data = await res.json()

      if (data.error) {
        addLog(`${label} failed: ${data.error}`, 'error')
      } else {
        const updated = data.updated ?? data.linked ?? 0
        const total = data.total ?? 0
        addLog(`${label} complete: ${updated}/${total} updated`, 'success')

        if (data.changes && data.changes.length > 0) {
          for (const c of data.changes.slice(0, 10)) {
            addLog(`  ${c.domain}: "${c.old}" → "${c.new}"`, 'info')
          }
          if (data.changes.length > 10) {
            addLog(`  ...and ${data.changes.length - 10} more`, 'info')
          }
        }

        if (data.errors && data.errors.length > 0) {
          for (const e of data.errors) {
            addLog(`  Error: ${e}`, 'error')
          }
        }
      }

      // Refresh status after task
      await fetchStatus()
    } catch (err) {
      addLog(`${label} failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setRunningTask(null)
    }
  }, [addLog, fetchStatus])

  const runTrafficEnrichment = useCallback(async () => {
    setRunningTask('enrich_traffic')
    addLog('Starting HypeStat traffic enrichment (batched)...', 'info')

    // First get the count
    const statusRes = await fetch('/api/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'status' })
    })
    const statusData = await statusRes.json()
    const totalToEnrich = statusData.outlets?.missing_muv || 0

    if (totalToEnrich === 0) {
      addLog('No outlets need traffic enrichment', 'success')
      setRunningTask(null)
      return
    }

    addLog(`Found ${totalToEnrich} outlets needing traffic data`, 'info')
    setTrafficProgress({ done: 0, total: totalToEnrich })

    let offset = 0
    const batchSize = 15
    let totalEnriched = 0
    let totalFailed = 0

    while (true) {
      try {
        const res = await fetch('/api/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'enrich_traffic', batch_size: batchSize, offset: 0 }) // always 0 since enriched ones disappear
        })
        const data = await res.json()

        if (data.processed === 0 || data.result) {
          addLog('No more outlets to process', 'info')
          break
        }

        totalEnriched += data.enriched
        totalFailed += data.failed

        const processed = totalEnriched + totalFailed
        setTrafficProgress({ done: processed, total: totalToEnrich })

        addLog(
          `Batch: ${data.enriched} enriched, ${data.failed} no data (${processed}/${totalToEnrich} total)`,
          data.enriched > 0 ? 'success' : 'info'
        )

        // Log individual results
        for (const r of (data.results || [])) {
          if (r.visitors) {
            addLog(`  ${r.domain}: ${r.visitors.toLocaleString()} visitors (Tier ${r.tier})`, 'success')
          }
        }

        offset += batchSize

        // Safety: stop after processing all
        if (processed >= totalToEnrich) break

        // Small delay between batches to not hammer HypeStat
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (err) {
        addLog(`Batch error: ${err instanceof Error ? err.message : String(err)}`, 'error')
        break
      }
    }

    addLog(`Traffic enrichment complete: ${totalEnriched} enriched, ${totalFailed} no data found`, 'success')
    setTrafficProgress(null)
    setRunningTask(null)
    await fetchStatus()
  }, [addLog, fetchStatus])

  // Load status on first render
  if (!status && !loading) {
    fetchStatus()
  }

  const isRunning = runningTask !== null

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Data Backfill</h1>
        <p className={styles.subtitle}>Fix missing data across coverage items and outlets</p>
      </div>

      {/* Status cards */}
      {status && (
        <div className={styles.statusGrid}>
          <div className={styles.statusCard}>
            <p className={styles.statusValue}>{status.coverage_items.total}</p>
            <p className={styles.statusLabel}>Total Items</p>
          </div>
          <div className={styles.statusCard}>
            <p className={status.coverage_items.missing_outlet === 0 ? styles.statusValueGood : styles.statusValueBad}>
              {status.coverage_items.missing_outlet}
            </p>
            <p className={styles.statusLabel}>Missing Outlet</p>
          </div>
          <div className={styles.statusCard}>
            <p className={status.coverage_items.missing_date === 0 ? styles.statusValueGood : styles.statusValueBad}>
              {status.coverage_items.missing_date}
            </p>
            <p className={styles.statusLabel}>Missing Date</p>
          </div>
          <div className={styles.statusCard}>
            <p className={status.coverage_items.missing_territory === 0 ? styles.statusValueGood : styles.statusValueBad}>
              {status.coverage_items.missing_territory}
            </p>
            <p className={styles.statusLabel}>Missing Territory</p>
          </div>
          <div className={styles.statusCard}>
            <p className={styles.statusValue}>{status.outlets.total}</p>
            <p className={styles.statusLabel}>Total Outlets</p>
          </div>
          <div className={styles.statusCard}>
            <p className={status.outlets.missing_muv === 0 ? styles.statusValueGood : styles.statusValueBad}>
              {status.outlets.missing_muv}
            </p>
            <p className={styles.statusLabel}>Missing Traffic</p>
          </div>
          <div className={styles.statusCard}>
            <p className={status.outlets.missing_tier === 0 ? styles.statusValueGood : styles.statusValueBad}>
              {status.outlets.missing_tier}
            </p>
            <p className={styles.statusLabel}>Missing Tier</p>
          </div>
          <div className={styles.statusCard}>
            <p className={status.outlets.missing_country === 0 ? styles.statusValueGood : styles.statusValueBad}>
              {status.outlets.missing_country}
            </p>
            <p className={styles.statusLabel}>Generic Country</p>
          </div>
        </div>
      )}

      {/* Task buttons */}
      <div className={styles.tasks}>
        <div className={styles.taskCard}>
          <div className={styles.taskInfo}>
            <p className={styles.taskName}>1. Link Orphan Items to Outlets</p>
            <p className={styles.taskDesc}>Match {status?.coverage_items.missing_outlet || '?'} items with no outlet_id to outlets by extracting domain from URL</p>
          </div>
          <button
            className={styles.taskBtn}
            disabled={isRunning}
            onClick={() => runTask('link_outlets', 'Link outlets')}
          >
            {runningTask === 'link_outlets' ? 'Running...' : 'Run'}
          </button>
        </div>

        <div className={styles.taskCard}>
          <div className={styles.taskInfo}>
            <p className={styles.taskName}>2. Backfill Missing Dates</p>
            <p className={styles.taskDesc}>Fill {status?.coverage_items.missing_date || '?'} missing publish_dates from discovered_at/created_at</p>
          </div>
          <button
            className={styles.taskBtn}
            disabled={isRunning}
            onClick={() => runTask('backfill_dates', 'Backfill dates')}
          >
            {runningTask === 'backfill_dates' ? 'Running...' : 'Run'}
          </button>
        </div>

        <div className={styles.taskCard}>
          <div className={styles.taskInfo}>
            <p className={styles.taskName}>3. Backfill Missing Territories</p>
            <p className={styles.taskDesc}>Infer {status?.coverage_items.missing_territory || '?'} missing territories from outlet domain TLDs</p>
          </div>
          <button
            className={styles.taskBtn}
            disabled={isRunning}
            onClick={() => runTask('backfill_territories', 'Backfill territories')}
          >
            {runningTask === 'backfill_territories' ? 'Running...' : 'Run'}
          </button>
        </div>

        <div className={styles.taskCard}>
          <div className={styles.taskInfo}>
            <p className={styles.taskName}>4. Fix Outlet Names</p>
            <p className={styles.taskDesc}>Upgrade auto-generated outlet names using known outlet mappings (e.g. &quot;Gamespot&quot; → &quot;GameSpot&quot;)</p>
          </div>
          <button
            className={styles.taskBtn}
            disabled={isRunning}
            onClick={() => runTask('fix_outlet_names', 'Fix outlet names')}
          >
            {runningTask === 'fix_outlet_names' ? 'Running...' : 'Run'}
          </button>
        </div>

        <div className={styles.taskCard}>
          <div className={styles.taskInfo}>
            <p className={styles.taskName}>5. Enrich Traffic Data (HypeStat)</p>
            <p className={styles.taskDesc}>Look up monthly visitors for {status?.outlets.missing_muv || '?'} outlets via HypeStat (batched, ~1 sec per outlet)</p>
          </div>
          <button
            className={styles.taskBtnAmber}
            disabled={isRunning}
            onClick={runTrafficEnrichment}
          >
            {runningTask === 'enrich_traffic' ? 'Running...' : 'Run'}
          </button>
        </div>

        <div className={styles.taskCard}>
          <div className={styles.taskInfo}>
            <p className={styles.taskName}>6. Auto-assign Tiers</p>
            <p className={styles.taskDesc}>Assign tier (A/B/C/D) to {status?.outlets.missing_tier || '?'} outlets based on their monthly visitor data</p>
          </div>
          <button
            className={styles.taskBtnGreen}
            disabled={isRunning}
            onClick={() => runTask('assign_tiers', 'Assign tiers')}
          >
            {runningTask === 'assign_tiers' ? 'Running...' : 'Run'}
          </button>
        </div>

        <div className={styles.taskCard}>
          <div className={styles.taskInfo}>
            <p className={styles.taskName}>7. Detect Outlet Countries</p>
            <p className={styles.taskDesc}>Auto-detect country for {status?.outlets.missing_country || '?'} outlets tagged as &quot;International&quot; or missing country, using domain TLD and known outlet mappings</p>
          </div>
          <button
            className={styles.taskBtnGreen}
            disabled={isRunning}
            onClick={() => runTask('backfill_countries', 'Detect countries')}
          >
            {runningTask === 'backfill_countries' ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>

      {/* Traffic enrichment progress */}
      {trafficProgress && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round((trafficProgress.done / trafficProgress.total) * 100)}%` }}
            />
          </div>
          <p className={styles.progressLabel}>
            {trafficProgress.done} / {trafficProgress.total} outlets processed ({Math.round((trafficProgress.done / trafficProgress.total) * 100)}%)
          </p>
        </div>
      )}

      {/* Log output */}
      {logs.length > 0 && (
        <div className={styles.log}>
          {logs.map((entry, i) => (
            <p
              key={i}
              className={
                entry.type === 'success' ? styles.logSuccess :
                entry.type === 'error' ? styles.logError :
                styles.logInfo
              }
            >
              [{entry.time}] {entry.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
