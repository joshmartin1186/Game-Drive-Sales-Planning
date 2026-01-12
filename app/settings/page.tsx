'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '../components/Navbar';
import { Sidebar } from '../components/Sidebar';
import styles from './settings.module.css';

interface Client {
  id: string;
  name: string;
  email?: string;
}

interface SteamApiKey {
  id: string;
  client_id: string;
  api_key: string;
  publisher_key: string | null;
  app_ids: string[];
  is_active: boolean;
  last_sync_date: string | null;
  clients: Client;
}

interface SyncDebugInfo {
  apiCalled?: boolean;
  endpoint?: string;
  highwatermarkUsed?: string;
  totalDatesFromApi?: number;
  datesAfterFilter?: number;
  sampleDates?: string[];
  newHighwatermark?: string;
  rawResponse?: unknown;
}

// Helper function to safely stringify debug info
function formatDebugInfo(debug: SyncDebugInfo | undefined): string {
  if (!debug) return '';
  try {
    return JSON.stringify(debug, null, 2);
  } catch {
    return 'Unable to format debug info';
  }
}

// Helper function to safely stringify raw response
function formatRawResponse(rawResponse: unknown): string {
  if (!rawResponse) return '';
  try {
    return JSON.stringify(rawResponse, null, 2);
  } catch {
    return 'Unable to format raw response';
  }
}

export default function SettingsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [apiKeys, setApiKeys] = useState<SteamApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState<SteamApiKey | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{valid: boolean; message: string; debug?: SyncDebugInfo} | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean; 
    message: string; 
    rowsImported?: number; 
    datesProcessed?: number;
    debug?: SyncDebugInfo;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    client_id: '',
    api_key: '',
    publisher_key: '',
    app_ids: ''
  });

  const [syncOptions, setSyncOptions] = useState({
    start_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    app_id: '',
    force_full_sync: false
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch clients
      const clientsRes = await fetch('/api/clients');
      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        setClients(clientsData);
      }

      // Fetch API keys
      const keysRes = await fetch('/api/steam-api-keys');
      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setApiKeys(keysData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  };

  const handleAddKey = async () => {
    setSaveError(null);
    try {
      const res = await fetch('/api/steam-api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: formData.client_id,
          api_key: formData.api_key,
          publisher_key: formData.publisher_key || null,
          app_ids: formData.app_ids.split(',').map(s => s.trim()).filter(Boolean)
        })
      });

      if (res.ok) {
        setShowAddModal(false);
        setFormData({ client_id: '', api_key: '', publisher_key: '', app_ids: '' });
        fetchData();
      } else {
        const err = await res.json();
        setSaveError(err.error || 'Failed to save API key');
      }
    } catch (error) {
      console.error('Error adding API key:', error);
      setSaveError('Failed to save API key');
    }
  };

  const handleTestKey = async (clientId: string) => {
    setTestingKey(clientId);
    setTestResult(null);
    try {
      const res = await fetch(`/api/steam-sync?client_id=${clientId}`);
      const data = await res.json();
      setTestResult({ valid: data.valid, message: data.message, debug: data.debug as SyncDebugInfo });
      console.log('Test result:', data);
    } catch (error) {
      setTestResult({ valid: false, message: 'Failed to test API key' });
    }
    setTimeout(() => {
      setTestingKey(null);
    }, 15000);
  };

  const handleSync = async () => {
    if (!selectedKey) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/steam-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedKey.client_id,
          start_date: syncOptions.start_date || undefined,
          end_date: syncOptions.end_date || undefined,
          app_id: syncOptions.app_id || undefined,
          force_full_sync: syncOptions.force_full_sync
        })
      });
      const data = await res.json();
      console.log('Sync result:', data);
      setSyncResult({ 
        success: data.success !== false, 
        message: data.message || data.error || 'Unknown result',
        rowsImported: data.rowsImported,
        datesProcessed: data.datesProcessed,
        debug: data.debug as SyncDebugInfo
      });
      if (data.success) {
        fetchData();
      }
    } catch (error) {
      console.error('Sync error:', error);
      setSyncResult({ success: false, message: 'Failed to sync data: ' + String(error) });
    }
    setSyncing(false);
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return;
    try {
      const res = await fetch(`/api/steam-api-keys?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
    }
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
  };

  // Get clients that don't have an API key yet
  const availableClients = clients.filter(
    client => !apiKeys.some(key => key.client_id === client.id)
  );

  return (
    <div className={styles.pageWrapper}>
      <Navbar />
      <div className={styles.layoutContainer}>
        <Sidebar />
        <main className={styles.mainContent}>
          <Link href="/" className={styles.backLink}>
            ← Back to Planning
          </Link>

          <div className={styles.header}>
            <h1>Settings</h1>
            <p>Manage Steam API keys and data synchronization</p>
          </div>

          {/* Steam API Keys Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <div className={styles.sectionIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <h2>Steam API Keys</h2>
              </div>
              <button className={styles.addButton} onClick={() => setShowAddModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add API Key
              </button>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.spinner}></div>
                <p>Loading...</p>
              </div>
            ) : apiKeys.length === 0 ? (
              <div className={styles.emptyState}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                <p>No Steam API keys configured yet</p>
                <button className={styles.addButton} onClick={() => setShowAddModal(true)}>
                  Add Your First API Key
                </button>
              </div>
            ) : (
              <div className={styles.keysList}>
                {apiKeys.map((key) => (
                  <div key={key.id} className={styles.keyCard}>
                    <div className={styles.keyInfo}>
                      <span className={styles.clientBadge}>{key.clients?.name || 'Unknown Client'}</span>
                      <div className={styles.keyDetails}>
                        <span className={styles.keyMasked}>{maskApiKey(key.api_key)}</span>
                        <div className={styles.keyMeta}>
                          <span>{key.publisher_key ? '✓ Financial API Key' : '○ No Financial Key'}</span>
                          <span>{key.app_ids?.length || 0} App IDs</span>
                          {key.last_sync_date && <span>Last sync: {key.last_sync_date}</span>}
                        </div>
                      </div>
                      {testingKey === key.client_id && testResult && (
                        <div className={`${styles.statusBadge} ${testResult.valid ? styles.valid : styles.invalid}`}>
                          <strong>{testResult.valid ? '✓ Connected' : '✗ Failed'}</strong>
                          <span style={{ fontSize: '11px', display: 'block', marginTop: '2px' }}>{testResult.message}</span>
                          {testResult.debug && (
                            <details style={{ marginTop: '8px', fontSize: '10px' }}>
                              <summary>Debug Info</summary>
                              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f1f5f9', padding: '8px', borderRadius: '4px', marginTop: '4px' }}>
                                {formatDebugInfo(testResult.debug)}
                              </pre>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={styles.keyActions}>
                      <button 
                        className={`${styles.actionButton} ${styles.test}`}
                        onClick={() => handleTestKey(key.client_id)}
                        disabled={testingKey === key.client_id}
                      >
                        {testingKey === key.client_id ? (
                          <span className={styles.spinner}></span>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Test
                          </>
                        )}
                      </button>
                      <button 
                        className={`${styles.actionButton} ${styles.sync}`}
                        onClick={() => { setSelectedKey(key); setShowSyncModal(true); setSyncResult(null); }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M23 4v6h-6"/>
                          <path d="M1 20v-6h6"/>
                          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/>
                          <path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/>
                        </svg>
                        Sync
                      </button>
                      <button 
                        className={`${styles.actionButton} ${styles.delete}`}
                        onClick={() => handleDeleteKey(key.id)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                          <path d="M10 11v6"/>
                          <path d="M14 11v6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className={styles.section}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>How to Get Your Steam Financial API Key</h3>
            <ol style={{ margin: 0, paddingLeft: '20px', color: '#64748b', lineHeight: '1.8' }}>
              <li>Go to <a href="https://partner.steamgames.com/pub/groups/" target="_blank" rel="noopener noreferrer" style={{ color: '#1b2838' }}>partner.steamgames.com/pub/groups/</a></li>
              <li>Click <strong>&quot;Create Financial API Group&quot;</strong> (or select existing one)</li>
              <li>The <strong>Financial Web API Key</strong> will be displayed on the group page</li>
              <li>Copy this key and paste it in the &quot;Financial Web API Key&quot; field above</li>
              <li>Optional: Add whitelisted IPs for extra security</li>
            </ol>
            <p style={{ marginTop: '16px', padding: '12px', background: '#dbeafe', borderRadius: '6px', fontSize: '14px' }}>
              <strong>💡 New in June 2025:</strong> Steam now offers the <a href="https://steamcommunity.com/groups/steamworks/announcements/detail/532096678169150062" target="_blank" rel="noopener noreferrer" style={{ color: '#1b2838' }}>IPartnerFinancialsService API</a> for programmatic access to sales data including revenue, units, and regional breakdown.
            </p>
          </div>
        </main>
      </div>

      {/* Add API Key Modal */}
      {showAddModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Add Steam API Key</h3>
              <button className={styles.closeButton} onClick={() => setShowAddModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            
            {saveError && (
              <div style={{ padding: '12px', background: '#fef2f2', color: '#dc2626', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>
                {saveError}
              </div>
            )}

            <div className={styles.formGroup}>
              <label>Client *</label>
              <select
                value={formData.client_id}
                onChange={e => setFormData({...formData, client_id: e.target.value})}
              >
                <option value="">Select a client...</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <small>{availableClients.length} clients without API keys</small>
            </div>

            <div className={styles.formGroup}>
              <label>Steam Web API Key *</label>
              <input
                type="text"
                placeholder="Enter your Steam Web API key"
                value={formData.api_key}
                onChange={e => setFormData({...formData, api_key: e.target.value})}
                style={{ fontFamily: 'monospace' }}
              />
              <small>Basic API key from steamcommunity.com/dev/apikey</small>
            </div>

            <div className={styles.formGroup}>
              <label>Financial Web API Key (Required for Sales Data)</label>
              <input
                type="text"
                placeholder="Enter your Financial Web API key"
                value={formData.publisher_key}
                onChange={e => setFormData({...formData, publisher_key: e.target.value})}
                style={{ fontFamily: 'monospace' }}
              />
              <small>From Steamworks → Manage Groups → Financial API Group</small>
            </div>

            <div className={styles.formGroup}>
              <label>App IDs (Optional)</label>
              <input
                type="text"
                placeholder="730, 440, 570"
                value={formData.app_ids}
                onChange={e => setFormData({...formData, app_ids: e.target.value})}
              />
              <small>Comma-separated list of Steam App IDs to track</small>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.cancelButton} onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button 
                className={styles.saveButton} 
                onClick={handleAddKey}
                disabled={!formData.client_id || !formData.api_key}
              >
                Save API Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Modal */}
      {showSyncModal && selectedKey && (
        <div className={styles.modalOverlay} onClick={() => { setShowSyncModal(false); setSyncResult(null); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className={styles.modalHeader}>
              <h3>Sync Steam Data</h3>
              <button className={styles.closeButton} onClick={() => { setShowSyncModal(false); setSyncResult(null); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <p style={{ color: '#64748b', marginBottom: '16px' }}>
              Sync financial data for <strong>{selectedKey.clients?.name}</strong> using the IPartnerFinancialsService API.
            </p>

            <div className={styles.syncOptions}>
              <div className={styles.dateRange}>
                <div className={styles.formGroup}>
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={syncOptions.start_date}
                    onChange={e => setSyncOptions({...syncOptions, start_date: e.target.value})}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>End Date</label>
                  <input
                    type="date"
                    value={syncOptions.end_date}
                    onChange={e => setSyncOptions({...syncOptions, end_date: e.target.value})}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Specific App ID (Optional)</label>
                <input
                  type="text"
                  placeholder="Leave empty for all apps"
                  value={syncOptions.app_id}
                  onChange={e => setSyncOptions({...syncOptions, app_id: e.target.value})}
                />
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={syncOptions.force_full_sync}
                    onChange={e => setSyncOptions({...syncOptions, force_full_sync: e.target.checked})}
                    style={{ width: '16px', height: '16px' }}
                  />
                  Force full sync (ignore cached highwatermark)
                </label>
                <small>Use this to re-sync all data from scratch</small>
              </div>
            </div>

            {syncResult && (
              <div className={`${styles.syncResult} ${syncResult.success ? styles.success : styles.error}`}>
                <strong>{syncResult.success ? '✓ Success' : '✗ Error'}</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>{syncResult.message}</p>
                {syncResult.rowsImported !== undefined && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.8 }}>
                    {syncResult.rowsImported} rows imported from {syncResult.datesProcessed || 0} date(s)
                  </p>
                )}
                
                {/* Debug Information */}
                {syncResult.debug && (
                  <details style={{ marginTop: '12px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#64748b' }}>
                      🔍 Show API Debug Info
                    </summary>
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '12px', 
                      background: '#f8fafc', 
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: 'monospace'
                    }}>
                      <div><strong>API Called:</strong> {syncResult.debug.apiCalled ? 'Yes' : 'No'}</div>
                      <div><strong>Endpoint:</strong> {syncResult.debug.endpoint || 'N/A'}</div>
                      <div><strong>Highwatermark Used:</strong> {syncResult.debug.highwatermarkUsed || 'N/A'}</div>
                      <div><strong>Total Dates from API:</strong> {String(syncResult.debug.totalDatesFromApi ?? 'N/A')}</div>
                      <div><strong>Dates After Filter:</strong> {String(syncResult.debug.datesAfterFilter ?? 'N/A')}</div>
                      {syncResult.debug.sampleDates && syncResult.debug.sampleDates.length > 0 && (
                        <div><strong>Sample Dates:</strong> {syncResult.debug.sampleDates.join(', ')}</div>
                      )}
                      {syncResult.debug.rawResponse !== undefined && syncResult.debug.rawResponse !== null && (
                        <details style={{ marginTop: '8px' }}>
                          <summary style={{ cursor: 'pointer' }}>Raw API Response</summary>
                          <pre style={{ 
                            whiteSpace: 'pre-wrap', 
                            wordBreak: 'break-all',
                            maxHeight: '200px',
                            overflow: 'auto',
                            background: '#e2e8f0',
                            padding: '8px',
                            borderRadius: '4px',
                            marginTop: '4px'
                          }}>
                            {formatRawResponse(syncResult.debug.rawResponse)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </details>
                )}
              </div>
            )}

            {!selectedKey.publisher_key && (
              <div style={{ padding: '12px', background: '#fef3c7', borderRadius: '6px', fontSize: '14px', marginTop: '12px' }}>
                <strong>⚠️ No Financial API Key:</strong> Add a Financial Web API Key to sync sales data. 
                <a href="https://partner.steamgames.com/pub/groups/" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '4px', color: '#1b2838' }}>
                  Get one here →
                </a>
              </div>
            )}

            <div className={styles.modalActions}>
              <button className={styles.cancelButton} onClick={() => { setShowSyncModal(false); setSyncResult(null); }}>
                Close
              </button>
              <button 
                className={styles.saveButton} 
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? (
                  <>
                    <span className={styles.spinner}></span>
                    Syncing...
                  </>
                ) : (
                  'Start Sync'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
