'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { SaleWithDetails, Platform } from '@/lib/types'
import styles from './VersionManager.module.css'

// Client-side cache for versions to avoid re-fetching
const versionCache = new Map<string, { versions: CalendarVersion[], timestamp: number }>()
const CACHE_TTL = 60000 // 1 minute cache

interface CalendarVersion {
  id: string
  name: string
  description: string | null
  sales_snapshot: SaleSnapshot[]
  product_count: number
  sale_count: number
  platform_summary: Record<string, number>
  date_range_start: string | null
  date_range_end: string | null
  client_id: string | null
  is_committed: boolean
  committed_at: string | null
  created_at: string
  updated_at: string
}

interface SaleSnapshot {
  product_id: string
  platform_id: string
  start_date: string
  end_date: string
  discount_percentage: number | null
  sale_name: string | null
  sale_type: string
  status: string
  notes: string | null
  // Denormalized for display
  product_name?: string
  platform_name?: string
}

interface VersionManagerProps {
  isOpen: boolean
  onClose: () => void
  currentSales: SaleWithDetails[]
  platforms: Platform[]
  onRestoreVersion: (sales: SaleSnapshot[]) => Promise<void>
  clientId?: string | null
}

export default function VersionManager({
  isOpen,
  onClose,
  currentSales,
  platforms,
  onRestoreVersion,
  clientId
}: VersionManagerProps) {
  const supabase = createClientComponentClient()
  const [versions, setVersions] = useState<CalendarVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Save form state
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDescription, setSaveDescription] = useState('')

  // Preview state
  const [previewVersion, setPreviewVersion] = useState<CalendarVersion | null>(null)

  // Confirm restore state
  const [confirmRestore, setConfirmRestore] = useState<CalendarVersion | null>(null)

  // Commit state
  const [committing, setCommitting] = useState(false)

  // Track if initial load is done (for skeleton vs spinner)
  const hasLoadedOnce = useRef(false)

  // Cache key based on client filter
  const cacheKey = useMemo(() => `versions-${clientId || 'all'}`, [clientId])

  // Fetch versions with caching
  const fetchVersions = useCallback(async (forceRefresh = false) => {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = versionCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setVersions(cached.versions)
        setLoading(false)
        hasLoadedOnce.current = true
        return
      }
    }

    // Only show loading spinner on first load, not refreshes
    if (!hasLoadedOnce.current) {
      setLoading(true)
    }

    try {
      let query = supabase
        .from('calendar_versions')
        .select('*')
        .order('is_committed', { ascending: false })
        .order('created_at', { ascending: false })

      if (clientId) {
        query = query.or(`client_id.eq.${clientId},client_id.is.null`)
      }

      const { data, error } = await query

      if (error) throw error

      const versionsData = data || []
      setVersions(versionsData)

      // Update cache
      versionCache.set(cacheKey, { versions: versionsData, timestamp: Date.now() })
      hasLoadedOnce.current = true
    } catch (err) {
      console.error('Error fetching versions:', err)
      setError(err instanceof Error ? err.message : 'Failed to load versions')
    } finally {
      setLoading(false)
    }
  }, [clientId, cacheKey, supabase])

  useEffect(() => {
    if (isOpen) {
      fetchVersions()
    }
  }, [isOpen, fetchVersions])

  // Save current state as version (with optimistic update)
  const handleSaveVersion = async () => {
    if (!saveName.trim()) {
      setError('Please enter a version name')
      return
    }

    setSaving(true)
    setError(null)

    // Create snapshot from current sales
    const snapshot: SaleSnapshot[] = currentSales.map(sale => ({
      product_id: sale.product_id,
      platform_id: sale.platform_id,
      start_date: sale.start_date,
      end_date: sale.end_date,
      discount_percentage: sale.discount_percentage || null,
      sale_name: sale.sale_name || null,
      sale_type: sale.sale_type,
      status: sale.status,
      notes: sale.notes || null,
      product_name: sale.product?.name,
      platform_name: sale.platform?.name
    }))

    // Calculate metadata
    const productIds = new Set(currentSales.map(s => s.product_id))
    const platformSummary: Record<string, number> = {}
    currentSales.forEach(sale => {
      const platformName = sale.platform?.name || 'Unknown'
      platformSummary[platformName] = (platformSummary[platformName] || 0) + 1
    })

    const dates = currentSales.map(s => s.start_date).concat(currentSales.map(s => s.end_date))
    const sortedDates = dates.sort()

    // Create optimistic version (with temp ID)
    const tempId = `temp-${Date.now()}`
    const optimisticVersion: CalendarVersion = {
      id: tempId,
      name: saveName.trim(),
      description: saveDescription.trim() || null,
      sales_snapshot: snapshot,
      product_count: productIds.size,
      sale_count: currentSales.length,
      platform_summary: platformSummary,
      date_range_start: sortedDates[0] || null,
      date_range_end: sortedDates[sortedDates.length - 1] || null,
      client_id: clientId || null,
      is_committed: false,
      committed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Optimistically add to UI immediately
    setVersions(prev => [optimisticVersion, ...prev])
    setSaveName('')
    setSaveDescription('')
    setShowSaveForm(false)

    try {
      const { data, error } = await supabase
        .from('calendar_versions')
        .insert({
          name: optimisticVersion.name,
          description: optimisticVersion.description,
          sales_snapshot: snapshot,
          product_count: optimisticVersion.product_count,
          sale_count: optimisticVersion.sale_count,
          platform_summary: platformSummary,
          date_range_start: optimisticVersion.date_range_start,
          date_range_end: optimisticVersion.date_range_end,
          client_id: optimisticVersion.client_id
        })
        .select()
        .single()

      if (error) throw error

      // Replace temp version with real one
      setVersions(prev => prev.map(v => v.id === tempId ? data : v))

      // Invalidate cache so next open gets fresh data
      versionCache.delete(cacheKey)

    } catch (err) {
      console.error('Error saving version:', err)
      // Remove optimistic version on error
      setVersions(prev => prev.filter(v => v.id !== tempId))
      setError(err instanceof Error ? err.message : 'Failed to save version')
    } finally {
      setSaving(false)
    }
  }

  // Delete a version (with optimistic update)
  const handleDeleteVersion = async (versionId: string) => {
    const version = versions.find(v => v.id === versionId)
    if (version?.is_committed) {
      setError('Cannot delete a committed version. Uncommit it first.')
      return
    }
    if (!confirm('Are you sure you want to delete this version? This cannot be undone.')) {
      return
    }

    // Store for rollback
    const previousVersions = versions

    // Optimistically remove immediately
    setVersions(prev => prev.filter(v => v.id !== versionId))
    if (previewVersion?.id === versionId) {
      setPreviewVersion(null)
    }

    try {
      const { error } = await supabase
        .from('calendar_versions')
        .delete()
        .eq('id', versionId)

      if (error) throw error

      // Invalidate cache
      versionCache.delete(cacheKey)
    } catch (err) {
      console.error('Error deleting version:', err)
      // Rollback on error
      setVersions(previousVersions)
      setError(err instanceof Error ? err.message : 'Failed to delete version')
    }
  }

  // Commit a version (with optimistic update)
  const handleCommitVersion = async (version: CalendarVersion) => {
    const targetClientId = version.client_id || clientId
    if (!targetClientId) {
      setError('Cannot commit a version without a client. Please filter by client first.')
      return
    }

    setCommitting(true)
    setError(null)

    // Store for rollback
    const previousVersions = versions
    const committedAt = new Date().toISOString()

    // Optimistically update UI
    setVersions(prev => prev.map(v => {
      if (v.id === version.id) {
        return { ...v, is_committed: true, committed_at: committedAt, client_id: targetClientId }
      }
      // Uncommit others for this client
      if (v.client_id === targetClientId && v.is_committed) {
        return { ...v, is_committed: false, committed_at: null }
      }
      return v
    }))

    try {
      // Uncommit any currently committed version for this client
      const { error: uncommitError } = await supabase
        .from('calendar_versions')
        .update({ is_committed: false, committed_at: null })
        .eq('client_id', targetClientId)
        .eq('is_committed', true)

      if (uncommitError) throw uncommitError

      // Commit the selected version
      const { error: commitError } = await supabase
        .from('calendar_versions')
        .update({
          is_committed: true,
          committed_at: committedAt,
          client_id: targetClientId
        })
        .eq('id', version.id)

      if (commitError) throw commitError

      // Invalidate cache
      versionCache.delete(cacheKey)
    } catch (err) {
      console.error('Error committing version:', err)
      // Rollback on error
      setVersions(previousVersions)
      setError(err instanceof Error ? err.message : 'Failed to commit version')
    } finally {
      setCommitting(false)
    }
  }

  // Uncommit a version (with optimistic update)
  const handleUncommitVersion = async (version: CalendarVersion) => {
    setCommitting(true)
    setError(null)

    // Store for rollback
    const previousVersions = versions

    // Optimistically update UI
    setVersions(prev => prev.map(v =>
      v.id === version.id ? { ...v, is_committed: false, committed_at: null } : v
    ))

    try {
      const { error } = await supabase
        .from('calendar_versions')
        .update({ is_committed: false, committed_at: null })
        .eq('id', version.id)

      if (error) throw error

      // Invalidate cache
      versionCache.delete(cacheKey)
    } catch (err) {
      console.error('Error uncommitting version:', err)
      // Rollback on error
      setVersions(previousVersions)
      setError(err instanceof Error ? err.message : 'Failed to uncommit version')
    } finally {
      setCommitting(false)
    }
  }

  // Restore a version
  const handleRestoreVersion = async (version: CalendarVersion) => {
    setRestoring(true)
    setError(null)
    
    try {
      await onRestoreVersion(version.sales_snapshot)
      setConfirmRestore(null)
      onClose()
    } catch (err) {
      console.error('Error restoring version:', err)
      setError(err instanceof Error ? err.message : 'Failed to restore version')
    } finally {
      setRestoring(false)
    }
  }

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy h:mm a')
    } catch {
      return dateStr
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>📚 Calendar Versions</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          {error && (
            <div className={styles.error}>
              {error}
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* Save new version section */}
          <div className={styles.saveSection}>
            {!showSaveForm ? (
              <button 
                className={styles.saveBtn}
                onClick={() => setShowSaveForm(true)}
              >
                💾 Save Current Calendar as Version
              </button>
            ) : (
              <div className={styles.saveForm}>
                <h3>Save New Version</h3>
                <div className={styles.formGroup}>
                  <label>Version Name *</label>
                  <input
                    type="text"
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    placeholder="e.g., Q1 2026 Draft, Pre-Summer Sale Plan"
                    autoFocus
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Description (optional)</label>
                  <textarea
                    value={saveDescription}
                    onChange={e => setSaveDescription(e.target.value)}
                    placeholder="Notes about this version..."
                    rows={2}
                  />
                </div>
                <div className={styles.currentStats}>
                  <span>📊 {currentSales.length} sales</span>
                  <span>🎮 {new Set(currentSales.map(s => s.product_id)).size} products</span>
                </div>
                <div className={styles.formActions}>
                  <button 
                    className={styles.cancelBtn}
                    onClick={() => {
                      setShowSaveForm(false)
                      setSaveName('')
                      setSaveDescription('')
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    className={styles.confirmBtn}
                    onClick={handleSaveVersion}
                    disabled={saving || !saveName.trim()}
                  >
                    {saving ? 'Saving...' : 'Save Version'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Versions list */}
          <div className={styles.versionsList}>
            <h3>Saved Versions ({versions.length})</h3>
            
            {loading && !hasLoadedOnce.current ? (
              // Skeleton loading on first load
              <div className={styles.skeletonGrid}>
                {[1, 2, 3].map(i => (
                  <div key={i} className={styles.skeletonCard}>
                    <div className={styles.skeletonHeader}>
                      <div className={styles.skeletonTitle} />
                      <div className={styles.skeletonDate} />
                    </div>
                    <div className={styles.skeletonStats}>
                      <div className={styles.skeletonStat} />
                      <div className={styles.skeletonStat} />
                    </div>
                    <div className={styles.skeletonBadges}>
                      <div className={styles.skeletonBadge} />
                      <div className={styles.skeletonBadge} />
                      <div className={styles.skeletonBadge} />
                    </div>
                    <div className={styles.skeletonActions}>
                      <div className={styles.skeletonButton} />
                      <div className={styles.skeletonButton} />
                      <div className={styles.skeletonButton} />
                    </div>
                  </div>
                ))}
              </div>
            ) : versions.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No saved versions yet.</p>
                <p className={styles.hint}>Save your current calendar to create a snapshot you can restore later.</p>
              </div>
            ) : (
              <div className={styles.versionsGrid}>
                {versions.map(version => (
                  <div 
                    key={version.id} 
                    className={`${styles.versionCard} ${previewVersion?.id === version.id ? styles.selected : ''} ${version.is_committed ? styles.committedCard : ''}`}
                  >
                    <div className={styles.versionHeader}>
                      <div>
                        <h4>
                          {version.is_committed && <span className={styles.committedBadge}>Committed</span>}
                          {version.name}
                        </h4>
                      </div>
                      <span className={styles.versionDate}>
                        {formatDate(version.created_at)}
                      </span>
                    </div>
                    
                    {version.description && (
                      <p className={styles.versionDescription}>{version.description}</p>
                    )}
                    
                    <div className={styles.versionStats}>
                      <span>📊 {version.sale_count} sales</span>
                      <span>🎮 {version.product_count} products</span>
                    </div>
                    
                    {version.platform_summary && Object.keys(version.platform_summary).length > 0 && (
                      <div className={styles.platformBreakdown}>
                        {Object.entries(version.platform_summary).map(([platform, count]) => {
                          const platformObj = platforms.find(p => p.name === platform)
                          return (
                            <span 
                              key={platform}
                              className={styles.platformBadge}
                              style={{ 
                                backgroundColor: platformObj?.color_hex || '#666',
                                color: 'white'
                              }}
                            >
                              {platform}: {count}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    
                    {version.date_range_start && version.date_range_end && (
                      <div className={styles.dateRange}>
                        📅 {format(parseISO(version.date_range_start), 'MMM yyyy')} - {format(parseISO(version.date_range_end), 'MMM yyyy')}
                      </div>
                    )}
                    
                    <div className={styles.versionActions}>
                      <button
                        className={version.is_committed ? styles.uncommitBtn : styles.commitBtn}
                        onClick={() => version.is_committed
                          ? handleUncommitVersion(version)
                          : handleCommitVersion(version)}
                        disabled={committing}
                      >
                        {version.is_committed ? '✅ Committed' : '📌 Commit'}
                      </button>
                      <button
                        className={styles.previewBtn}
                        onClick={() => setPreviewVersion(previewVersion?.id === version.id ? null : version)}
                      >
                        {previewVersion?.id === version.id ? 'Hide Preview' : 'Preview'}
                      </button>
                      <button
                        className={styles.restoreBtn}
                        onClick={() => setConfirmRestore(version)}
                      >
                        Restore
                      </button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteVersion(version.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview panel */}
          {previewVersion && (
            <div className={styles.previewPanel}>
              <h3>Preview: {previewVersion.name}</h3>
              <div className={styles.previewTable}>
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Platform</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Discount</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewVersion.sales_snapshot.slice(0, 20).map((sale, idx) => (
                      <tr key={idx}>
                        <td>{sale.product_name || sale.product_id.slice(0, 8)}</td>
                        <td>
                          <span 
                            className={styles.platformDot}
                            style={{ 
                              backgroundColor: platforms.find(p => p.id === sale.platform_id)?.color_hex || '#666'
                            }}
                          />
                          {sale.platform_name || 'Unknown'}
                        </td>
                        <td>{format(parseISO(sale.start_date), 'MMM d, yyyy')}</td>
                        <td>{format(parseISO(sale.end_date), 'MMM d, yyyy')}</td>
                        <td>{sale.discount_percentage ? `${sale.discount_percentage}%` : '-'}</td>
                        <td>{sale.sale_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewVersion.sales_snapshot.length > 20 && (
                  <div className={styles.moreRows}>
                    ...and {previewVersion.sales_snapshot.length - 20} more sales
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Confirm restore modal */}
        {confirmRestore && (
          <div className={styles.confirmOverlay}>
            <div className={styles.confirmModal}>
              <h3>⚠️ Restore Version?</h3>
              <p>
                This will <strong>replace all current sales</strong> with the sales from 
                &quot;{confirmRestore.name}&quot; ({confirmRestore.sale_count} sales).
              </p>
              <p className={styles.warning}>
                Your current calendar will be lost unless you save it as a version first.
              </p>
              <div className={styles.confirmActions}>
                <button 
                  className={styles.cancelBtn}
                  onClick={() => setConfirmRestore(null)}
                  disabled={restoring}
                >
                  Cancel
                </button>
                <button 
                  className={styles.dangerBtn}
                  onClick={() => handleRestoreVersion(confirmRestore)}
                  disabled={restoring}
                >
                  {restoring ? 'Restoring...' : 'Yes, Restore This Version'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
