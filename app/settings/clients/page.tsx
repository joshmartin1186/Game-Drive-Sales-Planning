'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useAuth } from '@/lib/auth-context'
import styles from './page.module.css'

interface Platform {
  id: string
  name: string
  color_hex: string
}

interface ProductPlatform {
  platform_id: string
  platform?: Platform
}

interface Product {
  id: string
  name: string
  product_type: string
  steam_product_id?: string
  launch_date?: string | null
  product_aliases?: string[]
  product_platforms?: ProductPlatform[]
}

interface Game {
  id: string
  name: string
  steam_app_id?: string
  pr_tracking_enabled: boolean
  products?: Product[]
}

interface Client {
  id: string
  name: string
  email: string | null
  steam_api_key: string | null
  created_at: string
  games?: Game[]
}

export default function SettingsClientsPage() {
  const supabase = createClientComponentClient()
  const { hasAccess, loading: authLoading } = useAuth()
  const canView = hasAccess('client_management', 'view')
  const canEdit = hasAccess('client_management', 'edit')
  const [clients, setClients] = useState<Client[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', email: '' })
  const [addError, setAddError] = useState<string | null>(null)
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchClients()
    fetchPlatforms()
  }, [])

  const fetchPlatforms = async () => {
    const { data } = await supabase.from('platforms').select('id, name, color_hex').order('name')
    if (data) setPlatforms(data)
  }

  const fetchClients = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select(`
        *,
        games(
          *,
          products(
            *,
            product_platforms(platform_id, platform:platforms(id, name, color_hex))
          )
        )
      `)
      .order('name')

    if (!error && data) {
      setClients(data)
    }
    setIsLoading(false)
  }

  const handleAddClient = async () => {
    if (!newClient.name.trim()) return
    setAddError(null)

    const { error } = await supabase
      .from('clients')
      .insert({ name: newClient.name, email: newClient.email || null })

    if (error) {
      console.error('Error adding client:', error)
      if (error.message.includes('row-level security')) {
        setAddError('Permission denied. Please contact an admin to add clients.')
      } else {
        setAddError(error.message || 'Failed to add client')
      }
      return
    }

    setNewClient({ name: '', email: '' })
    setShowAddModal(false)
    fetchClients()
  }

  const handleDeleteClient = async (id: string) => {
    if (!confirm('Are you sure you want to delete this client? This will also delete all associated games and products.')) return

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)

    if (!error) {
      fetchClients()
    }
  }

  const handleTogglePR = async (gameId: string, currentValue: boolean) => {
    const { error } = await supabase
      .from('games')
      .update({ pr_tracking_enabled: !currentValue })
      .eq('id', gameId)

    if (!error) {
      setClients(prev => prev.map(c => ({
        ...c,
        games: c.games?.map(g =>
          g.id === gameId ? { ...g, pr_tracking_enabled: !currentValue } : g
        )
      })))
    }
  }

  const toggleExpanded = (clientId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  const totalProducts = (client: Client) =>
    client.games?.reduce((sum, g) => sum + (g.products?.length || 0), 0) || 0

  const totalGames = (client: Client) => client.games?.length || 0

  if (authLoading || isLoading) {
    return <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Loading...</div>
  }

  if (!canView) {
    return (
      <div style={{ textAlign: 'center', padding: '60px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937' }}>Access Denied</h2>
        <p style={{ color: '#6b7280' }}>You don&apos;t have permission to view Client Management.</p>
      </div>
    )
  }

  return (
    <>
      <div className={styles.container}>
        <div className={styles.topBar}>
          {canEdit && (
            <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
              + Add Client
            </button>
          )}
        </div>

        {clients.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="40" height="40" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3>No Clients Yet</h3>
            <p>Add your first game publisher client to get started.</p>
            <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>Add Your First Client</button>
          </div>
        ) : (
          <div className={styles.clientList}>
            {clients.map(client => {
              const isExpanded = expandedClients.has(client.id)
              return (
                <div key={client.id} className={styles.clientCard}>
                  <div className={styles.cardHeader} onClick={() => toggleExpanded(client.id)}>
                    <div className={styles.cardTitle}>
                      <span className={styles.expandIcon}>{isExpanded ? '▾' : '▸'}</span>
                      <h3>{client.name}</h3>
                      {client.email && <span className={styles.email}>{client.email}</span>}
                    </div>
                    <div className={styles.cardMeta}>
                      <span className={styles.countBadge}>{totalGames(client)} game{totalGames(client) !== 1 ? 's' : ''}</span>
                      <span className={styles.countBadge}>{totalProducts(client)} product{totalProducts(client) !== 1 ? 's' : ''}</span>
                      <span className={client.steam_api_key ? styles.statusGreen : styles.statusYellow}>
                        {client.steam_api_key ? '✓ API Key' : '⚠ No API Key'}
                      </span>
                      {canEdit && (
                        <button
                          className={styles.deleteBtn}
                          onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id) }}
                          title="Delete client"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles.cardBody}>
                      {(!client.games || client.games.length === 0) ? (
                        <p className={styles.noItems}>No games added yet. Use Manage Products on the main page to add games.</p>
                      ) : (
                        client.games.map(game => (
                          <div key={game.id} className={styles.gameSection}>
                            <div className={styles.gameHeader}>
                              <strong>{game.name}</strong>
                              {game.steam_app_id && <span className={styles.steamId}>Steam: {game.steam_app_id}</span>}
                              {canEdit && (
                                <label className={styles.prToggle} onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={game.pr_tracking_enabled}
                                    onChange={() => handleTogglePR(game.id, game.pr_tracking_enabled)}
                                  />
                                  <span>PR Tracking</span>
                                </label>
                              )}
                              {!canEdit && game.pr_tracking_enabled && (
                                <span className={styles.prBadge}>PR Tracking</span>
                              )}
                            </div>

                            {game.products && game.products.length > 0 ? (
                              <div className={styles.productList}>
                                {game.products.map(product => (
                                  <div key={product.id} className={styles.productRow}>
                                    <span className={styles.productName}>{product.name}</span>
                                    <span className={styles.typeBadge}>{product.product_type}</span>
                                    {product.product_aliases && product.product_aliases.length > 0 && (
                                      <span className={styles.aliasesBadge} title={product.product_aliases.join(', ')}>
                                        aka {product.product_aliases[0]}{product.product_aliases.length > 1 ? ` +${product.product_aliases.length - 1}` : ''}
                                      </span>
                                    )}
                                    <div className={styles.platformDots}>
                                      {product.product_platforms?.map(pp => (
                                        <span
                                          key={pp.platform_id}
                                          className={styles.platformDot}
                                          style={{ backgroundColor: pp.platform?.color_hex || '#94a3b8' }}
                                          title={pp.platform?.name || 'Unknown'}
                                        />
                                      ))}
                                      {(!product.product_platforms || product.product_platforms.length === 0) && (
                                        <span className={styles.noPlatforms}>No platforms</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className={styles.noItems}>No products yet</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>Add New Client</h2>
            <div className={styles.formField}>
              <label>Client Name *</label>
              <input
                type="text"
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                placeholder="e.g., tobspr Games"
              />
            </div>
            <div className={styles.formField}>
              <label>Email (optional)</label>
              <input
                type="email"
                value={newClient.email}
                onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                placeholder="contact@example.com"
              />
            </div>
            {addError && <div className={styles.errorBanner}>{addError}</div>}
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => { setShowAddModal(false); setAddError(null) }}>Cancel</button>
              <button className={styles.addBtn} onClick={handleAddClient} disabled={!newClient.name.trim()}>Add Client</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
