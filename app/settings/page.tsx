'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import styles from './settings.module.css';

interface Client {
  id: string;
  name: string;
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

export default function SettingsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [apiKeys, setApiKeys] = useState<SteamApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState<SteamApiKey | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{valid: boolean; message: string} | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{success: boolean; message: string} | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    client_id: '',
    api_key: '',
    publisher_key: '',
    app_ids: ''
  });

  // Sync options
  const [syncOptions, setSyncOptions] = useState({
    start_date: '',
    end_date: '',
    app_id: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch clients
      const clientsRes = await fetch('/api/sales');
      if (clientsRes.ok) {
        const salesData = await clientsRes.json();
        // Extract unique clients from sales or fetch separately
      }

      // Fetch clients directly from Supabase via API
      const clientsResponse = await fetch('/api/platforms'); // We'll use a different approach
      
      // For now, fetch API keys which include client data
      const keysRes = await fetch('/api/steam-api-keys');
      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setApiKeys(keysData);
      }

      // Fetch all clients
      const allClientsRes = await fetch('/api/sales?clients_only=true');
      
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  };

  const handleAddKey = async () => {
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
      }
    } catch (error) {
      console.error('Error adding API key:', error);
    }
  };

  const handleTestKey = async (clientId: string) => {
    setTestingKey(clientId);
    setTestResult(null);
    try {
      const res = await fetch(`/api/steam-sync?client_id=${clientId}`);
      const data = await res.json();
      setTestResult({ valid: data.valid, message: data.message });
    } catch (error) {
      setTestResult({ valid: false, message: 'Failed to test API key' });
    }
    setTimeout(() => {
      setTestingKey(null);
      setTestResult(null);
    }, 5000);
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
          app_id: syncOptions.app_id || undefined
        })
      });
      const data = await res.json();
      setSyncResult({ success: data.success, message: data.message });
      if (data.success) {
        fetchData();
      }
    } catch (error) {
      setSyncResult({ success: false, message: 'Failed to sync data' });
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

  return (
    <div className={styles.settingsPage}>
      <Navbar />
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <div className={styles.container} style={{ marginLeft: sidebarCollapsed ? '60px' : '240px', transition: 'margin-left 0.3s' }}>
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
                        <span>{key.publisher_key ? '✓ Publisher Key' : '○ No Publisher Key'}</span>
                        <span>{key.app_ids?.length || 0} App IDs</span>
                        {key.last_sync_date && <span>Last sync: {key.last_sync_date}</span>}
                      </div>
                    </div>
                    {testingKey === key.client_id && testResult && (
                      <span className={`${styles.statusBadge} ${testResult.valid ? styles.valid : styles.invalid}`}>
                        {testResult.valid ? '✓ Valid' : '✗ Invalid'}
                      </span>
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
                      onClick={() => { setSelectedKey(key); setShowSyncModal(true); }}
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
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>How to Get Your Steam API Keys</h3>
          <ol style={{ margin: 0, paddingLeft: '20px', color: '#64748b', lineHeight: '1.8' }}>
            <li>Go to <a href="https://partner.steamgames.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1b2838' }}>partner.steamgames.com</a></li>
            <li>Navigate to Users &amp; Permissions → Manage Groups</li>
            <li>Select your publisher group and go to "Web API Keys"</li>
            <li>Generate a new key with appropriate permissions</li>
            <li>For financial data, ensure you have "View financial info" permission</li>
          </ol>
          <p style={{ marginTop: '16px', padding: '12px', background: '#fef3c7', borderRadius: '6px', fontSize: '14px' }}>
            <strong>Note:</strong> Full financial data sync requires Publisher-level API access. For complete sales data, you can also import CSV exports from the Steam Partner portal via the Analytics page.
          </p>
        </div>
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
            
            <div className={styles.formGroup}>
              <label>Client *</label>
              <input
                type="text"
                placeholder="Enter client ID or select from list"
                value={formData.client_id}
                onChange={e => setFormData({...formData, client_id: e.target.value})}
              />
              <small>Enter the client UUID from the database</small>
            </div>

            <div className={styles.formGroup}>
              <label>Steam Web API Key *</label>
              <input
                type="password"
                placeholder="Enter your Steam Web API key"
                value={formData.api_key}
                onChange={e => setFormData({...formData, api_key: e.target.value})}
              />
              <small>Required for basic Steam API access</small>
            </div>

            <div className={styles.formGroup}>
              <label>Publisher API Key (Optional)</label>
              <input
                type="password"
                placeholder="Enter your Publisher API key"
                value={formData.publisher_key}
                onChange={e => setFormData({...formData, publisher_key: e.target.value})}
              />
              <small>Required for financial data access</small>
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
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
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
              Sync financial data for <strong>{selectedKey.clients?.name}</strong>
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
            </div>

            {syncResult && (
              <div className={`${styles.syncResult} ${syncResult.success ? styles.success : styles.error}`}>
                <strong>{syncResult.success ? '✓ Success' : '✗ Error'}</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>{syncResult.message}</p>
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
