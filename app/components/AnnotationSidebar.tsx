'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import styles from './AnnotationSidebar.module.css'

export interface AnnotationPrefill {
  game_id?: string
  client_id?: string
  event_date?: string
  event_type?: string
  outlet_or_source?: string
  observed_effect?: string
  direction?: string
  confidence?: string
  notes?: string
}

export interface CorrelationCandidate {
  id: string
  game_id: string
  client_id: string
  coverage_item_id?: string
  event_type: string
  event_date: string
  outlet_or_source?: string
  suspected_effect: string
  direction: string
  detection_confidence: number
  status: string
  game?: { name: string }
  client?: { name: string }
  coverage_item?: { title: string; url: string }
}

interface AnnotationSidebarProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
  prefill?: AnnotationPrefill
  candidate?: CorrelationCandidate | null
  editingId?: string | null
}

const EVENT_TYPES = [
  { value: 'pr_mention', label: 'PR Mention' },
  { value: 'influencer_play', label: 'Influencer Play' },
  { value: 'steam_sale', label: 'Steam Sale' },
  { value: 'steam_event', label: 'Steam Event' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'epic_free', label: 'Epic Free' },
  { value: 'press_interview', label: 'Press Interview' },
  { value: 'other', label: 'Other' },
]

const EFFECTS = [
  { value: 'sales_spike', label: 'Sales Spike' },
  { value: 'wishlist_spike', label: 'Wishlist Spike' },
  { value: 'pr_pickup', label: 'PR Pickup' },
  { value: 'none', label: 'No Effect' },
  { value: 'unknown', label: 'Unknown' },
]

export default function AnnotationSidebar({
  isOpen,
  onClose,
  onSaved,
  prefill,
  candidate,
  editingId,
}: AnnotationSidebarProps) {
  const supabase = createClientComponentClient()
  const [saving, setSaving] = useState(false)

  // Form state
  const [gameId, setGameId] = useState('')
  const [clientId, setClientId] = useState('')
  const [eventType, setEventType] = useState('pr_mention')
  const [eventDate, setEventDate] = useState('')
  const [outletOrSource, setOutletOrSource] = useState('')
  const [observedEffect, setObservedEffect] = useState('unknown')
  const [direction, setDirection] = useState('pr_to_sales')
  const [confidence, setConfidence] = useState('suspected')
  const [notes, setNotes] = useState('')

  // Selectors data
  const [games, setGames] = useState<{ id: string; name: string; client_id: string }[]>([])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])

  // Load games/clients
  useEffect(() => {
    const load = async () => {
      const [gRes, cRes] = await Promise.all([
        supabase.from('games').select('id, name, client_id').order('name'),
        supabase.from('clients').select('id, name').order('name'),
      ])
      if (gRes.data) setGames(gRes.data)
      if (cRes.data) setClients(cRes.data)
    }
    if (isOpen) load()
  }, [isOpen, supabase])

  // Populate from prefill or candidate
  useEffect(() => {
    if (!isOpen) return
    if (candidate) {
      setGameId(candidate.game_id || '')
      setClientId(candidate.client_id || '')
      setEventType(candidate.event_type || 'pr_mention')
      setEventDate(candidate.event_date || '')
      setOutletOrSource(candidate.outlet_or_source || '')
      setObservedEffect(candidate.suspected_effect || 'unknown')
      setDirection(candidate.direction || 'pr_to_sales')
      setConfidence('confirmed')
      setNotes('')
    } else if (prefill) {
      setGameId(prefill.game_id || '')
      setClientId(prefill.client_id || '')
      setEventType(prefill.event_type || 'pr_mention')
      setEventDate(prefill.event_date || '')
      setOutletOrSource(prefill.outlet_or_source || '')
      setObservedEffect(prefill.observed_effect || 'unknown')
      setDirection(prefill.direction || 'pr_to_sales')
      setConfidence(prefill.confidence || 'suspected')
      setNotes(prefill.notes || '')
    } else {
      // Reset
      setGameId('')
      setClientId('')
      setEventType('pr_mention')
      setEventDate(new Date().toISOString().split('T')[0])
      setOutletOrSource('')
      setObservedEffect('unknown')
      setDirection('pr_to_sales')
      setConfidence('suspected')
      setNotes('')
    }
  }, [isOpen, prefill, candidate])

  // When game changes, auto-set client
  useEffect(() => {
    if (gameId) {
      const game = games.find(g => g.id === gameId)
      if (game) setClientId(game.client_id)
    }
  }, [gameId, games])

  // Load existing annotation if editing
  useEffect(() => {
    if (!editingId || !isOpen) return
    const load = async () => {
      const { data } = await supabase.from('pr_annotations').select('*').eq('id', editingId).single()
      if (data) {
        setGameId(data.game_id || '')
        setClientId(data.client_id || '')
        setEventType(data.event_type || 'pr_mention')
        setEventDate(data.event_date || '')
        setOutletOrSource(data.outlet_or_source || '')
        setObservedEffect(data.observed_effect || 'unknown')
        setDirection(data.direction || 'pr_to_sales')
        setConfidence(data.confidence || 'suspected')
        setNotes(data.notes || '')
      }
    }
    load()
  }, [editingId, isOpen, supabase])

  const handleSave = useCallback(async () => {
    if (!gameId || !clientId || !eventDate) return
    setSaving(true)
    try {
      const payload = {
        game_id: gameId,
        client_id: clientId,
        event_type: eventType,
        event_date: eventDate,
        outlet_or_source: outletOrSource || null,
        observed_effect: observedEffect,
        direction,
        confidence,
        notes: notes || null,
        is_auto_detected: false,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        await fetch('/api/pr-annotations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        })
      } else {
        await fetch('/api/pr-annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      onSaved?.()
      onClose()
    } catch (err) {
      console.error('Save annotation failed:', err)
    } finally {
      setSaving(false)
    }
  }, [gameId, clientId, eventType, eventDate, outletOrSource, observedEffect, direction, confidence, notes, editingId, onSaved, onClose])

  const handleCandidateAction = useCallback(async (action: 'approved' | 'rejected' | 'inconclusive') => {
    if (!candidate) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { id: candidate.id, status: action }
      if (action === 'approved') {
        // Include the form values so the API can create the annotation with user's edits
        payload.annotation_data = {
          game_id: gameId,
          client_id: clientId,
          event_type: eventType,
          event_date: eventDate,
          outlet_or_source: outletOrSource || null,
          observed_effect: observedEffect,
          direction,
          confidence,
          notes: notes || null,
        }
      }
      await fetch('/api/correlation-candidates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      onSaved?.()
      onClose()
    } catch (err) {
      console.error('Candidate action failed:', err)
    } finally {
      setSaving(false)
    }
  }, [candidate, gameId, clientId, eventType, eventDate, outletOrSource, observedEffect, direction, confidence, notes, onSaved, onClose])

  if (!isOpen) return null

  const isReviewMode = !!candidate
  const filteredGames = clientId ? games.filter(g => g.client_id === clientId) : games

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.sidebar}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            {isReviewMode ? 'Review Correlation' : editingId ? 'Edit Annotation' : 'Log PR Insight'}
          </h3>
          <button className={styles.closeButton} onClick={onClose}>&times;</button>
        </div>

        <div className={styles.body}>
          {isReviewMode && candidate && (
            <div className={styles.detectionBadge}>
              🤖 Auto-detected &middot; {Math.round(candidate.detection_confidence * 100)}% confidence
            </div>
          )}

          {/* Client */}
          <div className={styles.field}>
            <label className={styles.label}>Client</label>
            <select className={styles.select} value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Game */}
          <div className={styles.field}>
            <label className={styles.label}>Game</label>
            <select className={styles.select} value={gameId} onChange={e => setGameId(e.target.value)}>
              <option value="">Select game...</option>
              {filteredGames.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          {/* Event Type */}
          <div className={styles.field}>
            <label className={styles.label}>Event Type</label>
            <select className={styles.select} value={eventType} onChange={e => setEventType(e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Event Date */}
          <div className={styles.field}>
            <label className={styles.label}>Event Date</label>
            <input type="date" className={styles.input} value={eventDate} onChange={e => setEventDate(e.target.value)} />
          </div>

          {/* Outlet / Source */}
          <div className={styles.field}>
            <label className={styles.label}>Outlet / Source</label>
            <input
              type="text"
              className={styles.input}
              value={outletOrSource}
              onChange={e => setOutletOrSource(e.target.value)}
              placeholder='e.g. "IGN", "Steam Puzzle Fest"'
            />
          </div>

          {/* Observed Effect */}
          <div className={styles.field}>
            <label className={styles.label}>Observed Effect</label>
            <select className={styles.select} value={observedEffect} onChange={e => setObservedEffect(e.target.value)}>
              {EFFECTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>

          {/* Direction */}
          <div className={styles.field}>
            <label className={styles.label}>Direction</label>
            <div className={styles.directionToggle}>
              <button
                className={direction === 'pr_to_sales' ? styles.directionOptionActive : styles.directionOption}
                onClick={() => setDirection('pr_to_sales')}
                type="button"
              >
                PR → Sales
              </button>
              <button
                className={direction === 'sales_to_pr' ? styles.directionOptionActive : styles.directionOption}
                onClick={() => setDirection('sales_to_pr')}
                type="button"
              >
                Sales → PR
              </button>
            </div>
          </div>

          {/* Confidence */}
          <div className={styles.field}>
            <label className={styles.label}>Confidence</label>
            <div className={styles.confidenceGroup}>
              <button
                className={confidence === 'confirmed' ? styles.confidencePillConfirmed : styles.confidencePill}
                onClick={() => setConfidence('confirmed')}
                type="button"
              >
                Confirmed
              </button>
              <button
                className={confidence === 'suspected' ? styles.confidencePillSuspected : styles.confidencePill}
                onClick={() => setConfidence('suspected')}
                type="button"
              >
                Suspected
              </button>
              <button
                className={confidence === 'ruled_out' ? styles.confidencePillRuled : styles.confidencePill}
                onClick={() => setConfidence('ruled_out')}
                type="button"
              >
                Ruled Out
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className={styles.field}>
            <label className={styles.label}>Notes</label>
            <textarea
              className={styles.textarea}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional context about this correlation..."
            />
          </div>
        </div>

        <div className={styles.footer}>
          {isReviewMode ? (
            <>
              <button className={styles.approveButton} onClick={() => handleCandidateAction('approved')} disabled={saving}>
                {saving ? 'Saving...' : 'Approve'}
              </button>
              <button className={styles.rejectButton} onClick={() => handleCandidateAction('rejected')} disabled={saving}>
                Reject
              </button>
              <button className={styles.inconclusiveButton} onClick={() => handleCandidateAction('inconclusive')} disabled={saving}>
                Inconclusive
              </button>
            </>
          ) : (
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={saving || !gameId || !clientId || !eventDate}
            >
              {saving ? 'Saving...' : editingId ? 'Update Annotation' : 'Save Annotation'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
