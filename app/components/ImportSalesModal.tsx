'use client'

import { useState, useCallback, useMemo } from 'react'
import { format, parse, isValid } from 'date-fns'
import { Platform, Product, Game, Client, Sale } from '@/lib/types'
import styles from './ImportSalesModal.module.css'

interface ImportSalesModalProps {
  isOpen: boolean
  onClose: () => void
  products: (Product & { game: Game & { client: Client } })[]
  platforms: Platform[]
  existingSales: Sale[]
  onImport: (sales: Omit<Sale, 'id' | 'created_at'>[]) => Promise<void>
}

interface ParsedRow {
  rowIndex: number
  raw: Record<string, string>
  // Mapped values
  productId?: string
  platformId?: string
  startDate?: string
  endDate?: string
  discountPercentage?: number
  saleName?: string
  saleType?: 'custom' | 'seasonal' | 'festival' | 'special'
  status?: 'planned' | 'submitted' | 'confirmed' | 'live' | 'ended'
  notes?: string
  // Validation
  errors: string[]
  warnings: string[]
  isValid: boolean
}

interface ColumnMapping {
  product: string
  platform: string
  startDate: string
  endDate: string
  discount: string
  saleName: string
  saleType: string
  status: string
  notes: string
}

const DEFAULT_MAPPING: ColumnMapping = {
  product: '',
  platform: '',
  startDate: '',
  endDate: '',
  discount: '',
  saleName: '',
  saleType: '',
  status: '',
  notes: ''
}

// Common date formats to try parsing
const DATE_FORMATS = [
  'yyyy-MM-dd',
  'MM/dd/yyyy',
  'dd/MM/yyyy',
  'M/d/yyyy',
  'd/M/yyyy',
  'yyyy/MM/dd',
  'dd-MM-yyyy',
  'MM-dd-yyyy',
  'dd.MM.yyyy',
  'yyyy.MM.dd'
]

function parseDate(value: string): Date | null {
  if (!value) return null
  
  // Try ISO format first
  const isoDate = new Date(value)
  if (isValid(isoDate) && !isNaN(isoDate.getTime())) {
    return isoDate
  }
  
  // Try various formats
  for (const fmt of DATE_FORMATS) {
    try {
      const parsed = parse(value.trim(), fmt, new Date())
      if (isValid(parsed)) {
        return parsed
      }
    } catch {
      continue
    }
  }
  
  return null
}

function parseCSV(text: string): { headers: string[], rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  
  // Simple CSV parsing (handles basic cases, not complex quoted fields)
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

export default function ImportSalesModal({
  isOpen,
  onClose,
  products,
  platforms,
  existingSales,
  onImport
}: ImportSalesModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_MAPPING)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload')

  // Create lookup maps for matching
  const productLookup = useMemo(() => {
    const map = new Map<string, string>()
    products.forEach(p => {
      // Multiple ways to match product
      map.set(p.name.toLowerCase(), p.id)
      map.set(p.id.toLowerCase(), p.id)
      if (p.steam_product_id) {
        map.set(p.steam_product_id.toLowerCase(), p.id)
      }
      // Also try "Game - Product" format
      if (p.game) {
        map.set(`${p.game.name} - ${p.name}`.toLowerCase(), p.id)
        map.set(`${p.game.name}`.toLowerCase(), p.id) // Just game name for base products
      }
    })
    return map
  }, [products])

  const platformLookup = useMemo(() => {
    const map = new Map<string, string>()
    platforms.forEach(p => {
      map.set(p.name.toLowerCase(), p.id)
      map.set(p.id.toLowerCase(), p.id)
    })
    return map
  }, [platforms])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    
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
      
      // Auto-detect column mappings
      const autoMapping = { ...DEFAULT_MAPPING }
      const lowerHeaders = parsedHeaders.map(h => h.toLowerCase())
      
      // Product column detection
      const productCols = ['product', 'game', 'title', 'name', 'product name', 'game name']
      for (const col of productCols) {
        const idx = lowerHeaders.findIndex(h => h.includes(col))
        if (idx >= 0 && !autoMapping.product) {
          autoMapping.product = parsedHeaders[idx]
          break
        }
      }
      
      // Platform column detection
      const platformCols = ['platform', 'store', 'storefront']
      for (const col of platformCols) {
        const idx = lowerHeaders.findIndex(h => h.includes(col))
        if (idx >= 0) {
          autoMapping.platform = parsedHeaders[idx]
          break
        }
      }
      
      // Date column detection
      const startCols = ['start', 'begin', 'from']
      const endCols = ['end', 'finish', 'to', 'until']
      
      for (const col of startCols) {
        const idx = lowerHeaders.findIndex(h => h.includes(col) && h.includes('date'))
        if (idx >= 0) {
          autoMapping.startDate = parsedHeaders[idx]
          break
        }
      }
      if (!autoMapping.startDate) {
        const idx = lowerHeaders.findIndex(h => startCols.some(c => h.includes(c)))
        if (idx >= 0) autoMapping.startDate = parsedHeaders[idx]
      }
      
      for (const col of endCols) {
        const idx = lowerHeaders.findIndex(h => h.includes(col) && h.includes('date'))
        if (idx >= 0) {
          autoMapping.endDate = parsedHeaders[idx]
          break
        }
      }
      if (!autoMapping.endDate) {
        const idx = lowerHeaders.findIndex(h => endCols.some(c => h.includes(c)))
        if (idx >= 0) autoMapping.endDate = parsedHeaders[idx]
      }
      
      // Discount column detection
      const discountCols = ['discount', 'percent', '%', 'off']
      for (const col of discountCols) {
        const idx = lowerHeaders.findIndex(h => h.includes(col))
        if (idx >= 0) {
          autoMapping.discount = parsedHeaders[idx]
          break
        }
      }
      
      // Sale name detection
      const nameCols = ['sale name', 'sale', 'campaign', 'event']
      for (const col of nameCols) {
        const idx = lowerHeaders.findIndex(h => h === col || h.includes(col))
        if (idx >= 0 && parsedHeaders[idx].toLowerCase() !== autoMapping.platform.toLowerCase()) {
          autoMapping.saleName = parsedHeaders[idx]
          break
        }
      }
      
      // Notes/comment detection
      const notesCols = ['notes', 'comment', 'comments', 'description']
      for (const col of notesCols) {
        const idx = lowerHeaders.findIndex(h => h.includes(col))
        if (idx >= 0) {
          autoMapping.notes = parsedHeaders[idx]
          break
        }
      }
      
      setMapping(autoMapping)
      setStep('mapping')
      
    } catch (err) {
      console.error('Error parsing file:', err)
      setImportError('Failed to read file. Please ensure it is a valid CSV file.')
    }
  }, [])

  const handleMappingChange = useCallback((field: keyof ColumnMapping, value: string) => {
    setMapping(prev => ({ ...prev, [field]: value }))
  }, [])

  const processRows = useCallback(() => {
    const processed: ParsedRow[] = rawRows.map((row, idx) => {
      const errors: string[] = []
      const warnings: string[] = []
      
      // Extract values based on mapping
      const productValue = mapping.product ? row[mapping.product] : ''
      const platformValue = mapping.platform ? row[mapping.platform] : ''
      const startDateValue = mapping.startDate ? row[mapping.startDate] : ''
      const endDateValue = mapping.endDate ? row[mapping.endDate] : ''
      const discountValue = mapping.discount ? row[mapping.discount] : ''
      const saleNameValue = mapping.saleName ? row[mapping.saleName] : ''
      const notesValue = mapping.notes ? row[mapping.notes] : ''
      
      // Match product
      let productId: string | undefined
      if (productValue) {
        productId = productLookup.get(productValue.toLowerCase())
        if (!productId) {
          errors.push(`Product "${productValue}" not found`)
        }
      } else {
        errors.push('Product is required')
      }
      
      // Match platform
      let platformId: string | undefined
      if (platformValue) {
        platformId = platformLookup.get(platformValue.toLowerCase())
        if (!platformId) {
          errors.push(`Platform "${platformValue}" not found`)
        }
      } else {
        errors.push('Platform is required')
      }
      
      // Parse dates
      let startDate: string | undefined
      let endDate: string | undefined
      
      if (startDateValue) {
        const parsed = parseDate(startDateValue)
        if (parsed) {
          startDate = format(parsed, 'yyyy-MM-dd')
        } else {
          errors.push(`Could not parse start date: "${startDateValue}"`)
        }
      } else {
        errors.push('Start date is required')
      }
      
      if (endDateValue) {
        const parsed = parseDate(endDateValue)
        if (parsed) {
          endDate = format(parsed, 'yyyy-MM-dd')
        } else {
          errors.push(`Could not parse end date: "${endDateValue}"`)
        }
      } else {
        errors.push('End date is required')
      }
      
      // Validate date range
      if (startDate && endDate && startDate > endDate) {
        errors.push('Start date must be before end date')
      }
      
      // Parse discount
      let discountPercentage: number | undefined
      if (discountValue) {
        const numValue = parseFloat(discountValue.replace(/[^0-9.-]/g, ''))
        if (!isNaN(numValue)) {
          discountPercentage = numValue > 1 ? numValue : numValue * 100 // Handle 0.5 vs 50
        } else {
          warnings.push(`Could not parse discount: "${discountValue}"`)
        }
      }
      
      // Check for duplicates in existing sales
      if (productId && platformId && startDate && endDate) {
        const isDuplicate = existingSales.some(s => 
          s.product_id === productId &&
          s.platform_id === platformId &&
          s.start_date === startDate &&
          s.end_date === endDate
        )
        if (isDuplicate) {
          warnings.push('Possible duplicate - sale with same product/platform/dates exists')
        }
      }
      
      return {
        rowIndex: idx + 2, // +2 for 1-indexed and header row
        raw: row,
        productId,
        platformId,
        startDate,
        endDate,
        discountPercentage,
        saleName: saleNameValue || undefined,
        saleType: 'custom' as const,
        status: 'ended' as const, // Historical sales are typically ended
        notes: notesValue || undefined,
        errors,
        warnings,
        isValid: errors.length === 0
      }
    })
    
    setParsedRows(processed)
    setStep('preview')
  }, [rawRows, mapping, productLookup, platformLookup, existingSales])

  const validRows = useMemo(() => parsedRows.filter(r => r.isValid), [parsedRows])
  const invalidRows = useMemo(() => parsedRows.filter(r => !r.isValid), [parsedRows])
  const warningRows = useMemo(() => parsedRows.filter(r => r.warnings.length > 0), [parsedRows])

  const handleImport = useCallback(async () => {
    if (validRows.length === 0) return
    
    setIsImporting(true)
    setImportError(null)
    
    try {
      const salesToCreate = validRows.map(row => ({
        product_id: row.productId!,
        platform_id: row.platformId!,
        start_date: row.startDate!,
        end_date: row.endDate!,
        discount_percentage: row.discountPercentage,
        sale_name: row.saleName,
        sale_type: row.saleType || 'custom' as const,
        status: row.status || 'ended' as const,
        notes: row.notes
      }))
      
      await onImport(salesToCreate)
      onClose()
    } catch (err) {
      console.error('Import error:', err)
      setImportError(err instanceof Error ? err.message : 'Failed to import sales')
    } finally {
      setIsImporting(false)
    }
  }, [validRows, onImport, onClose])

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

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Import Historical Sales</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Progress indicator */}
        <div className={styles.progress}>
          <div className={`${styles.progressStep} ${step === 'upload' ? styles.active : ''} ${step !== 'upload' ? styles.completed : ''}`}>
            <span className={styles.stepNumber}>1</span>
            <span className={styles.stepLabel}>Upload</span>
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
            <div className={styles.error}>
              {importError}
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className={styles.uploadStep}>
              <div className={styles.dropzone}>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileSelect}
                  className={styles.fileInput}
                  id="file-upload"
                />
                <label htmlFor="file-upload" className={styles.dropzoneLabel}>
                  <div className={styles.uploadIcon}>📁</div>
                  <p className={styles.uploadText}>
                    Click to select a CSV file or drag and drop
                  </p>
                  <p className={styles.uploadHint}>
                    Supported formats: .csv, .tsv
                  </p>
                </label>
              </div>

              <div className={styles.templateInfo}>
                <h4>Expected Columns</h4>
                <p>Your CSV should include these columns (names are flexible):</p>
                <ul>
                  <li><strong>Product/Game</strong> - Product name (must match existing products)</li>
                  <li><strong>Platform</strong> - Steam, PlayStation, Xbox, Nintendo, Epic</li>
                  <li><strong>Start Date</strong> - Sale start date (various formats supported)</li>
                  <li><strong>End Date</strong> - Sale end date</li>
                  <li><em>Discount %</em> - Optional discount percentage</li>
                  <li><em>Sale Name</em> - Optional sale/campaign name</li>
                  <li><em>Notes</em> - Optional comments</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <div className={styles.mappingStep}>
              <p className={styles.mappingHint}>
                Map your CSV columns to the required fields. We&apos;ve auto-detected what we could.
              </p>

              <div className={styles.mappingGrid}>
                <div className={styles.mappingRow}>
                  <label>Product/Game <span className={styles.required}>*</span></label>
                  <select
                    value={mapping.product}
                    onChange={e => handleMappingChange('product', e.target.value)}
                  >
                    <option value="">-- Select column --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.mappingRow}>
                  <label>Platform <span className={styles.required}>*</span></label>
                  <select
                    value={mapping.platform}
                    onChange={e => handleMappingChange('platform', e.target.value)}
                  >
                    <option value="">-- Select column --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.mappingRow}>
                  <label>Start Date <span className={styles.required}>*</span></label>
                  <select
                    value={mapping.startDate}
                    onChange={e => handleMappingChange('startDate', e.target.value)}
                  >
                    <option value="">-- Select column --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.mappingRow}>
                  <label>End Date <span className={styles.required}>*</span></label>
                  <select
                    value={mapping.endDate}
                    onChange={e => handleMappingChange('endDate', e.target.value)}
                  >
                    <option value="">-- Select column --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.mappingRow}>
                  <label>Discount %</label>
                  <select
                    value={mapping.discount}
                    onChange={e => handleMappingChange('discount', e.target.value)}
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.mappingRow}>
                  <label>Sale Name</label>
                  <select
                    value={mapping.saleName}
                    onChange={e => handleMappingChange('saleName', e.target.value)}
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.mappingRow}>
                  <label>Notes/Comments</label>
                  <select
                    value={mapping.notes}
                    onChange={e => handleMappingChange('notes', e.target.value)}
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.previewSample}>
                <h4>Sample Data (first 3 rows)</h4>
                <div className={styles.sampleTable}>
                  <table>
                    <thead>
                      <tr>
                        {headers.map(h => <th key={h}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rawRows.slice(0, 3).map((row, idx) => (
                        <tr key={idx}>
                          {headers.map(h => <td key={h}>{row[h]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
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
                <div className={`${styles.summaryCard} ${styles.warning}`}>
                  <span className={styles.summaryValue}>{warningRows.length}</span>
                  <span className={styles.summaryLabel}>With warnings</span>
                </div>
              </div>

              {invalidRows.length > 0 && (
                <div className={styles.errorList}>
                  <h4>Rows with Errors (will be skipped)</h4>
                  <div className={styles.errorRows}>
                    {invalidRows.slice(0, 10).map(row => (
                      <div key={row.rowIndex} className={styles.errorRow}>
                        <span className={styles.rowNumber}>Row {row.rowIndex}</span>
                        <span className={styles.rowErrors}>
                          {row.errors.join('; ')}
                        </span>
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
                  <h4>Sales to Import ({validRows.length})</h4>
                  <div className={styles.validTable}>
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Platform</th>
                          <th>Start</th>
                          <th>End</th>
                          <th>Discount</th>
                          <th>Name</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validRows.slice(0, 20).map(row => {
                          const product = products.find(p => p.id === row.productId)
                          const platform = platforms.find(p => p.id === row.platformId)
                          return (
                            <tr key={row.rowIndex} className={row.warnings.length > 0 ? styles.hasWarning : ''}>
                              <td>{product?.name || 'Unknown'}</td>
                              <td>
                                <span 
                                  className={styles.platformDot}
                                  style={{ backgroundColor: platform?.color_hex }}
                                />
                                {platform?.name}
                              </td>
                              <td>{row.startDate}</td>
                              <td>{row.endDate}</td>
                              <td>{row.discountPercentage ? `${row.discountPercentage}%` : '-'}</td>
                              <td>{row.saleName || '-'}</td>
                              <td>
                                {row.warnings.length > 0 && (
                                  <span className={styles.warningIcon} title={row.warnings.join('\n')}>⚠️</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {validRows.length > 20 && (
                      <div className={styles.moreRows}>
                        ...and {validRows.length - 20} more sales
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {step !== 'upload' && (
            <button className={styles.backBtn} onClick={handleBack}>
              ← Back
            </button>
          )}
          
          <div className={styles.footerRight}>
            <button className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            
            {step === 'mapping' && (
              <button 
                className={styles.primaryBtn}
                onClick={processRows}
                disabled={!mapping.product || !mapping.platform || !mapping.startDate || !mapping.endDate}
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
                {isImporting ? 'Importing...' : `Import ${validRows.length} Sales`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
