'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import styles from '../settings.module.css';
import pmStyles from './product-matching.module.css';

interface MappingItem {
  id: string;
  client_id: string;
  product_id: string | null;
  game_id: string | null;
  platform: string;
  external_product_name: string;
  steam_package_id: string | null;
  steam_app_id: string | null;
  playstation_sku: string | null;
  match_type: string;
  confidence_score: number | null;
  status: string;
  confirmed_at: string | null;
  created_at: string;
  products: { id: string; name: string; product_type: string; steam_product_id: string | null; game_id: string } | null;
  games: { id: string; name: string; steam_app_id: string | null } | null;
  occurrence_count: number;
  match_candidates: CandidateProduct[];
}

interface CandidateProduct {
  product_id: string;
  product_name: string;
  game_id: string;
  game_name: string;
  steam_product_id: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface GameOption {
  id: string;
  name: string;
  client_id: string;
}

interface PlatformOption {
  id: string;
  name: string;
}

interface Summary {
  total_confirmed: number;
  total_pending: number;
  total_ignored: number;
}

export default function ProductMatchingPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [platformFilter, setPlatformFilter] = useState<string>('');
  const [mappings, setMappings] = useState<MappingItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_confirmed: 0, total_pending: 0, total_ignored: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({});

  // Create modal state
  const [createModal, setCreateModal] = useState<MappingItem | null>(null);
  const [createForm, setCreateForm] = useState({
    game_id: '',
    new_game_name: '',
    product_name: '',
    product_type: 'base' as string,
    platform_ids: [] as string[],
  });
  const [clientGames, setClientGames] = useState<GameOption[]>([]);
  const [platforms, setPlatforms] = useState<PlatformOption[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load clients
  useEffect(() => {
    async function loadClients() {
      const { data } = await supabase.from('clients').select('id, name').order('name');
      if (data) {
        setClients(data);
        if (data.length > 0 && !selectedClient) {
          setSelectedClient(data[0].id);
        }
      }
    }
    loadClients();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load platforms once
  useEffect(() => {
    async function loadPlatforms() {
      const { data } = await supabase.from('platforms').select('id, name').eq('is_active', true).order('name');
      if (data) setPlatforms(data);
    }
    loadPlatforms();
  }, []);

  // Fetch mappings
  const fetchMappings = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        client_id: selectedClient,
        status: statusFilter,
      });
      if (platformFilter) params.set('platform', platformFilter);

      const res = await fetch(`/api/product-matching?${params}`);
      const data = await res.json();

      if (data.mappings) setMappings(data.mappings);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      console.error('Failed to fetch mappings:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedClient, statusFilter, platformFilter]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  // Load games for selected client (for create modal)
  useEffect(() => {
    async function loadGames() {
      if (!selectedClient) return;
      const { data } = await supabase
        .from('games')
        .select('id, name, client_id')
        .eq('client_id', selectedClient)
        .order('name');
      if (data) setClientGames(data);
    }
    loadGames();
  }, [selectedClient]);

  // Confirm match
  async function handleConfirm(mapping: MappingItem) {
    const selectedProductId = selectedCandidates[mapping.id];
    if (!selectedProductId) return;

    setActionLoading(mapping.id);
    try {
      const res = await fetch('/api/product-matching/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mapping_id: mapping.id,
          product_id: selectedProductId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchMappings();
      }
    } catch (err) {
      console.error('Failed to confirm:', err);
    } finally {
      setActionLoading(null);
    }
  }

  // Ignore mapping
  async function handleIgnore(mapping: MappingItem) {
    setActionLoading(mapping.id);
    try {
      const res = await fetch('/api/product-matching/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping_id: mapping.id }),
      });
      const data = await res.json();
      if (data.success) {
        fetchMappings();
      }
    } catch (err) {
      console.error('Failed to ignore:', err);
    } finally {
      setActionLoading(null);
    }
  }

  // Open create modal
  function openCreateModal(mapping: MappingItem) {
    setCreateModal(mapping);
    setCreateForm({
      game_id: '',
      new_game_name: '',
      product_name: mapping.external_product_name,
      product_type: 'base',
      platform_ids: [],
    });
  }

  // Handle create product
  async function handleCreate() {
    if (!createModal || !selectedClient) return;

    setActionLoading(createModal.id);
    try {
      const res = await fetch('/api/product-matching/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mapping_id: createModal.id,
          client_id: selectedClient,
          game_id: createForm.game_id || undefined,
          game_name: createForm.game_id ? undefined : createForm.new_game_name,
          product_name: createForm.product_name,
          product_type: createForm.product_type,
          steam_app_id: createModal.steam_app_id,
          steam_product_id: createModal.steam_package_id,
          platform_ids: createForm.platform_ids,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreateModal(null);
        fetchMappings();
        // Reload games since we may have created one
        const { data: gamesData } = await supabase
          .from('games')
          .select('id, name, client_id')
          .eq('client_id', selectedClient)
          .order('name');
        if (gamesData) setClientGames(gamesData);
      }
    } catch (err) {
      console.error('Failed to create:', err);
    } finally {
      setActionLoading(null);
    }
  }

  // Backfill
  async function handleBackfill() {
    if (!selectedClient) return;
    setActionLoading('backfill');
    try {
      const res = await fetch('/api/product-matching/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: selectedClient }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Backfill complete: ${data.updated_metrics || 0} metrics + ${data.updated_steam_sales || 0} Steam sales rows updated.`);
      }
    } catch (err) {
      console.error('Backfill failed:', err);
    } finally {
      setActionLoading(null);
    }
  }

  function getConfidenceClass(score: number): string {
    if (score >= 0.85) return pmStyles.high;
    if (score >= 0.7) return pmStyles.medium;
    return pmStyles.low;
  }

  function getMatchTypeBadgeClass(type: string): string {
    switch (type) {
      case 'auto_id': return pmStyles.autoId;
      case 'auto_name':
      case 'auto_alias': return pmStyles.autoName;
      case 'manual': return pmStyles.manual;
      case 'create_new': return pmStyles.createNew;
      default: return '';
    }
  }

  const pendingMappings = mappings.filter(m => m.status === 'pending');
  const confirmedMappings = mappings.filter(m => m.status === 'confirmed');

  return (
    <>
      {/* Filter bar */}
      <div className={pmStyles.filterBar}>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
        >
          <option value="">Select client...</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
        >
          <option value="">All Platforms</option>
          <option value="steam">Steam</option>
          <option value="playstation">PlayStation</option>
        </select>
      </div>

      {/* Summary cards */}
      {selectedClient && (
        <div className={pmStyles.summaryCards}>
          <div className={`${pmStyles.summaryCard} ${summary.total_pending > 0 ? pmStyles.pending : ''}`}>
            <p className={pmStyles.summaryNumber}>{summary.total_pending}</p>
            <p className={pmStyles.summaryLabel}>Pending</p>
          </div>
          <div className={pmStyles.summaryCard}>
            <p className={pmStyles.summaryNumber}>{summary.total_confirmed}</p>
            <p className={pmStyles.summaryLabel}>Confirmed</p>
          </div>
          <div className={pmStyles.summaryCard}>
            <p className={pmStyles.summaryNumber}>{summary.total_ignored}</p>
            <p className={pmStyles.summaryLabel}>Ignored</p>
          </div>
          <div className={pmStyles.summaryCard}>
            <button
              className={pmStyles.backfillBtn}
              onClick={handleBackfill}
              disabled={actionLoading === 'backfill' || summary.total_confirmed === 0}
            >
              {actionLoading === 'backfill' ? 'Running...' : 'Run Backfill'}
            </button>
            <p className={pmStyles.summaryLabel}>Update sales data</p>
          </div>
        </div>
      )}

      {/* Status tabs */}
      {selectedClient && (
        <div className={pmStyles.statusTabs}>
          <button
            className={`${pmStyles.statusTab} ${statusFilter === 'pending' ? pmStyles.active : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            Pending
            {summary.total_pending > 0 && (
              <span className={`${pmStyles.tabCount} ${pmStyles.pendingCount}`}>{summary.total_pending}</span>
            )}
          </button>
          <button
            className={`${pmStyles.statusTab} ${statusFilter === 'confirmed' ? pmStyles.active : ''}`}
            onClick={() => setStatusFilter('confirmed')}
          >
            Confirmed
            {summary.total_confirmed > 0 && (
              <span className={`${pmStyles.tabCount} ${pmStyles.confirmedCount}`}>{summary.total_confirmed}</span>
            )}
          </button>
          <button
            className={`${pmStyles.statusTab} ${statusFilter === 'all' ? pmStyles.active : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className={pmStyles.loadingState}>
          <span className={styles.spinner}></span>
          Loading mappings...
        </div>
      )}

      {/* No client selected */}
      {!selectedClient && !loading && (
        <div className={styles.emptyState}>
          <p>Select a client to view product mappings.</p>
        </div>
      )}

      {/* Empty state */}
      {selectedClient && !loading && mappings.length === 0 && (
        <div className={styles.emptyState}>
          <p>
            {statusFilter === 'pending'
              ? 'No pending product mappings. Run a sync from Client API Keys to discover products.'
              : 'No product mappings found for this filter.'}
          </p>
        </div>
      )}

      {/* Pending items */}
      {!loading && statusFilter !== 'confirmed' && pendingMappings.length > 0 && (
        <div className={pmStyles.pendingList}>
          {pendingMappings.map(mapping => (
            <div key={mapping.id} className={pmStyles.pendingCard}>
              <div className={pmStyles.pendingHeader}>
                <div>
                  <h3 className={pmStyles.pendingName}>{mapping.external_product_name}</h3>
                  <div className={pmStyles.pendingMeta}>
                    <span className={`${pmStyles.platformBadge} ${mapping.platform === 'steam' ? pmStyles.steam : pmStyles.playstation}`}>
                      {mapping.platform}
                    </span>
                    {mapping.steam_package_id && <span>Pkg #{mapping.steam_package_id}</span>}
                    {mapping.steam_app_id && <span>App #{mapping.steam_app_id}</span>}
                    {mapping.playstation_sku && <span>SKU: {mapping.playstation_sku}</span>}
                  </div>
                </div>
                {mapping.occurrence_count > 0 && (
                  <span className={pmStyles.occurrenceCount}>
                    {mapping.occurrence_count.toLocaleString()} sales rows
                  </span>
                )}
              </div>

              {/* Candidate matches */}
              <div className={pmStyles.candidatesSection}>
                <p className={pmStyles.candidatesTitle}>
                  {mapping.match_candidates.length > 0 ? 'Match to existing product:' : 'No automatic matches found'}
                </p>

                {mapping.match_candidates.length > 0 ? (
                  <div className={pmStyles.candidatesList}>
                    {mapping.match_candidates.map(candidate => (
                      <label
                        key={candidate.product_id}
                        className={`${pmStyles.candidateOption} ${selectedCandidates[mapping.id] === candidate.product_id ? pmStyles.selected : ''}`}
                      >
                        <input
                          type="radio"
                          name={`match-${mapping.id}`}
                          checked={selectedCandidates[mapping.id] === candidate.product_id}
                          onChange={() => setSelectedCandidates(prev => ({ ...prev, [mapping.id]: candidate.product_id }))}
                        />
                        <div className={pmStyles.candidateInfo}>
                          <div className={pmStyles.candidateProductName}>{candidate.product_name}</div>
                          <div className={pmStyles.candidateGameName}>{candidate.game_name}</div>
                        </div>
                        {candidate.steam_product_id && (
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>ID: {candidate.steam_product_id}</span>
                        )}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className={pmStyles.noCandidates}>
                    No existing products match. Create a new one or ignore this item.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className={pmStyles.pendingActions}>
                <button
                  className={pmStyles.confirmBtn}
                  onClick={() => handleConfirm(mapping)}
                  disabled={!selectedCandidates[mapping.id] || actionLoading === mapping.id}
                >
                  {actionLoading === mapping.id ? 'Confirming...' : 'Confirm Match'}
                </button>
                <button
                  className={pmStyles.createBtn}
                  onClick={() => openCreateModal(mapping)}
                >
                  Create New Product
                </button>
                <button
                  className={pmStyles.ignoreBtn}
                  onClick={() => handleIgnore(mapping)}
                  disabled={actionLoading === mapping.id}
                >
                  Ignore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmed items table */}
      {!loading && (statusFilter === 'confirmed' || statusFilter === 'all') && confirmedMappings.length > 0 && (
        <div className={styles.section} style={{ marginTop: statusFilter === 'all' && pendingMappings.length > 0 ? '24px' : '0' }}>
          <table className={pmStyles.confirmedTable}>
            <thead>
              <tr>
                <th>API Product Name</th>
                <th>Platform</th>
                <th>Matched Product</th>
                <th>Game</th>
                <th>Match Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {confirmedMappings.map(mapping => (
                <tr key={mapping.id}>
                  <td>{mapping.external_product_name}</td>
                  <td>
                    <span className={`${pmStyles.platformBadge} ${mapping.platform === 'steam' ? pmStyles.steam : pmStyles.playstation}`}>
                      {mapping.platform}
                    </span>
                  </td>
                  <td>{mapping.products?.name || '—'}</td>
                  <td>{mapping.games?.name || '—'}</td>
                  <td>
                    <span className={`${pmStyles.matchTypeBadge} ${getMatchTypeBadgeClass(mapping.match_type)}`}>
                      {mapping.match_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <button
                      className={pmStyles.unlinkBtn}
                      onClick={async () => {
                        if (!confirm('Unlink this mapping? The mapping will return to pending.')) return;
                        await fetch('/api/product-matching/confirm', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ mapping_id: mapping.id, product_id: null }),
                        });
                        // Reset to pending manually
                        await supabase
                          .from('api_product_mappings')
                          .update({ status: 'pending', product_id: null, game_id: null, confirmed_at: null })
                          .eq('id', mapping.id);
                        fetchMappings();
                      }}
                    >
                      Unlink
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Product Modal */}
      {createModal && (
        <div className={styles.modalOverlay} onClick={() => setCreateModal(null)}>
          <div className={`${styles.modal} ${pmStyles.createModal}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Create New Product</h3>
              <button className={styles.closeButton} onClick={() => setCreateModal(null)}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <div className={pmStyles.createModalInfo}>
              Creating product from API data: <strong>{createModal.external_product_name}</strong>
              {createModal.steam_package_id && <span> | Package #{createModal.steam_package_id}</span>}
              {createModal.steam_app_id && <span> | App #{createModal.steam_app_id}</span>}
            </div>

            <div className={styles.formGroup}>
              <label>Game</label>
              <select
                value={createForm.game_id}
                onChange={(e) => setCreateForm(prev => ({ ...prev, game_id: e.target.value, new_game_name: '' }))}
              >
                <option value="">-- Create new game --</option>
                {clientGames.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            {!createForm.game_id && (
              <div className={styles.formGroup}>
                <label>New Game Name</label>
                <input
                  type="text"
                  value={createForm.new_game_name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, new_game_name: e.target.value }))}
                  placeholder="e.g. Call of the Wild: The Angler"
                />
              </div>
            )}

            <div className={styles.formGroup}>
              <label>Product Name</label>
              <input
                type="text"
                value={createForm.product_name}
                onChange={(e) => setCreateForm(prev => ({ ...prev, product_name: e.target.value }))}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Product Type</label>
              <select
                value={createForm.product_type}
                onChange={(e) => setCreateForm(prev => ({ ...prev, product_type: e.target.value }))}
              >
                <option value="base">Base Game</option>
                <option value="edition">Edition</option>
                <option value="dlc">DLC</option>
                <option value="soundtrack">Soundtrack</option>
                <option value="bundle">Bundle</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Available on Platforms</label>
              <div className={pmStyles.platformCheckboxes}>
                {platforms.map(p => (
                  <label
                    key={p.id}
                    className={`${pmStyles.platformCheckbox} ${createForm.platform_ids.includes(p.id) ? pmStyles.checked : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={createForm.platform_ids.includes(p.id)}
                      onChange={(e) => {
                        setCreateForm(prev => ({
                          ...prev,
                          platform_ids: e.target.checked
                            ? [...prev.platform_ids, p.id]
                            : prev.platform_ids.filter(id => id !== p.id),
                        }));
                      }}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.cancelButton} onClick={() => setCreateModal(null)}>
                Cancel
              </button>
              <button
                className={styles.saveButton}
                onClick={handleCreate}
                disabled={
                  actionLoading === createModal.id ||
                  !createForm.product_name ||
                  (!createForm.game_id && !createForm.new_game_name)
                }
              >
                {actionLoading === createModal.id ? 'Creating...' : 'Create & Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
