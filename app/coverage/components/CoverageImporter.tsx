'use client'

import { useState, useCallback, useRef } from 'react'
import styles from './CoverageImporter.module.css'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CoverageImporterProps {
  isOpen: boolean
  onClose: () => void
  clients: Array<{ id: string; name: string }>
  games: Array<{ id: string; name: string; client_id: string }>
  onImportComplete: () => void
}

interface ParsedRow {
  title: string
  url: string
  publish_date: string
  outlet_name: string
  coverage_type: string
  status: 'new' | 'duplicate' | 'error'
  error?: string
}

// ─── Header detection ───────────────────────────────────────────────────────

const HEADER_MAP: Record<string, keyof ParsedRow> = {
  title: 'title',
  headline: 'title',
  article: 'title',
  name: 'title',
  url: 'url',
  link: 'url',
  publish_date: 'publish_date',
  date: 'publish_date',
  published: 'publish_date',
  published_date: 'publish_date',
  pub_date: 'publish_date',
  outlet: 'outlet_name',
  outlet_name: 'outlet_name',
  source: 'outlet_name',
  publisher: 'outlet_name',
  publication: 'outlet_name',
  type: 'coverage_type',
  coverage_type: 'coverage_type',
  category: 'coverage_type',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] || ''
  const tabs = (firstLine.match(/\t/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length
  return tabs >= commas ? '\t' : ','
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function detectHeaders(fields: string[]): Record<number, keyof ParsedRow> | null {
  const mapping: Record<number, keyof ParsedRow> = {}
  let matchCount = 0

  for (let i = 0; i < fields.length; i++) {
    const normalized = fields[i].toLowerCase().replace(/[^a-z_]/g, '')
    if (HEADER_MAP[normalized]) {
      mapping[i] = HEADER_MAP[normalized]
      matchCount++
    }
  }

  // Consider it a header row if at least 2 columns matched known names
  return matchCount >= 2 ? mapping : null
}

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    // Turn domain into readable name: "pcgamer.com" -> "PC Gamer"
    const name = hostname
      .replace(/\.(com|net|org|co\.uk|io|gg|tv|info|me|cc|dev|app|news|games)$/i, '')
      .replace(/\./g, ' ')
      .split(/[\s\-_]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    return name || hostname
  } catch {
    return ''
  }
}

function normalizeDate(input: string): string {
  if (!input) return ''
  // Try ISO format first
  const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`

  // Try US format: MM/DD/YYYY or M/D/YYYY
  const usMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`

  // Try EU format: DD-MM-YYYY or DD.MM.YYYY
  const euMatch = input.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})/)
  if (euMatch) return `${euMatch[3]}-${euMatch[2].padStart(2, '0')}-${euMatch[1].padStart(2, '0')}`

  // Try Date constructor as fallback
  const d = new Date(input)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }

  return ''
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CoverageImporter({ isOpen, onClose, clients, games, onImportComplete }: CoverageImporterProps) {
  const [rawText, setRawText] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [clientId, setClientId] = useState('')
  const [gameId, setGameId] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredGames = clientId ? games.filter(g => g.client_id === clientId) : games

  // Parse CSV text into rows
  const parseText = useCallback(async (text: string) => {
    setError(null)
    setSuccessMsg(null)

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      setParsedRows([])
      return
    }

    const delimiter = detectDelimiter(text)
    const firstFields = parseCSVLine(lines[0], delimiter)
    const headerMapping = detectHeaders(firstFields)

    let dataStartIndex = 0
    let colMapping: Record<number, keyof ParsedRow>

    if (headerMapping) {
      colMapping = headerMapping
      dataStartIndex = 1
    } else {
      // Assume default order: title, url, date, outlet
      colMapping = { 0: 'title', 1: 'url', 2: 'publish_date', 3: 'outlet_name' }
    }

    const rows: ParsedRow[] = []
    for (let i = dataStartIndex; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i], delimiter)
      const row: ParsedRow = {
        title: '',
        url: '',
        publish_date: '',
        outlet_name: '',
        coverage_type: 'news',
        status: 'new',
      }

      for (const [idxStr, key] of Object.entries(colMapping)) {
        const idx = parseInt(idxStr)
        const val = fields[idx] || ''
        if (key === 'publish_date') {
          row.publish_date = normalizeDate(val)
        } else {
          (row as unknown as Record<string, string>)[key] = val
        }
      }

      // Validate
      if (!row.url || !isValidUrl(row.url)) {
        if (row.url) {
          // Try prefixing https://
          const prefixed = 'https://' + row.url
          if (isValidUrl(prefixed)) {
            row.url = prefixed
          } else {
            row.status = 'error'
            row.error = 'Invalid URL'
          }
        } else {
          row.status = 'error'
          row.error = 'Missing URL'
        }
      }

      if (!row.title) {
        row.status = 'error'
        row.error = 'Missing title'
      }

      // Auto-detect outlet from domain if not provided
      if (!row.outlet_name && row.url && row.status !== 'error') {
        row.outlet_name = extractDomain(row.url)
      }

      rows.push(row)
    }

    // Check for duplicates against the database
    const validUrls = rows.filter(r => r.status === 'new').map(r => r.url)
    if (validUrls.length > 0) {
      setIsChecking(true)
      try {
        // Check each URL against existing items (batch by searching)
        const existingUrls = new Set<string>()
        // Check in batches of 10 to avoid overly long URLs
        for (let i = 0; i < validUrls.length; i += 10) {
          const batch = validUrls.slice(i, i + 10)
          const checks = batch.map(url =>
            fetch(`/api/coverage-items?search=${encodeURIComponent(url)}&limit=1`)
              .then(r => r.ok ? r.json() : { data: [] })
              .then(json => {
                const items = json.data || []
                // Check if any returned item has a matching URL
                for (const item of items) {
                  if (item.url === url) {
                    existingUrls.add(url)
                  }
                }
              })
              .catch(() => {/* ignore */})
          )
          await Promise.all(checks)
        }

        for (const row of rows) {
          if (row.status === 'new' && existingUrls.has(row.url)) {
            row.status = 'duplicate'
          }
        }
      } catch {
        // If duplicate check fails, proceed anyway — items will just be inserted
      }
      setIsChecking(false)
    }

    setParsedRows(rows)
  }, [])

  // Handle paste into textarea
  const handleTextChange = (text: string) => {
    setRawText(text)
    // Debounce: only parse when text seems complete (has newlines = multiple rows)
    if (text.includes('\n') && text.trim().split('\n').length >= 2) {
      parseText(text)
    } else {
      setParsedRows([])
    }
  }

  // Handle "Parse" button click for single-line or small paste
  const handleParseClick = () => {
    if (rawText.trim()) {
      parseText(rawText)
    }
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (text) {
        setRawText(text)
        parseText(text)
      }
    }
    reader.readAsText(file)
  }

  // Import valid rows
  const handleImport = async () => {
    const importable = parsedRows.filter(r => r.status === 'new')
    if (importable.length === 0) {
      setError('No valid items to import. All rows are duplicates or have errors.')
      return
    }

    if (!clientId) {
      setError('Please select a client before importing.')
      return
    }

    setIsImporting(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const items = importable.map(row => ({
        title: row.title,
        url: row.url,
        publish_date: row.publish_date || null,
        outlet_name: row.outlet_name || null,
        coverage_type: row.coverage_type || 'news',
        client_id: clientId,
        game_id: gameId || null,
        source_type: 'manual',
        approval_status: 'manually_approved',
      }))

      const res = await fetch('/api/coverage-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to import items')
      }

      const result = await res.json()
      const count = result.imported || result.data?.length || importable.length
      setSuccessMsg(`Successfully imported ${count} coverage item${count !== 1 ? 's' : ''}.`)
      setParsedRows([])
      setRawText('')
      onImportComplete()

      // Auto-close after brief delay
      setTimeout(() => {
        onClose()
        setSuccessMsg(null)
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    }

    setIsImporting(false)
  }

  // Reset on close
  const handleClose = () => {
    setParsedRows([])
    setRawText('')
    setError(null)
    setSuccessMsg(null)
    setClientId('')
    setGameId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  if (!isOpen) return null

  const newCount = parsedRows.filter(r => r.status === 'new').length
  const dupCount = parsedRows.filter(r => r.status === 'duplicate').length
  const errCount = parsedRows.filter(r => r.status === 'error').length

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Import Coverage Items</h2>
          <button className={styles.closeBtn} onClick={handleClose}>&times;</button>
        </div>

        {/* Error / Success */}
        {error && <div className={styles.errorMsg}>{error}</div>}
        {successMsg && <div className={styles.successMsg}>{successMsg}</div>}

        {/* Client / Game selectors */}
        <div className={styles.selectorsRow}>
          <select
            className={styles.select}
            value={clientId}
            onChange={e => { setClientId(e.target.value); setGameId('') }}
          >
            <option value="">Select Client *</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className={styles.select}
            value={gameId}
            onChange={e => setGameId(e.target.value)}
          >
            <option value="">Select Game (optional)</option>
            {filteredGames.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        {/* Input area */}
        <div className={styles.inputSection}>
          <label className={styles.inputLabel}>Paste CSV/TSV data</label>
          <textarea
            className={styles.textarea}
            value={rawText}
            onChange={e => handleTextChange(e.target.value)}
            placeholder={`title,url,date,outlet\n"Shapez 2 Review - A Masterclass",https://pcgamer.com/shapez-2-review,2026-01-15,PC Gamer\n"Shapez 2 Preview",https://eurogamer.net/shapez-2,2026-01-10,Eurogamer`}
          />
          <p className={styles.hint}>
            Columns: title, url, date, outlet, type (coverage_type). Comma or tab delimited. Headers are auto-detected.
          </p>
          {rawText.trim() && parsedRows.length === 0 && (
            <button
              onClick={handleParseClick}
              style={{ marginTop: '8px', padding: '6px 16px', backgroundColor: '#22223a', color: '#e0e0e8', border: '1px solid #2a2a3e', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
            >
              Parse Data
            </button>
          )}

          <div className={styles.divider}>or</div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className={styles.fileInput}
            onChange={handleFileUpload}
          />
        </div>

        {/* Checking indicator */}
        {isChecking && (
          <div style={{ textAlign: 'center', padding: '16px', color: '#a0a0b8', fontSize: '13px' }}>
            <span className={styles.spinner} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Checking for duplicates...
          </div>
        )}

        {/* Preview table */}
        {parsedRows.length > 0 && !isChecking && (
          <div className={styles.previewSection}>
            <div className={styles.previewHeader}>
              <h3 className={styles.previewTitle}>Preview ({parsedRows.length} rows)</h3>
              <div className={styles.previewStats}>
                {newCount > 0 && <span style={{ color: '#10b981', marginRight: '12px' }}>{newCount} new</span>}
                {dupCount > 0 && <span style={{ color: '#f59e0b', marginRight: '12px' }}>{dupCount} duplicate</span>}
                {errCount > 0 && <span style={{ color: '#d22939' }}>{errCount} error</span>}
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Title</th>
                    <th>URL</th>
                    <th>Date</th>
                    <th>Outlet</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, idx) => (
                    <tr key={idx} className={row.status === 'duplicate' ? styles.rowDuplicate : undefined}>
                      <td>
                        {row.status === 'new' && <span className={`${styles.badge} ${styles.badgeNew}`}>New</span>}
                        {row.status === 'duplicate' && <span className={`${styles.badge} ${styles.badgeDuplicate}`}>Exists</span>}
                        {row.status === 'error' && (
                          <span className={`${styles.badge} ${styles.badgeError}`} title={row.error}>{row.error || 'Error'}</span>
                        )}
                      </td>
                      <td className={styles.cellTitle}>{row.title || '—'}</td>
                      <td className={styles.cellUrl} title={row.url}>{row.url || '—'}</td>
                      <td>{row.publish_date || '—'}</td>
                      <td>{row.outlet_name || '—'}</td>
                      <td>{row.coverage_type || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
          <button
            className={styles.importBtn}
            onClick={handleImport}
            disabled={isImporting || newCount === 0 || !clientId}
          >
            {isImporting && <span className={styles.spinner} />}
            {isImporting ? 'Importing...' : `Import ${newCount} Item${newCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
