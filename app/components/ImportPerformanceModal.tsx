'use client'

import { useState, useCallback, useMemo } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { format, parse, isValid } from 'date-fns'
import styles from './ImportPerformanceModal.module.css'

interface Client {
  id: string
  name: string
}

interface ImportPerformanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  clients: Client[]
}

interface ColumnMapping {
  date: string
  gross_units_sold: string[]  // Multiple columns can be summed
  net_units_sold: string
  gross_revenue_usd: string
  net_revenue_usd: string
  country_code: string
  base_price: string
  sale_price: string
}

const DEFAULT_MAPPING: ColumnMapping = {
  date: '',
  gross_units_sold: [],
  net_units_sold: '',
  gross_revenue_usd: '',
  net_revenue_usd: '',
  country_code: '',
  base_price: '',
  sale_price: ''
}

interface ParsedRow {
  rowIndex: number
  raw: Record<string, string>
  date?: string
  gross_units_sold?: number
  net_units_sold?: number
  gross_revenue_usd?: number
  net_revenue_usd?: number
  country_code?: string
  base_price?: number
  sale_price?: number
  errors: string[]
  warnings: string[]
  isValid: boolean
}

type ImportPreset = 'auto' | 'microsoft' | 'steam' | 'playstation' | 'generic'

interface FormatPreset {
  name: string
  description: string
  columnPatterns: {
    date: string[]
    gross_units_sold: string[]
    net_units_sold: string[]
    gross_revenue_usd: string[]
    net_revenue_usd: string[]
    country_code: string[]
    base_price: string[]
    sale_price: string[]
  }
  // For Microsoft: columns that should be auto-summed into gross_units_sold
  sumColumns?: string[]
}

const PLATFORM_SUGGESTIONS = [
  'Steam', 'PlayStation', 'Microsoft', 'Nintendo', 'Epic', 'GOG', 'Humble', 'Itch.io'
]

const FORMAT_PRESETS: Record<Exclude<ImportPreset, 'auto'>, FormatPreset> = {
  microsoft: {
    name: 'Microsoft Store',
    description: 'Xbox / Windows Store Partner Center exports',
    columnPatterns: {
      date: ['date', 'datum', 'sale date', 'report date'],
      gross_units_sold: ['betaald', 'prepaidcode', 'paid', 'prepaid', 'units', 'quantity', 'total units'],
      net_units_sold: ['net units', 'net_units'],
      gross_revenue_usd: ['revenue', 'gross revenue', 'sales', 'gross sales', 'amount'],
      net_revenue_usd: ['net revenue', 'net sales', 'net amount'],
      country_code: ['country', 'country code', 'market', 'region'],
      base_price: ['price', 'base price', 'list price'],
      sale_price: ['sale price', 'discount price', 'actual price']
    },
    sumColumns: ['betaald', 'prepaidcode']
  },
  steam: {
    name: 'Steam',
    description: 'Steam partner exports',
    columnPatterns: {
      date: ['date', 'sale date'],
      gross_units_sold: ['gross units sold', 'units sold', 'units', 'quantity'],
      net_units_sold: ['net units sold', 'net units'],
      gross_revenue_usd: ['gross steam sales (usd)', 'gross revenue', 'gross sales'],
      net_revenue_usd: ['net steam sales (usd)', 'net revenue', 'net sales'],
      country_code: ['country code', 'country'],
      base_price: ['base price (usd)', 'base price'],
      sale_price: ['sale price (usd)', 'sale price']
    }
  },
  playstation: {
    name: 'PlayStation',
    description: 'PlayStation Partner exports',
    columnPatterns: {
      date: ['date', 'transaction date', 'report date'],
      gross_units_sold: ['units', 'quantity', 'units sold'],
      net_units_sold: ['net units'],
      gross_revenue_usd: ['revenue', 'gross revenue', 'amount'],
      net_revenue_usd: ['net revenue', 'publisher share'],
      country_code: ['country', 'territory', 'region'],
      base_price: ['price', 'retail price'],
      sale_price: ['sale price', 'actual price']
    }
  },
  generic: {
    name: 'Generic CSV',
    description: 'Standard format with flexible column names',
    columnPatterns: {
      date: ['date', 'day', 'period', 'report date'],
      gross_units_sold: ['units', 'quantity', 'sold', 'gross units', 'total units'],
      net_units_sold: ['net units', 'net quantity'],
      gross_revenue_usd: ['revenue', 'sales', 'gross revenue', 'amount', 'total'],
      net_revenue_usd: ['net revenue', 'net sales', 'net amount'],
      country_code: ['country', 'country code', 'region', 'market'],
      base_price: ['price', 'base price', 'list price'],
      sale_price: ['sale price', 'discount price']
    }
  }
}

// Date formats to try - EU first since Game Drive clients are European
const DATE_FORMATS = [
  'yyyy-MM-dd',
  'yyyy/MM/dd',
  'yyyy.MM.dd',
  'dd/MM/yyyy',
  'd/M/yyyy',
  'dd-MM-yyyy',
  'dd.MM.yyyy',
  'MM/dd/yyyy',
  'M/d/yyyy',
  'MM-dd-yyyy',
]

function parseDate(value: string): Date | null {
  if (!value) return null
  const trimmed = value.trim()

  // ISO format first (unambiguous)
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    if (isValid(date)) return date
  }

  // For dd/MM/yyyy or MM/dd/yyyy formats, use heuristics
  const slashMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (slashMatch) {
    const [, first, second, year] = slashMatch
    const firstNum = parseInt(first)
    const secondNum = parseInt(second)
    const yearNum = parseInt(year)

    if (firstNum > 12) {
      const date = new Date(yearNum, secondNum - 1, firstNum)
      if (isValid(date)) return date
    }
    if (secondNum > 12) {
      const date = new Date(yearNum, firstNum - 1, secondNum)
      if (isValid(date)) return date
    }
    // Ambiguous: default to EU format
    const euDate = new Date(yearNum, secondNum - 1, firstNum)
    if (isValid(euDate)) return euDate
  }

  // Fallback: try all formats
  for (const fmt of DATE_FORMATS) {
    try {
      const parsed = parse(trimmed, fmt, new Date())
      if (isValid(parsed)) return parsed
    } catch {
      continue
    }
  }

  return null
}

function parseCSV(text: string): { headers: string[], rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if ((char === ',' || char === '\t' || char === ';') && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0])
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((header, idx) => {
      row[header] = values[idx] || ''
    })
    rows.push(row)
  }

  return { headers, rows }
}

function parseNumber(value: string): number | null {
  if (!value || value.trim() === '') return null
  // Remove currency symbols, commas, spaces
  const cleaned = value.replace(/[$€£¥,\s]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

export default function ImportPerformanceModal({
  isOpen,
  onClose,
  onSuccess,
  clients
}: ImportPerformanceModalProps) {
  const supabase = createClientComponentClient()

  // Step state
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload')

  // Step 1: Upload & Metadata
  const [file, setFile] = useState<File | null>(null)
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [platform, setPlatform] = useState<string>('')
  const [platformInput, setPlatformInput] = useState<string>('')
  const [showPlatformSuggestions, setShowPlatformSuggestions] = useState(false)
  const [productName, setProductName] = useState<string>('')
  const [importPreset, setImportPreset] = useState<ImportPreset>('auto')

  // Step 2: Column Mapping
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_MAPPING)
  const [detectedPreset, setDetectedPreset] = useState<ImportPreset | null>(null)

  // Step 3: Preview & Import
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [isDragActive, setIsDragActive] = useState(false)

  // Platform suggestions filtered by input
  const filteredPlatformSuggestions = useMemo(() => {
    if (!platformInput) return PLATFORM_SUGGESTIONS
    const lower = platformInput.toLowerCase()
    return PLATFORM_SUGGESTIONS.filter(p => p.toLowerCase().includes(lower))
  }, [platformInput])

  // Auto-detect format preset based on CSV headers
  const detectPreset = useCallback((csvHeaders: string[]): ImportPreset => {
    const lowerHeaders = csvHeaders.map(h => h.toLowerCase().trim())

    // Microsoft: look for Dutch column names or Microsoft-specific headers
    const microsoftIndicators = ['betaald', 'prepaidcode', 'big id', 'market', 'xbox', 'ms store']
    if (microsoftIndicators.some(ind => lowerHeaders.some(h => h.includes(ind)))) return 'microsoft'

    // Steam-specific
    const steamIndicators = ['app name', 'appname', 'appid', 'steam', 'gross steam sales']
    if (steamIndicators.some(ind => lowerHeaders.some(h => h.includes(ind)))) return 'steam'

    // PlayStation
    const psIndicators = ['territory', 'publisher share', 'playstation']
    if (psIndicators.some(ind => lowerHeaders.some(h => h.includes(ind)))) return 'playstation'

    return 'generic'
  }, [])

  // Apply preset column mapping
  const applyPresetMapping = useCallback((preset: ImportPreset, csvHeaders: string[]): ColumnMapping => {
    const presetConfig = preset === 'auto' ? FORMAT_PRESETS.generic : FORMAT_PRESETS[preset]
    const lowerHeaders = csvHeaders.map(h => h.toLowerCase().trim())
    const newMapping: ColumnMapping = { ...DEFAULT_MAPPING, gross_units_sold: [] }

    const findColumn = (patterns: string[]): string => {
      for (const pattern of patterns) {
        const idx = lowerHeaders.findIndex(h => h.includes(pattern) || h === pattern)
        if (idx >= 0) return csvHeaders[idx]
      }
      return ''
    }

    const findAllColumns = (patterns: string[]): string[] => {
      const found: string[] = []
      for (const pattern of patterns) {
        const idx = lowerHeaders.findIndex(h => h === pattern || h.includes(pattern))
        if (idx >= 0 && !found.includes(csvHeaders[idx])) {
          found.push(csvHeaders[idx])
        }
      }
      return found
    }

    newMapping.date = findColumn(presetConfig.columnPatterns.date)

    // For Microsoft preset, auto-detect summed columns (Betaald + Prepaidcode)
    if (preset === 'microsoft' && presetConfig.sumColumns) {
      const sumCols = findAllColumns(presetConfig.sumColumns)
      if (sumCols.length > 0) {
        newMapping.gross_units_sold = sumCols
      } else {
        const found = findColumn(presetConfig.columnPatterns.gross_units_sold)
        newMapping.gross_units_sold = found ? [found] : []
      }
    } else {
      const found = findColumn(presetConfig.columnPatterns.gross_units_sold)
      newMapping.gross_units_sold = found ? [found] : []
    }

    newMapping.net_units_sold = findColumn(presetConfig.columnPatterns.net_units_sold)
    newMapping.gross_revenue_usd = findColumn(presetConfig.columnPatterns.gross_revenue_usd)
    newMapping.net_revenue_usd = findColumn(presetConfig.columnPatterns.net_revenue_usd)
    newMapping.country_code = findColumn(presetConfig.columnPatterns.country_code)
    newMapping.base_price = findColumn(presetConfig.columnPatterns.base_price)
    newMapping.sale_price = findColumn(presetConfig.columnPatterns.sale_price)

    return newMapping
  }, [])

  // Process file
  const processFile = useCallback(async (selectedFile: File) => {
    setFile(selectedFile)
    setImportError(null)

    try {
      const text = await selectedFile.text()
      const { headers: parsedHeaders, rows } = parseCSV(text)

      if (parsedHeaders.length === 0) {
        setImportError('Could not parse file. Please ensure it is a valid CSV.')
        return
      }

      setHeaders(parsedHeaders)
      setRawRows(rows)

      const detected = detectPreset(parsedHeaders)
      setDetectedPreset(detected)

      const presetToUse = importPreset === 'auto' ? detected : importPreset
      const autoMapping = applyPresetMapping(presetToUse, parsedHeaders)
      setMapping(autoMapping)
      setStep('mapping')
    } catch (err) {
      console.error('Error parsing file:', err)
      setImportError('Failed to read file. Please ensure it is a valid CSV file.')
    }
  }, [detectPreset, applyPresetMapping, importPreset])

  // File handlers
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) processFile(selectedFile)
  }, [processFile])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragActive(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      const validTypes = ['.csv', '.tsv', '.txt']
      const fileName = droppedFile.name.toLowerCase()
      if (!validTypes.some(ext => fileName.endsWith(ext))) {
        setImportError('Please drop a CSV, TSV, or TXT file.')
        return
      }
      processFile(droppedFile)
    }
  }, [processFile])

  // Toggle a column in the gross_units_sold multi-select
  const toggleUnitColumn = useCallback((header: string) => {
    setMapping(prev => {
      const current = prev.gross_units_sold
      if (current.includes(header)) {
        return { ...prev, gross_units_sold: current.filter(h => h !== header) }
      } else {
        return { ...prev, gross_units_sold: [...current, header] }
      }
    })
  }, [])

  // Process rows for preview
  const processRows = useCallback(() => {
    const processed: ParsedRow[] = rawRows.map((row, idx) => {
      const errors: string[] = []
      const warnings: string[] = []

      // Parse date
      let dateStr: string | undefined
      const dateValue = mapping.date ? row[mapping.date] : ''
      if (dateValue) {
        const parsed = parseDate(dateValue)
        if (parsed) {
          dateStr = format(parsed, 'yyyy-MM-dd')
        } else {
          errors.push(`Could not parse date: "${dateValue}"`)
        }
      } else {
        errors.push('Date is required')
      }

      // Parse gross_units_sold (sum of mapped columns)
      let grossUnits: number | undefined
      if (mapping.gross_units_sold.length > 0) {
        let sum = 0
        for (const col of mapping.gross_units_sold) {
          const val = parseNumber(row[col] || '0')
          sum += val || 0
        }
        grossUnits = sum
      } else {
        errors.push('Units sold is required')
      }

      // Parse optional fields
      const netUnits = mapping.net_units_sold ? parseNumber(row[mapping.net_units_sold]) : null
      const grossRevenue = mapping.gross_revenue_usd ? parseNumber(row[mapping.gross_revenue_usd]) : null
      const netRevenue = mapping.net_revenue_usd ? parseNumber(row[mapping.net_revenue_usd]) : null
      const countryCode = mapping.country_code ? row[mapping.country_code]?.trim() : undefined
      const basePrice = mapping.base_price ? parseNumber(row[mapping.base_price]) : null
      const salePrice = mapping.sale_price ? parseNumber(row[mapping.sale_price]) : null

      // Validate: if no units and no revenue, row is probably empty
      if (grossUnits === 0 && !grossRevenue && !netRevenue) {
        warnings.push('Zero units and no revenue data')
      }

      return {
        rowIndex: idx + 2, // 1-indexed + header row
        raw: row,
        date: dateStr,
        gross_units_sold: grossUnits,
        net_units_sold: netUnits ?? undefined,
        gross_revenue_usd: grossRevenue ?? undefined,
        net_revenue_usd: netRevenue ?? undefined,
        country_code: countryCode,
        base_price: basePrice ?? undefined,
        sale_price: salePrice ?? undefined,
        errors,
        warnings,
        isValid: errors.length === 0
      }
    })

    setParsedRows(processed)
    setStep('preview')
  }, [rawRows, mapping])

  const validRows = useMemo(() => parsedRows.filter(r => r.isValid), [parsedRows])
  const invalidRows = useMemo(() => parsedRows.filter(r => !r.isValid), [parsedRows])

  // Import to database
  const handleImport = useCallback(async () => {
    if (validRows.length === 0 || !selectedClientId || !platform || !productName) return

    setIsImporting(true)
    setImportError(null)
    setImportProgress({ current: 0, total: validRows.length })

    try {
      const batchSize = 500
      let imported = 0
      let skipped = 0

      for (let i = 0; i < validRows.length; i += batchSize) {
        const batch = validRows.slice(i, i + batchSize)
        const records = batch.map(row => ({
          client_id: selectedClientId,
          date: row.date!,
          product_name: productName,
          platform: platform,
          country_code: row.country_code || 'WW',
          region: null, // Let the view compute this via get_region_from_country_code
          gross_units_sold: row.gross_units_sold || 0,
          net_units_sold: row.net_units_sold ?? row.gross_units_sold ?? 0,
          gross_revenue_usd: row.gross_revenue_usd || null,
          net_revenue_usd: row.net_revenue_usd || row.gross_revenue_usd || null,
          base_price: row.base_price || null,
          sale_price: row.sale_price || null,
          updated_at: new Date().toISOString()
        }))

        const { error: insertError } = await supabase
          .from('performance_metrics')
          .upsert(records, {
            onConflict: 'client_id,date,product_name,platform,country_code'
          })

        if (insertError) {
          console.error('Insert error:', insertError)
          skipped += batch.length
        } else {
          imported += records.length
        }

        setImportProgress({ current: Math.min(i + batchSize, validRows.length), total: validRows.length })
      }

      // Log to import history
      await supabase.from('performance_import_history').insert({
        client_id: selectedClientId,
        import_type: 'csv',
        filename: file?.name || 'unknown',
        rows_imported: imported,
        rows_skipped: skipped,
        status: 'completed'
      })

      onSuccess()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Import failed'
      setImportError(errorMessage)
    } finally {
      setIsImporting(false)
    }
  }, [validRows, selectedClientId, platform, productName, supabase, file, onSuccess])

  const handleBack = useCallback(() => {
    if (step === 'preview') setStep('mapping')
    else if (step === 'mapping') {
      setStep('upload')
      setFile(null)
      setHeaders([])
      setRawRows([])
      setMapping(DEFAULT_MAPPING)
      setParsedRows([])
    }
  }, [step])

  // Can proceed from upload step?
  const canProceedToFile = selectedClientId && platform && productName

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Import Sales Data</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Progress indicator */}
        <div className={styles.progress}>
          <div className={`${styles.progressStep} ${step === 'upload' ? styles.active : ''} ${step !== 'upload' ? styles.completed : ''}`}>
            <span className={styles.stepNumber}>1</span>
            <span className={styles.stepLabel}>Upload & Setup</span>
          </div>
          <div className={styles.progressLine} />
          <div className={`${styles.progressStep} ${step === 'mapping' ? styles.active : ''} ${step === 'preview' ? styles.completed : ''}`}>
            <span className={styles.stepNumber}>2</span>
            <span className={styles.stepLabel}>Map Columns</span>
          </div>
          <div className={styles.progressLine} />
          <div className={`${styles.progressStep} ${step === 'preview' ? styles.active : ''}`}>
            <span className={styles.stepNumber}>3</span>
            <span className={styles.stepLabel}>Preview & Import</span>
          </div>
        </div>

        <div className={styles.content}>
          {importError && (
            <div className={styles.error}>{importError}</div>
          )}

          {/* Step 1: Upload & Metadata */}
          {step === 'upload' && (
            <div className={styles.uploadStep}>
              <div className={styles.metadataGrid}>
                {/* Client */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Client <span className={styles.required}>*</span></label>
                  <select
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="">-- Select client --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Platform */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Platform <span className={styles.required}>*</span></label>
                  <div className={styles.comboboxWrapper}>
                    <input
                      type="text"
                      value={platformInput || platform}
                      onChange={e => {
                        setPlatformInput(e.target.value)
                        setPlatform(e.target.value)
                        setShowPlatformSuggestions(true)
                      }}
                      onFocus={() => setShowPlatformSuggestions(true)}
                      onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => setShowPlatformSuggestions(false), 200)
                      }}
                      placeholder="e.g. Microsoft, PlayStation, Nintendo..."
                      className={styles.fieldInput}
                    />
                    {showPlatformSuggestions && filteredPlatformSuggestions.length > 0 && (
                      <div className={styles.suggestions}>
                        {filteredPlatformSuggestions.map(p => (
                          <button
                            key={p}
                            className={styles.suggestion}
                            onMouseDown={e => {
                              e.preventDefault()
                              setPlatform(p)
                              setPlatformInput(p)
                              setShowPlatformSuggestions(false)
                            }}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Product */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Product Name <span className={styles.required}>*</span></label>
                  <input
                    type="text"
                    value={productName}
                    onChange={e => setProductName(e.target.value)}
                    placeholder="e.g. shapez 2"
                    className={styles.fieldInput}
                  />
                  <p className={styles.fieldHint}>One product per import. All rows will be assigned to this product.</p>
                </div>

                {/* Format preset */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Import Format</label>
                  <select
                    value={importPreset}
                    onChange={e => setImportPreset(e.target.value as ImportPreset)}
                    className={styles.fieldSelect}
                  >
                    <option value="auto">Auto-Detect</option>
                    <option value="microsoft">Microsoft Store</option>
                    <option value="steam">Steam</option>
                    <option value="playstation">PlayStation</option>
                    <option value="generic">Generic CSV</option>
                  </select>
                </div>
              </div>

              {/* Drop zone */}
              <div
                className={`${styles.dropzone} ${isDragActive ? styles.dropzoneActive : ''} ${!canProceedToFile ? styles.dropzoneDisabled : ''}`}
                onDragEnter={canProceedToFile ? handleDragEnter : undefined}
                onDragLeave={canProceedToFile ? handleDragLeave : undefined}
                onDragOver={canProceedToFile ? handleDragOver : undefined}
                onDrop={canProceedToFile ? handleDrop : undefined}
              >
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileSelect}
                  className={styles.fileInput}
                  id="perf-file-upload"
                  disabled={!canProceedToFile}
                />
                <label htmlFor="perf-file-upload" className={styles.dropzoneLabel}>
                  <div className={styles.uploadIcon}>{isDragActive ? '📥' : '📁'}</div>
                  {!canProceedToFile ? (
                    <p className={styles.uploadText}>Fill in Client, Platform, and Product above first</p>
                  ) : (
                    <>
                      <p className={styles.uploadText}>
                        {isDragActive ? 'Drop your file here!' : 'Click to select a CSV file or drag and drop'}
                      </p>
                      <p className={styles.uploadHint}>Supported formats: .csv, .tsv</p>
                    </>
                  )}
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <div className={styles.mappingStep}>
              {detectedPreset && (
                <div className={styles.detectedFormat}>
                  <span className={styles.detectedLabel}>Detected Format:</span>
                  <span className={styles.detectedValue}>
                    {detectedPreset === 'microsoft' && 'Microsoft Store'}
                    {detectedPreset === 'steam' && 'Steam'}
                    {detectedPreset === 'playstation' && 'PlayStation'}
                    {detectedPreset === 'generic' && 'Generic CSV'}
                  </span>
                  <span className={styles.metadataBadge}>{platform} — {productName}</span>
                </div>
              )}

              <p className={styles.mappingHint}>
                Map your CSV columns to the target fields. We&apos;ve auto-detected what we could.
              </p>

              <div className={styles.mappingGrid}>
                {/* Date - required */}
                <div className={styles.mappingRow}>
                  <label>Date <span className={styles.required}>*</span></label>
                  <select
                    value={mapping.date}
                    onChange={e => setMapping(prev => ({ ...prev, date: e.target.value }))}
                  >
                    <option value="">-- Select column --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Units Sold - required, multi-select */}
                <div className={`${styles.mappingRow} ${styles.mappingRowFull}`}>
                  <label>Units Sold <span className={styles.required}>*</span></label>
                  <div className={styles.multiSelect}>
                    <p className={styles.multiSelectHint}>
                      Select one or more columns. Multiple columns will be summed per row.
                    </p>
                    <div className={styles.multiSelectOptions}>
                      {headers.map(h => (
                        <label key={h} className={styles.multiSelectOption}>
                          <input
                            type="checkbox"
                            checked={mapping.gross_units_sold.includes(h)}
                            onChange={() => toggleUnitColumn(h)}
                          />
                          <span>{h}</span>
                        </label>
                      ))}
                    </div>
                    {mapping.gross_units_sold.length > 1 && (
                      <p className={styles.sumNotice}>
                        Will sum: {mapping.gross_units_sold.join(' + ')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Net Units - optional */}
                <div className={styles.mappingRow}>
                  <label>Net Units Sold</label>
                  <select
                    value={mapping.net_units_sold}
                    onChange={e => setMapping(prev => ({ ...prev, net_units_sold: e.target.value }))}
                  >
                    <option value="">-- Not mapped (defaults to gross) --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Gross Revenue */}
                <div className={styles.mappingRow}>
                  <label>Gross Revenue (USD)</label>
                  <select
                    value={mapping.gross_revenue_usd}
                    onChange={e => setMapping(prev => ({ ...prev, gross_revenue_usd: e.target.value }))}
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Net Revenue */}
                <div className={styles.mappingRow}>
                  <label>Net Revenue (USD)</label>
                  <select
                    value={mapping.net_revenue_usd}
                    onChange={e => setMapping(prev => ({ ...prev, net_revenue_usd: e.target.value }))}
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Country Code */}
                <div className={styles.mappingRow}>
                  <label>Country Code</label>
                  <select
                    value={mapping.country_code}
                    onChange={e => setMapping(prev => ({ ...prev, country_code: e.target.value }))}
                  >
                    <option value="">-- Not mapped (defaults to WW) --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Base Price */}
                <div className={styles.mappingRow}>
                  <label>Base Price</label>
                  <select
                    value={mapping.base_price}
                    onChange={e => setMapping(prev => ({ ...prev, base_price: e.target.value }))}
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Sale Price */}
                <div className={styles.mappingRow}>
                  <label>Sale Price</label>
                  <select
                    value={mapping.sale_price}
                    onChange={e => setMapping(prev => ({ ...prev, sale_price: e.target.value }))}
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sample data preview */}
              <div className={styles.previewSample}>
                <h4>Sample Data (first 3 rows)</h4>
                <div className={styles.sampleTable}>
                  <table>
                    <thead>
                      <tr>
                        {headers.map(h => (
                          <th key={h} className={mapping.gross_units_sold.includes(h) || mapping.date === h ? styles.mappedColumn : ''}>
                            {h}
                            {mapping.gross_units_sold.includes(h) && <span className={styles.mappedBadge}>Units</span>}
                            {mapping.date === h && <span className={styles.mappedBadge}>Date</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawRows.slice(0, 3).map((row, idx) => (
                        <tr key={idx}>
                          {headers.map(h => (
                            <td key={h} className={mapping.gross_units_sold.includes(h) || mapping.date === h ? styles.mappedColumn : ''}>
                              {row[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Preview & Import */}
          {step === 'preview' && (
            <div className={styles.previewStep}>
              <div className={styles.previewSummary}>
                <div className={`${styles.summaryCard} ${styles.valid}`}>
                  <span className={styles.summaryValue}>{validRows.length}</span>
                  <span className={styles.summaryLabel}>Ready to import</span>
                </div>
                <div className={`${styles.summaryCard} ${styles.invalid}`}>
                  <span className={styles.summaryValue}>{invalidRows.length}</span>
                  <span className={styles.summaryLabel}>With errors</span>
                </div>
                <div className={`${styles.summaryCard} ${styles.info}`}>
                  <span className={styles.summaryValue}>{platform}</span>
                  <span className={styles.summaryLabel}>{productName}</span>
                </div>
              </div>

              {invalidRows.length > 0 && (
                <div className={styles.errorList}>
                  <h4>Rows with Errors (will be skipped)</h4>
                  <div className={styles.errorRows}>
                    {invalidRows.slice(0, 10).map(row => (
                      <div key={row.rowIndex} className={styles.errorRow}>
                        <span className={styles.rowNumber}>Row {row.rowIndex}</span>
                        <span className={styles.rowErrors}>{row.errors.join('; ')}</span>
                      </div>
                    ))}
                    {invalidRows.length > 10 && (
                      <div className={styles.moreErrors}>
                        ...and {invalidRows.length - 10} more rows with errors
                      </div>
                    )}
                  </div>
                </div>
              )}

              {validRows.length > 0 && (
                <div className={styles.validList}>
                  <h4>Data to Import ({validRows.length} rows)</h4>
                  <div className={styles.validTable}>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Units</th>
                          {mapping.net_units_sold && <th>Net Units</th>}
                          {mapping.gross_revenue_usd && <th>Revenue</th>}
                          {mapping.net_revenue_usd && <th>Net Revenue</th>}
                          {mapping.country_code && <th>Country</th>}
                          {/* Show individual source columns for transparency */}
                          {mapping.gross_units_sold.length > 1 && mapping.gross_units_sold.map(col => (
                            <th key={col} className={styles.sourceColumn}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {validRows.slice(0, 20).map(row => (
                          <tr key={row.rowIndex} className={row.warnings.length > 0 ? styles.hasWarning : ''}>
                            <td>{row.date}</td>
                            <td>{row.gross_units_sold}</td>
                            {mapping.net_units_sold && <td>{row.net_units_sold ?? '-'}</td>}
                            {mapping.gross_revenue_usd && <td>{row.gross_revenue_usd != null ? `$${row.gross_revenue_usd.toFixed(2)}` : '-'}</td>}
                            {mapping.net_revenue_usd && <td>{row.net_revenue_usd != null ? `$${row.net_revenue_usd.toFixed(2)}` : '-'}</td>}
                            {mapping.country_code && <td>{row.country_code || 'WW'}</td>}
                            {mapping.gross_units_sold.length > 1 && mapping.gross_units_sold.map(col => (
                              <td key={col} className={styles.sourceColumn}>{row.raw[col]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {validRows.length > 20 && (
                      <div className={styles.moreRows}>
                        ...and {validRows.length - 20} more rows
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isImporting && importProgress.total > 0 && (
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} />
                  <span className={styles.progressText}>
                    Importing {importProgress.current.toLocaleString()} of {importProgress.total.toLocaleString()} rows...
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {step !== 'upload' && (
            <button className={styles.backBtn} onClick={handleBack} disabled={isImporting}>
              ← Back
            </button>
          )}

          <div className={styles.footerRight}>
            <button className={styles.cancelBtn} onClick={onClose} disabled={isImporting}>Cancel</button>

            {step === 'mapping' && (
              <button
                className={styles.primaryBtn}
                onClick={processRows}
                disabled={!mapping.date || mapping.gross_units_sold.length === 0}
              >
                Preview Import →
              </button>
            )}

            {step === 'preview' && (
              <button
                className={styles.primaryBtn}
                onClick={handleImport}
                disabled={validRows.length === 0 || isImporting}
              >
                {isImporting ? 'Importing...' : `Import ${validRows.length} Rows`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
