'use client'

import { useState } from 'react'
import { Client, Game, Product } from '@/lib/types'
import styles from './ProductManager.module.css'

interface ProductManagerProps {
  clients: Client[]
  games: (Game & { client: Client })[]
  products: (Product & { game: Game & { client: Client } })[]
  onClientCreate: (client: Omit<Client, 'id' | 'created_at'>) => Promise<void>
  onGameCreate: (game: Omit<Game, 'id' | 'created_at'>) => Promise<void>
  onProductCreate: (product: Omit<Product, 'id' | 'created_at'>) => Promise<Product | void>
  onClientDelete?: (id: string) => Promise<void>
  onGameDelete?: (id: string) => Promise<void>
  onProductDelete?: (id: string) => Promise<void>
  onGenerateCalendar?: (productId: string, productName: string) => void
  onClose: () => void
}

type Tab = 'clients' | 'games' | 'products'

export default function ProductManager({
  clients,
  games,
  products,
  onClientCreate,
  onGameCreate,
  onProductCreate,
  onClientDelete,
  onGameDelete,
  onProductDelete,
  onGenerateCalendar,
  onClose
}: ProductManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('clients')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string; name: string } | null>(null)
  
  // Client form
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  
  // Game form
  const [gameName, setGameName] = useState('')
  const [gameClientId, setGameClientId] = useState('')
  const [steamAppId, setSteamAppId] = useState('')
  
  // Product form
  const [productName, setProductName] = useState('')
  const [productGameId, setProductGameId] = useState('')
  const [productType, setProductType] = useState<'base' | 'edition' | 'dlc' | 'soundtrack'>('base')
  const [steamProductId, setSteamProductId] = useState('')
  const [autoGenerateCalendar, setAutoGenerateCalendar] = useState(true) // Default to checked

  const handleCreateClient = async () => {
    if (!clientName.trim()) {
      setError('Client name is required')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      await onClientCreate({
        name: clientName.trim(),
        email: clientEmail.trim() || undefined,
        steam_api_key: undefined
      })
      setClientName('')
      setClientEmail('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGame = async () => {
    if (!gameName.trim() || !gameClientId) {
      setError('Game name and client are required')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      await onGameCreate({
        name: gameName.trim(),
        client_id: gameClientId,
        steam_app_id: steamAppId.trim() || undefined
      })
      setGameName('')
      setSteamAppId('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProduct = async () => {
    if (!productName.trim() || !productGameId) {
      setError('Product name and game are required')
      return
    }
    
    setLoading(true)
    setError(null)
    
    const nameToCreate = productName.trim()
    
    try {
      const createdProduct = await onProductCreate({
        name: nameToCreate,
        game_id: productGameId,
        product_type: productType,
        steam_product_id: steamProductId.trim() || undefined
      })
      
      // If auto-generate is checked and we got a product back, trigger calendar generation
      if (autoGenerateCalendar && createdProduct && onGenerateCalendar) {
        onGenerateCalendar(createdProduct.id, createdProduct.name)
      }
      
      setProductName('')
      setSteamProductId('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    
    setLoading(true)
    setError(null)
    
    try {
      if (deleteConfirm.type === 'client' && onClientDelete) {
        await onClientDelete(deleteConfirm.id)
      } else if (deleteConfirm.type === 'game' && onGameDelete) {
        await onGameDelete(deleteConfirm.id)
      } else if (deleteConfirm.type === 'product' && onProductDelete) {
        await onProductDelete(deleteConfirm.id)
      }
      setDeleteConfirm(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Manage Products</h2>
          <button className={styles.closeBtn} onClick={onClose}>X</button>
        </div>

        {error && (
          <div className={styles.error}>
            {error}
            <button onClick={() => setError(null)}>x</button>
          </div>
        )}

        {deleteConfirm && (
          <div className={styles.confirmDelete}>
            <p>Delete <strong>{deleteConfirm.name}</strong>?</p>
            <p className={styles.warning}>This will also delete all related data (games, products, sales).</p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={handleDelete} disabled={loading}>
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'clients' ? styles.active : ''}`}
            onClick={() => setActiveTab('clients')}
          >
            Clients ({clients.length})
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'games' ? styles.active : ''}`}
            onClick={() => setActiveTab('games')}
          >
            Games ({games.length})
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'products' ? styles.active : ''}`}
            onClick={() => setActiveTab('products')}
          >
            Products ({products.length})
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === 'clients' && (
            <div className={styles.section}>
              <h3>Add New Client</h3>
              <p className={styles.hint}>Clients are the game publishers you work with (e.g., TMG, tobspr)</p>
              
              <div className={styles.form}>
                <div className={styles.field}>
                  <label>Client Name *</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g., tobspr Games"
                  />
                </div>
                <div className={styles.field}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="contact@example.com"
                  />
                </div>
                <button 
                  className={styles.addBtn}
                  onClick={handleCreateClient}
                  disabled={loading}
                >
                  {loading ? 'Adding...' : '+ Add Client'}
                </button>
              </div>

              <div className={styles.list}>
                <h4>Existing Clients</h4>
                {clients.length === 0 ? (
                  <p className={styles.empty}>No clients yet. Add your first client above.</p>
                ) : (
                  <ul>
                    {clients.map(client => (
                      <li key={client.id}>
                        <div className={styles.itemInfo}>
                          <strong>{client.name}</strong>
                          {client.email && <span> - {client.email}</span>}
                        </div>
                        {onClientDelete && (
                          <button 
                            className={styles.deleteBtn}
                            onClick={() => setDeleteConfirm({ type: 'client', id: client.id, name: client.name })}
                            title="Delete client"
                          >
                            🗑️
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'games' && (
            <div className={styles.section}>
              <h3>Add New Game</h3>
              <p className={styles.hint}>Games belong to clients. Add the client first if needed.</p>
              
              {clients.length === 0 ? (
                <div className={styles.warningBox}>
                  Please add a client first before adding games.
                </div>
              ) : (
                <div className={styles.form}>
                  <div className={styles.field}>
                    <label>Client *</label>
                    <select
                      value={gameClientId}
                      onChange={(e) => setGameClientId(e.target.value)}
                    >
                      <option value="">Select client...</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Game Name *</label>
                    <input
                      type="text"
                      value={gameName}
                      onChange={(e) => setGameName(e.target.value)}
                      placeholder="e.g., shapez 2"
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Steam App ID</label>
                    <input
                      type="text"
                      value={steamAppId}
                      onChange={(e) => setSteamAppId(e.target.value)}
                      placeholder="e.g., 1234567"
                    />
                  </div>
                  <button 
                    className={styles.addBtn}
                    onClick={handleCreateGame}
                    disabled={loading}
                  >
                    {loading ? 'Adding...' : '+ Add Game'}
                  </button>
                </div>
              )}

              <div className={styles.list}>
                <h4>Existing Games</h4>
                {games.length === 0 ? (
                  <p className={styles.empty}>No games yet.</p>
                ) : (
                  <ul>
                    {games.map(game => (
                      <li key={game.id}>
                        <div className={styles.itemInfo}>
                          <strong>{game.name}</strong>
                          <span className={styles.meta}> ({game.client?.name})</span>
                          {game.steam_app_id && <span className={styles.meta}> - Steam: {game.steam_app_id}</span>}
                        </div>
                        {onGameDelete && (
                          <button 
                            className={styles.deleteBtn}
                            onClick={() => setDeleteConfirm({ type: 'game', id: game.id, name: game.name })}
                            title="Delete game"
                          >
                            🗑️
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'products' && (
            <div className={styles.section}>
              <h3>Add New Product</h3>
              <p className={styles.hint}>Products are specific SKUs: base game, DLCs, soundtracks, editions.</p>
              
              {games.length === 0 ? (
                <div className={styles.warningBox}>
                  Please add a game first before adding products.
                </div>
              ) : (
                <div className={styles.form}>
                  <div className={styles.field}>
                    <label>Game *</label>
                    <select
                      value={productGameId}
                      onChange={(e) => setProductGameId(e.target.value)}
                    >
                      <option value="">Select game...</option>
                      {games.map(game => (
                        <option key={game.id} value={game.id}>
                          {game.name} ({game.client?.name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Product Name *</label>
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="e.g., shapez 2, shapez 2 Soundtrack"
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Product Type *</label>
                    <select
                      value={productType}
                      onChange={(e) => setProductType(e.target.value as any)}
                    >
                      <option value="base">Base Game</option>
                      <option value="dlc">DLC</option>
                      <option value="edition">Edition/Bundle</option>
                      <option value="soundtrack">Soundtrack</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Steam Product ID</label>
                    <input
                      type="text"
                      value={steamProductId}
                      onChange={(e) => setSteamProductId(e.target.value)}
                      placeholder="e.g., 1234567"
                    />
                  </div>
                  
                  {/* Auto-generate calendar checkbox */}
                  {onGenerateCalendar && (
                    <div className={styles.checkboxField}>
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={autoGenerateCalendar}
                          onChange={(e) => setAutoGenerateCalendar(e.target.checked)}
                        />
                        <span className={styles.checkboxText}>
                          🗓️ Auto-generate sales calendar
                        </span>
                      </label>
                      <p className={styles.checkboxHint}>
                        Automatically create a yearly sales plan across all platforms
                      </p>
                    </div>
                  )}
                  
                  <button 
                    className={styles.addBtn}
                    onClick={handleCreateProduct}
                    disabled={loading}
                  >
                    {loading ? 'Adding...' : '+ Add Product'}
                  </button>
                </div>
              )}

              <div className={styles.list}>
                <h4>Existing Products</h4>
                {products.length === 0 ? (
                  <p className={styles.empty}>No products yet.</p>
                ) : (
                  <ul>
                    {products.map(product => (
                      <li key={product.id}>
                        <div className={styles.itemInfo}>
                          <strong>{product.name}</strong>
                          <span className={styles.badge}>{product.product_type}</span>
                          <span className={styles.meta}> - {product.game?.name} ({product.game?.client?.name})</span>
                        </div>
                        {onProductDelete && (
                          <button 
                            className={styles.deleteBtn}
                            onClick={() => setDeleteConfirm({ type: 'product', id: product.id, name: product.name })}
                            title="Delete product"
                          >
                            🗑️
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.doneBtn} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
