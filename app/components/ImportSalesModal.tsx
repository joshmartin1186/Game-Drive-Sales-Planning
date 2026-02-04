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
  // New props for client scoping and product creation
  clients: Client[]
  games: (Game & { client: Client })[]
  onProductCreate?: (product: Omit<Product, 'id' | 'created_at'>) => Promise<Product | undefined>
  onGameCreate?: (game: Omit<Game, 'id' | 'created_at'>) => Promise<(Game & { client: Client }) | undefined>
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
  // Track missing product name for creation
  missingProductName?: string
}

// Track products to create
interface ProductToCreate {
  name: string
  gameId: string
  gameName: string
  rowCount: number // How many rows reference this product
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

// Import format presets for common platforms
type ImportPreset = 'auto' | 'microsoft' | 'steam' | 'generic'

interface FormatPreset {
  name: string
  description: string
  platformHint?: string // Auto-fill platform if detected
  columnPatterns: {
    product: string[]
    platform: string[]
    startDate: string[]
    endDate: string[]
    discount: string[]
    saleName: string[]
    notes: string[]
  }
}

const FORMAT_PRESETS: Record<Exclude<ImportPreset, 'auto'>, FormatPreset> = {
  microsoft: {
    name: 'Microsoft Store',
    description: 'Xbox / Windows Store Partner Center exports',
    platformHint: 'Microsoft',
    columnPatterns: {
      product: ['product', 'productname', 'title', 'game title', 'product title', 'name', 'big id'],
      platform: ['market', 'storefront', 'platform'],
      startDate: ['start date', 'startdate', 'promo start', 'promotion start', 'start'],
      endDate: ['end date', 'enddate', 'promo end', 'promotion end', 'end'],
      discount: ['discount', 'discount %', 'percentage', 'sale price', 'percent off'],
      saleName: ['promo name', 'promotion', 'campaign', 'sale name', 'promotion name'],
      notes: ['notes', 'comments', 'description']
    }
  },
  steam: {
    name: 'Steam',
    description: 'Steam partner exports',
    platformHint: 'Steam',
    columnPatterns: {
      product: ['app name', 'appname', 'product', 'game', 'title'],
      platform: ['platform', 'store'],
      startDate: ['start date', 'start', 'begin date'],
      endDate: ['end date', 'end', 'finish date'],
      discount: ['discount', 'discount %', 'percent'],
      saleName: ['sale', 'event', 'campaign', 'promo'],
      notes: ['notes', 'description']
    }
  },
  generic: {
    name: 'Generic CSV',
    description: 'Standard format with flexible column names',
    columnPatterns: {
      product: ['product', 'game', 'title', 'name', 'product name', 'game name'],
      platform: ['platform', 'store', 'storefront'],
      startDate: ['start', 'begin', 'from', 'start date'],
      endDate: ['end', 'finish', 'to', 'until', 'end date'],
      discount: ['discount', 'percent', '%', 'off'],
      saleName: ['sale name', 'sale', 'campaign', 'event'],
      notes: ['notes', 'comment', 'comments', 'description']
    }
  }
}

// Common date formats to try parsing
// Order matters: EU formats first (dd/MM) since Game Drive clients are European
const DATE_FORMATS = [
  'yyyy-MM-dd',      // ISO standard (unambiguous)
  'yyyy/MM/dd',      // ISO with slashes (unambiguous)
  'yyyy.MM.dd',      // ISO with dots (unambiguous)
  'dd/MM/yyyy',      // EU format (prioritized for EU clients)
  'd/M/yyyy',        // EU without leading zeros
  'dd-MM-yyyy',      // EU with dashes
  'dd.MM.yyyy',      // European dot format
  'MM/dd/yyyy',      // US format (fallback)
  'M/d/yyyy',        // US without leading zeros
  'MM-dd-yyyy',      // US with dashes
]

interface ParsedDateResult {
  date: Date | null
  warning?: string
  detectedFormat?: string
}

function parseDate(value: string): Date | null {
  const result = parseDateWithWarning(value)
  return result.date
}

function parseDateWithWarning(value: string): ParsedDateResult {
  if (!value) return { date: null }

  const trimmed = value.trim()

  // Check for ISO format first (unambiguous: yyyy-MM-dd or yyyy/MM/dd)
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    if (isValid(date)) {
      return { date, detectedFormat: 'ISO' }
    }
  }

  // For dd/MM/yyyy or MM/dd/yyyy formats, use heuristics
  const slashMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (slashMatch) {
    const [, first, second, year] = slashMatch
    const firstNum = parseInt(first)
    const secondNum = parseInt(second)
    const yearNum = parseInt(year)

    // Heuristic: if first number > 12, it MUST be the day (EU format)
    if (firstNum > 12) {
      const date = new Date(yearNum, secondNum - 1, firstNum)
      if (isValid(date)) {
        return { date, detectedFormat: 'EU (dd/MM/yyyy)' }
      }
    }

    // Heuristic: if second number > 12, it MUST be the day (US format)
    if (secondNum > 12) {
      const date = new Date(yearNum, firstNum - 1, secondNum)
      if (isValid(date)) {
        return { date, detectedFormat: 'US (MM/dd/yyyy)' }
      }
    }

    // Ambiguous case: both could be month or day (e.g., 01/06/2025)
    // Default to EU format since Game Drive clients are European
    // but flag as ambiguous for warning
    const euDate = new Date(yearNum, secondNum - 1, firstNum)
    if (isValid(euDate)) {
      const isAmbiguous = firstNum <= 12 && secondNum <= 12
      return {
        date: euDate,
        detectedFormat: 'EU (dd/MM/yyyy)',
        warning: isAmbiguous
          ? `Ambiguous date "${trimmed}" interpreted as EU format (day/month/year). Parsed as ${format(euDate, 'MMMM d, yyyy')}.`
          : undefined
      }
    }
  }

  // Fallback: try all formats explicitly with date-fns parse
  for (const fmt of DATE_FORMATS) {
    try {
      const parsed = parse(trimmed, fmt, new Date())
      if (isValid(parsed)) {
        return { date: parsed, detectedFormat: fmt }
      }
    } catch {
      continue
    }
  }

  return { date: null }
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
  onImport,
  clients,
  games,
  onProductCreate,
  onGameCreate
}: ImportSalesModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_MAPPING)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload')
  const [isDragActive, setIsDragActive] = useState(false)

  // New: Import preset and append mode
  const [importPreset, setImportPreset] = useState<ImportPreset>('auto')
  const [skipDuplicates, setSkipDuplicates] = useState(true) // Append mode: skip duplicates by default
  const [detectedPreset, setDetectedPreset] = useState<ImportPreset | null>(null)

  // Client scoping and product creation
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [productsToCreate, setProductsToCreate] = useState<Map<string, ProductToCreate>>(new Map())
  const [selectedProductsToCreate, setSelectedProductsToCreate] = useState<Set<string>>(new Set())
  const [isCreatingProducts, setIsCreatingProducts] = useState(false)
  const [createdProductIds, setCreatedProductIds] = useState<Map<string, string>>(new Map()) // productName -> productId

  // Filter products by selected client
  const filteredProducts = useMemo(() => {
    if (!selectedClientId) return products
    return products.filter(p => p.game?.client_id === selectedClientId)
  }, [products, selectedClientId])

  // Filter games by selected client
  const filteredGames = useMemo(() => {
    if (!selectedClientId) return games
    return games.filter(g => g.client_id === selectedClientId)
  }, [games, selectedClientId])

  // Create lookup maps for matching (scoped to selected client if set)
  const productLookup = useMemo(() => {
    const map = new Map<string, string>()
    // Also include created products from this session
    createdProductIds.forEach((productId, productName) => {
      map.set(productName.toLowerCase(), productId)
    })
    filteredProducts.forEach(p => {
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
  }, [filteredProducts, createdProductIds])

  const platformLookup = useMemo(() => {
    const map = new Map<string, string>()
    platforms.forEach(p => {
      const name = p.name.toLowerCase()
      map.set(name, p.id)
      map.set(p.id.toLowerCase(), p.id)

      // Add normalized variants for better matching
      // "Nintendo - EU" → "nintendo - eu", "nintendo-eu", "nintendo eu", "nintendoeu"
      const normalizedNoSpaceHyphen = name.replace(/\s*-\s*/g, '-') // "nintendo-eu"
      const normalizedSpaceOnly = name.replace(/\s*-\s*/g, ' ') // "nintendo eu"
      const normalizedNoSeparator = name.replace(/[\s-]+/g, '') // "nintendoeu"

      if (normalizedNoSpaceHyphen !== name) map.set(normalizedNoSpaceHyphen, p.id)
      if (normalizedSpaceOnly !== name) map.set(normalizedSpaceOnly, p.id)
      if (normalizedNoSeparator !== name) map.set(normalizedNoSeparator, p.id)
    })
    return map
  }, [platforms])

  // Helper to normalize platform value for matching
  const normalizePlatformValue = useCallback((value: string): string[] => {
    const lower = value.toLowerCase().trim()
    // Return multiple variants to try matching
    return [
      lower,
      lower.replace(/\s*-\s*/g, '-'), // "nintendo - eu" → "nintendo-eu"
      lower.replace(/\s*-\s*/g, ' '), // "nintendo - eu" → "nintendo eu"
      lower.replace(/[\s-]+/g, ''), // "nintendo - eu" → "nintendoeu"
    ]
  }, [])

  // Auto-detect import format based on CSV headers
  const detectPreset = useCallback((csvHeaders: string[]): ImportPreset => {
    const lowerHeaders = csvHeaders.map(h => h.toLowerCase().trim())

    // Check for Microsoft Store specific patterns
    const microsoftIndicators = ['big id', 'market', 'promo start', 'promo end', 'promotion start', 'promotion end', 'xbox', 'ms store']
    const hasMicrosoftHeaders = microsoftIndicators.some(ind =>
      lowerHeaders.some(h => h.includes(ind))
    )
    if (hasMicrosoftHeaders) return 'microsoft'

    // Check for Steam specific patterns
    const steamIndicators = ['app name', 'appname', 'appid', 'steam', 'app id']
    const hasSteamHeaders = steamIndicators.some(ind =>
      lowerHeaders.some(h => h.includes(ind))
    )
    if (hasSteamHeaders) return 'steam'

    return 'generic'
  }, [])

  // Apply preset column mapping
  const applyPresetMapping = useCallback((preset: ImportPreset, csvHeaders: string[]): ColumnMapping => {
    const presetConfig = preset === 'auto' ? FORMAT_PRESETS.generic : FORMAT_PRESETS[preset]
    const lowerHeaders = csvHeaders.map(h => h.toLowerCase().trim())
    const newMapping = { ...DEFAULT_MAPPING }

    const findColumn = (patterns: string[]): string => {
      for (const pattern of patterns) {
        const idx = lowerHeaders.findIndex(h => h.includes(pattern) || h === pattern)
        if (idx >= 0) return csvHeaders[idx]
      }
      return ''
    }

    newMapping.product = findColumn(presetConfig.columnPatterns.product)
    newMapping.platform = findColumn(presetConfig.columnPatterns.platform)
    newMapping.startDate = findColumn(presetConfig.columnPatterns.startDate)
    newMapping.endDate = findColumn(presetConfig.columnPatterns.endDate)
    newMapping.discount = findColumn(presetConfig.columnPatterns.discount)
    newMapping.saleName = findColumn(presetConfig.columnPatterns.saleName)
    newMapping.notes = findColumn(presetConfig.columnPatterns.notes)

    return newMapping
  }, [])

  // Shared file processing logic
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

      // Auto-detect format preset based on headers
      const detected = detectPreset(parsedHeaders)
      setDetectedPreset(detected)

      // Apply the detected or user-selected preset
      const presetToUse = importPreset === 'auto' ? detected : importPreset
      const autoMapping = applyPresetMapping(presetToUse, parsedHeaders)

      setMapping(autoMapping)
      setStep('mapping')

    } catch (err) {
      console.error('Error parsing file:', err)
      setImportError('Failed to read file. Please ensure it is a valid CSV file.')
    }
  }, [detectPreset, applyPresetMapping, importPreset])

  // Handle file input change
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      processFile(selectedFile)
    }
  }, [processFile])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only deactivate if leaving the dropzone entirely
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
      // Validate file type
      const validTypes = ['.csv', '.tsv', '.txt']
      const fileName = droppedFile.name.toLowerCase()
      const isValidType = validTypes.some(ext => fileName.endsWith(ext))

      if (!isValidType) {
        setImportError('Please drop a CSV, TSV, or TXT file.')
        return
      }

      processFile(droppedFile)
    }
  }, [processFile])

  const handleMappingChange = useCallback((field: keyof ColumnMapping, value: string) => {
    setMapping(prev => ({ ...prev, [field]: value }))
  }, [])

  const processRows = useCallback(() => {
    const missingProducts = new Map<string, ProductToCreate>()

    const processed: ParsedRow[] = rawRows.map((row, idx) => {
      const errors: string[] = []
      const warnings: string[] = []
      let missingProductName: string | undefined

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
          missingProductName = productValue.trim()

          // Track missing product for potential creation (only if client is selected)
          if (selectedClientId && missingProductName) {
            const key = missingProductName.toLowerCase()
            const existing = missingProducts.get(key)
            if (existing) {
              existing.rowCount++
            } else {
              // Try to find a matching game for this product
              const defaultGame = filteredGames.length === 1 ? filteredGames[0] : undefined
              missingProducts.set(key, {
                name: missingProductName,
                gameId: defaultGame?.id || '',
                gameName: defaultGame?.name || '',
                rowCount: 1
              })
            }
          }
        }
      } else {
        errors.push('Product is required')
      }
      
      // Match platform (with normalized hyphen/space handling)
      let platformId: string | undefined
      if (platformValue) {
        // Try multiple normalized variants
        const variants = normalizePlatformValue(platformValue)
        for (const variant of variants) {
          platformId = platformLookup.get(variant)
          if (platformId) break
        }
        if (!platformId) {
          errors.push(`Platform "${platformValue}" not found. Available platforms: ${platforms.map(p => p.name).join(', ')}`)
        }
      } else {
        errors.push('Platform is required')
      }
      
      // Parse dates with ambiguity detection
      let startDate: string | undefined
      let endDate: string | undefined

      if (startDateValue) {
        const result = parseDateWithWarning(startDateValue)
        if (result.date) {
          startDate = format(result.date, 'yyyy-MM-dd')
          if (result.warning) {
            warnings.push(result.warning)
          }
        } else {
          errors.push(`Could not parse start date: "${startDateValue}"`)
        }
      } else {
        errors.push('Start date is required')
      }

      if (endDateValue) {
        const result = parseDateWithWarning(endDateValue)
        if (result.date) {
          endDate = format(result.date, 'yyyy-MM-dd')
          if (result.warning) {
            warnings.push(result.warning)
          }
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

      // Warn about unusually long durations (possible date format issue)
      if (startDate && endDate && startDate <= endDate) {
        const start = new Date(startDate)
        const end = new Date(endDate)
        const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        if (durationDays > 90) {
          warnings.push(`Sale duration is ${durationDays} days. If this seems wrong, the date format may have been misinterpreted.`)
        }
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
      let isDuplicate = false
      if (productId && platformId && startDate && endDate) {
        isDuplicate = existingSales.some(s =>
          s.product_id === productId &&
          s.platform_id === platformId &&
          s.start_date === startDate &&
          s.end_date === endDate
        )
        if (isDuplicate) {
          if (skipDuplicates) {
            errors.push('Duplicate - sale with same product/platform/dates already exists (skipping)')
          } else {
            warnings.push('Possible duplicate - sale with same product/platform/dates exists')
          }
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
        isValid: errors.length === 0,
        missingProductName
      }
    })

    setParsedRows(processed)
    setProductsToCreate(missingProducts)
    // Auto-select all missing products for creation if onProductCreate is available
    if (onProductCreate && missingProducts.size > 0) {
      setSelectedProductsToCreate(new Set(missingProducts.keys()))
    }
    setStep('preview')
  }, [rawRows, mapping, productLookup, platformLookup, existingSales, skipDuplicates, normalizePlatformValue, platforms, selectedClientId, filteredGames, onProductCreate])

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
      setProductsToCreate(new Map())
      setSelectedProductsToCreate(new Set())
      setCreatedProductIds(new Map())
    }
  }, [step])

  // Handle updating game assignment for a product to create
  const handleProductGameChange = useCallback((productKey: string, gameId: string) => {
    setProductsToCreate(prev => {
      const newMap = new Map(prev)
      const product = newMap.get(productKey)
      if (product) {
        const game = filteredGames.find(g => g.id === gameId)
        newMap.set(productKey, {
          ...product,
          gameId,
          gameName: game?.name || ''
        })
      }
      return newMap
    })
  }, [filteredGames])

  // Toggle product selection for creation
  const toggleProductSelection = useCallback((productKey: string) => {
    setSelectedProductsToCreate(prev => {
      const newSet = new Set(prev)
      if (newSet.has(productKey)) {
        newSet.delete(productKey)
      } else {
        newSet.add(productKey)
      }
      return newSet
    })
  }, [])

  // Reprocess rows when new products are created
  const reprocessRowsWithNewProducts = useCallback((newProductIds: Map<string, string>) => {
    setParsedRows(currentRows => {
      if (newProductIds.size === 0 || currentRows.length === 0) return currentRows

      return currentRows.map(row => {
        if (row.missingProductName && !row.productId) {
          const productId = newProductIds.get(row.missingProductName.toLowerCase())
          if (productId) {
            // Product was created, update this row
            const newErrors = row.errors.filter(e => !e.includes('not found'))
            return {
              ...row,
              productId,
              errors: newErrors,
              isValid: newErrors.length === 0
            }
          }
        }
        return row
      })
    })
  }, [])

  // Create selected products and reprocess rows
  const handleCreateProducts = useCallback(async () => {
    if (!onProductCreate || selectedProductsToCreate.size === 0) return

    setIsCreatingProducts(true)
    setImportError(null)

    try {
      const newCreatedIds = new Map(createdProductIds)
      const selectedKeys = Array.from(selectedProductsToCreate)

      for (const productKey of selectedKeys) {
        const productInfo = productsToCreate.get(productKey)
        if (!productInfo || !productInfo.gameId) {
          setImportError(`Please select a game for "${productInfo?.name || productKey}"`)
          setIsCreatingProducts(false)
          return
        }

        const created = await onProductCreate({
          game_id: productInfo.gameId,
          name: productInfo.name,
          product_type: 'base' // Default to base product
        })

        if (created) {
          newCreatedIds.set(productInfo.name.toLowerCase(), created.id)
        }
      }

      setCreatedProductIds(newCreatedIds)
      setSelectedProductsToCreate(new Set())
      setProductsToCreate(new Map())

      // Reprocess rows with the newly created products immediately
      reprocessRowsWithNewProducts(newCreatedIds)
    } catch (err) {
      console.error('Error creating products:', err)
      setImportError(err instanceof Error ? err.message : 'Failed to create products')
    } finally {
      setIsCreatingProducts(false)
    }
  }, [onProductCreate, selectedProductsToCreate, productsToCreate, createdProductIds, reprocessRowsWithNewProducts])

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
              {/* Import Options */}
              <div className={styles.importOptions}>
                {/* Client Selection */}
                <div className={styles.optionGroup}>
                  <label className={styles.optionLabel}>Import for Client <span className={styles.required}>*</span></label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className={styles.presetSelect}
                  >
                    <option value="">-- Select a client --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <p className={styles.optionHint}>
                    {selectedClientId
                      ? `Products will be matched against ${clients.find(c => c.id === selectedClientId)?.name}'s catalog. Missing products can be created.`
                      : 'Select a client to scope the import and enable product creation'}
                  </p>
                </div>

                <div className={styles.optionGroup}>
                  <label className={styles.optionLabel}>Import Format</label>
                  <select
                    value={importPreset}
                    onChange={(e) => setImportPreset(e.target.value as ImportPreset)}
                    className={styles.presetSelect}
                  >
                    <option value="auto">🔍 Auto-Detect</option>
                    <option value="microsoft">🪟 Microsoft Store (Partner Center)</option>
                    <option value="steam">🎮 Steam (Steamworks)</option>
                    <option value="generic">📄 Generic CSV</option>
                  </select>
                  <p className={styles.optionHint}>
                    {importPreset === 'auto' && 'Automatically detect format from column headers'}
                    {importPreset === 'microsoft' && 'Xbox / Windows Store Partner Center exports'}
                    {importPreset === 'steam' && 'Steam partner portal exports'}
                    {importPreset === 'generic' && 'Standard CSV with flexible column names'}
                  </p>
                </div>

                <div className={styles.optionGroup}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                    />
                    <span className={styles.checkboxText}>
                      <strong>Append Mode</strong> — Skip rows that already exist in database
                    </span>
                  </label>
                  <p className={styles.optionHint}>
                    {skipDuplicates
                      ? 'Duplicates (same product/platform/dates) will be skipped automatically'
                      : 'Duplicates will show as warnings but still be imported'}
                  </p>
                </div>
              </div>

              <div
                className={`${styles.dropzone} ${isDragActive ? styles.dropzoneActive : ''}`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileSelect}
                  className={styles.fileInput}
                  id="file-upload"
                />
                <label htmlFor="file-upload" className={styles.dropzoneLabel}>
                  <div className={styles.uploadIcon}>{isDragActive ? '📥' : '📁'}</div>
                  <p className={styles.uploadText}>
                    {isDragActive ? 'Drop your file here!' : 'Click to select a CSV file or drag and drop'}
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
                  <li><strong>Platform</strong> - Steam, PlayStation, Xbox, Nintendo, Epic, Microsoft</li>
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
              {detectedPreset && (
                <div className={styles.detectedFormat}>
                  <span className={styles.detectedLabel}>Detected Format:</span>
                  <span className={styles.detectedValue}>
                    {detectedPreset === 'microsoft' && '🪟 Microsoft Store'}
                    {detectedPreset === 'steam' && '🎮 Steam'}
                    {detectedPreset === 'generic' && '📄 Generic CSV'}
                  </span>
                  {skipDuplicates && (
                    <span className={styles.appendBadge}>Append Mode Active</span>
                  )}
                </div>
              )}
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
              {skipDuplicates && invalidRows.some(r => r.errors.some(e => e.includes('Duplicate'))) && (
                <div className={styles.appendModeNotice}>
                  <span className={styles.appendModeIcon}>✓</span>
                  <span>Append Mode: Duplicates are being skipped automatically</span>
                </div>
              )}
              <div className={styles.previewSummary}>
                <div className={`${styles.summaryCard} ${styles.valid}`}>
                  <span className={styles.summaryValue}>{validRows.length}</span>
                  <span className={styles.summaryLabel}>Ready to import</span>
                </div>
                <div className={`${styles.summaryCard} ${styles.invalid}`}>
                  <span className={styles.summaryValue}>{invalidRows.length}</span>
                  <span className={styles.summaryLabel}>{skipDuplicates ? 'Skipped' : 'With errors'}</span>
                </div>
                <div className={`${styles.summaryCard} ${styles.warning}`}>
                  <span className={styles.summaryValue}>{warningRows.length}</span>
                  <span className={styles.summaryLabel}>With warnings</span>
                </div>
              </div>

              {/* Create Missing Products Section */}
              {onProductCreate && productsToCreate.size > 0 && selectedClientId && (
                <div className={styles.createProductsSection}>
                  <div className={styles.createProductsHeader}>
                    <h4>🆕 Create Missing Products</h4>
                    <p>These products were not found. Select the ones you want to create:</p>
                    {filteredGames.length === 0 ? (
                      <div className={styles.noGamesWarning}>
                        <span className={styles.warningIcon}>⚠️</span>
                        <span>No games found for this client. Please create a game first in the Product Manager.</span>
                      </div>
                    ) : (
                      <div className={styles.bulkGameSelect}>
                        <label>Assign all to game:</label>
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              // Set all products to this game
                              const gameId = e.target.value
                              setProductsToCreate(prev => {
                                const newMap = new Map(prev)
                                newMap.forEach((product, key) => {
                                  const game = filteredGames.find(g => g.id === gameId)
                                  newMap.set(key, { ...product, gameId, gameName: game?.name || '' })
                                })
                                return newMap
                              })
                            }
                          }}
                          className={styles.gameSelect}
                        >
                          <option value="">-- Select game for all --</option>
                          {filteredGames.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  {filteredGames.length > 0 && (
                    <>
                      <div className={styles.createProductsList}>
                        {Array.from(productsToCreate.entries()).map(([key, product]) => (
                          <div key={key} className={styles.createProductItem}>
                            <label className={styles.createProductCheckbox}>
                              <input
                                type="checkbox"
                                checked={selectedProductsToCreate.has(key)}
                                onChange={() => toggleProductSelection(key)}
                              />
                              <span className={styles.productName}>{product.name}</span>
                              <span className={styles.rowCountBadge}>{product.rowCount} row{product.rowCount > 1 ? 's' : ''}</span>
                            </label>
                            <select
                              value={product.gameId}
                              onChange={(e) => handleProductGameChange(key, e.target.value)}
                              className={styles.gameSelect}
                              disabled={!selectedProductsToCreate.has(key)}
                            >
                              <option value="">-- Select Game --</option>
                              {filteredGames.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <button
                        className={styles.createProductsBtn}
                        onClick={handleCreateProducts}
                        disabled={selectedProductsToCreate.size === 0 || isCreatingProducts || Array.from(selectedProductsToCreate).some(k => !productsToCreate.get(k)?.gameId)}
                      >
                        {isCreatingProducts ? 'Creating...' : `Create ${selectedProductsToCreate.size} Product${selectedProductsToCreate.size !== 1 ? 's' : ''} & Re-process`}
                      </button>
                    </>
                  )}
                </div>
              )}

              {invalidRows.length > 0 && (
                <div className={styles.errorList}>
                  <h4>Rows with Errors (will be skipped)</h4>
                  <p className={styles.errorHint}>
                    These may be header rows, month separators, or rows with missing/invalid data.
                  </p>
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
