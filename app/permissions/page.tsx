'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '../components/Navbar';
import { Sidebar } from '../components/Sidebar';
import styles from './permissions.module.css';
import type { UserRole, FeatureKey, AccessLevel } from '@/lib/types';

interface UserData {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  is_active: boolean;
  all_clients: boolean;
  created_at: string;
  client_ids: string[];
  clients: { id: string; name: string }[];
  permissions: { id: string; user_id: string; feature: FeatureKey; access_level: AccessLevel }[];
}

interface ClientOption {
  id: string;
  name: string;
}

const FEATURES: { key: FeatureKey; label: string; description: string }[] = [
  { key: 'sales_timeline', label: 'Sales Timeline', description: 'Gantt chart and sales management' },
  { key: 'analytics', label: 'Analytics', description: 'Performance metrics and dashboards' },
  { key: 'client_management', label: 'Client Management', description: 'Manage game clients' },
  { key: 'platform_settings', label: 'Platform Settings', description: 'Configure platform rules' },
  { key: 'excel_export', label: 'Excel Export', description: 'Download reports' },
  { key: 'api_settings', label: 'API Settings', description: 'Steam API keys and sync' },
  { key: 'pr_coverage', label: 'PR Coverage', description: 'Media outlet tracking and coverage' },
];

function getDefaultAccessForRole(role: UserRole): string {
  switch (role) {
    case 'superadmin': return 'edit';
    case 'editor': return 'edit';
    case 'viewer': return 'view';
    default: return 'view';
  }
}

export default function PermissionsPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [allClients, setAllClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('viewer');
  const [formAllClients, setFormAllClients] = useState(false);
  const [formClientIds, setFormClientIds] = useState<string[]>([]);
  const [formPermissions, setFormPermissions] = useState<Record<FeatureKey, string>>({
    sales_timeline: 'default',
    analytics: 'default',
    client_management: 'default',
    platform_settings: 'default',
    excel_export: 'default',
    api_settings: 'default',
    pr_coverage: 'default',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users || []);
      setAllClients(data.allClients || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormEmail('');
    setFormRole('viewer');
    setFormAllClients(false);
    setFormClientIds([]);
    setFormPermissions({
      sales_timeline: 'default',
      analytics: 'default',
      client_management: 'default',
      platform_settings: 'default',
      excel_export: 'default',
      api_settings: 'default',
      pr_coverage: 'default',
    });
    setSaveError(null);
    setInviteLink(null);
  };

  const openInviteModal = () => {
    resetForm();
    setShowInviteModal(true);
  };

  const openEditModal = (user: UserData) => {
    setSelectedUser(user);
    setFormRole(user.role);
    setFormAllClients(user.all_clients);
    setFormClientIds(user.client_ids);

    // Build permissions map from existing
    const perms: Record<FeatureKey, string> = {
      sales_timeline: 'default',
      analytics: 'default',
      client_management: 'default',
      platform_settings: 'default',
      excel_export: 'default',
      api_settings: 'default',
      pr_coverage: 'default',
    };
    user.permissions.forEach((p) => {
      perms[p.feature] = p.access_level;
    });
    setFormPermissions(perms);
    setSaveError(null);
    setShowEditModal(true);
  };

  const openDeleteModal = (user: UserData) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  const handleInvite = async () => {
    if (!formEmail) return;
    setSaving(true);
    setSaveError(null);

    try {
      const permissions = Object.entries(formPermissions)
        .filter(([, level]) => level !== 'default')
        .map(([feature, access_level]) => ({ feature, access_level }));

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formEmail,
          role: formRole,
          all_clients: formAllClients,
          client_ids: formAllClients ? [] : formClientIds,
          permissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to invite user');

      if (data.invite_link) {
        setInviteLink(data.invite_link);
      }

      fetchUsers();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to invite user');
    }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setSaveError(null);

    try {
      const permissions = Object.entries(formPermissions)
        .filter(([, level]) => level !== 'default')
        .map(([feature, access_level]) => ({ feature, access_level }));

      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUser.id,
          role: formRole,
          all_clients: formAllClients,
          client_ids: formAllClients ? [] : formClientIds,
          permissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');

      setShowEditModal(false);
      fetchUsers();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update user');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/users?user_id=${selectedUser.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');

      setShowDeleteModal(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to delete user');
    }
    setSaving(false);
  };

  const toggleClientId = (clientId: string) => {
    setFormClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  };

  const toggleAllClientsCheckbox = () => {
    if (!formAllClients) {
      setFormAllClients(true);
      setFormClientIds([]);
    } else {
      setFormAllClients(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getRoleBadgeClass = (role: UserRole) => {
    switch (role) {
      case 'superadmin': return styles.roleSuperadmin;
      case 'editor': return styles.roleEditor;
      case 'viewer': return styles.roleViewer;
      default: return styles.roleViewer;
    }
  };

  const renderUserModal = (mode: 'invite' | 'edit') => {
    const isInvite = mode === 'invite';
    const title = isInvite ? 'Invite New User' : 'Edit User';
    const onClose = () => {
      if (isInvite) {
        setShowInviteModal(false);
        resetForm();
      } else {
        setShowEditModal(false);
      }
    };

    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h3>{title}</h3>
            <button className={styles.closeButton} onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {saveError && <div className={styles.errorMessage}>{saveError}</div>}

          {inviteLink && (
            <div className={styles.inviteResult}>
              <h4>User invited successfully!</h4>
              <div className={styles.inviteLinkBox}>
                <input
                  className={styles.inviteLinkInput}
                  value={inviteLink}
                  readOnly
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button className={styles.copyButton} onClick={() => copyToClipboard(inviteLink)}>
                  Copy
                </button>
              </div>
            </div>
          )}

          {!inviteLink && (
            <>
              {/* Email */}
              {isInvite && (
                <div className={styles.formGroup}>
                  <label>Email *</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
              )}

              {!isInvite && selectedUser && (
                <div className={styles.formGroup}>
                  <label>Email</label>
                  <input type="text" value={selectedUser.email} disabled style={{ opacity: 0.6 }} />
                </div>
              )}

              {/* Role */}
              <div className={styles.formGroup}>
                <label>Role</label>
                <select value={formRole} onChange={(e) => setFormRole(e.target.value as UserRole)}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>

              {/* Client Access */}
              <h4 className={styles.sectionLabel}>Client Access</h4>
              <p className={styles.sectionHint}>Select which clients this user can see data for.</p>

              <div className={styles.checkboxGroup}>
                <label className={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    checked={formAllClients}
                    onChange={toggleAllClientsCheckbox}
                  />
                  <span className={styles.checkboxLabel}>All Clients (including future clients)</span>
                </label>
                {allClients.map((client) => (
                  <label
                    key={client.id}
                    className={`${styles.checkboxItem} ${styles.indented} ${formAllClients ? styles.disabled : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={formAllClients || formClientIds.includes(client.id)}
                      onChange={() => toggleClientId(client.id)}
                      disabled={formAllClients}
                    />
                    <span className={styles.checkboxLabel}>{client.name}</span>
                  </label>
                ))}
              </div>

              {/* Feature Permissions */}
              <h4 className={styles.sectionLabel}>Feature Permissions</h4>
              <p className={styles.sectionHint}>
                Override the base role for specific features. Leave as &quot;Use default&quot; to inherit from the base role.
              </p>

              <div className={styles.permissionsList}>
                {FEATURES.map((feature) => (
                  <div key={feature.key} className={styles.permissionRow}>
                    <div className={styles.permissionInfo}>
                      <h4>{feature.label}</h4>
                      <p>{feature.description}</p>
                    </div>
                    <select
                      className={styles.permissionSelect}
                      value={formPermissions[feature.key]}
                      onChange={(e) =>
                        setFormPermissions((prev) => ({ ...prev, [feature.key]: e.target.value }))
                      }
                    >
                      <option value="default">Use default ({getDefaultAccessForRole(formRole)})</option>
                      <option value="view">View only</option>
                      <option value="edit">Edit</option>
                      <option value="none">No access</option>
                    </select>
                  </div>
                ))}
              </div>

              <p className={styles.modalFooter}>
                {isInvite
                  ? 'An invite link will be generated. The user will set their own password and display name.'
                  : 'Changes will take effect immediately.'}
              </p>

              <div className={styles.modalActions}>
                <button className={styles.cancelButton} onClick={onClose}>
                  Cancel
                </button>
                <button
                  className={isInvite ? styles.saveButtonPrimary : styles.saveButton}
                  onClick={isInvite ? handleInvite : handleUpdate}
                  disabled={saving || (isInvite && !formEmail)}
                >
                  {saving ? (
                    <span className={styles.spinner}></span>
                  ) : isInvite ? (
                    'Generate Invite Link'
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

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
            <div className={styles.headerInfo}>
              <h1>Permissions</h1>
              <p>Manage user access and permissions</p>
            </div>
            <button className={styles.inviteButton} onClick={openInviteModal}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              Invite User
            </button>
          </div>

          {error && <div className={styles.errorMessage}>{error}</div>}

          <div className={styles.section}>
            {loading ? (
              <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>Loading users...</p>
              </div>
            ) : users.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No users found. Invite your first team member to get started.</p>
                <button className={styles.inviteButton} onClick={openInviteModal}>
                  Invite User
                </button>
              </div>
            ) : (
              <table className={styles.usersTable}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Client Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className={styles.userEmail}>{user.email}</div>
                        {user.display_name && (
                          <div className={styles.userDisplayName}>{user.display_name}</div>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.roleBadge} ${getRoleBadgeClass(user.role)}`}>
                          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </span>
                      </td>
                      <td>
                        {user.all_clients ? (
                          <span className={styles.allClientsTag}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M8 12l2 2 4-4" />
                            </svg>
                            All Clients
                          </span>
                        ) : user.clients.length > 0 ? (
                          <div className={styles.clientList}>
                            {user.clients.map((c) => (
                              <span key={c.id} className={styles.clientTag}>
                                {c.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '13px' }}>No clients</span>
                        )}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button className={styles.editButton} onClick={() => openEditModal(user)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit
                          </button>
                          <button className={styles.deleteButton} onClick={() => openDeleteModal(user)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* Invite Modal */}
      {showInviteModal && renderUserModal('invite')}

      {/* Edit Modal */}
      {showEditModal && selectedUser && renderUserModal('edit')}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedUser && (
        <div className={styles.modalOverlay} onClick={() => setShowDeleteModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className={styles.modalHeader}>
              <h3>Delete User</h3>
              <button className={styles.closeButton} onClick={() => setShowDeleteModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className={styles.deleteConfirm}>
              <p>Are you sure you want to delete this user?</p>
              <p>
                <strong>{selectedUser.email}</strong>
              </p>
              <div className={styles.deleteWarning}>
                This action cannot be undone. The user will lose all access immediately.
              </div>
            </div>

            <div className={styles.deleteActions}>
              <button className={styles.cancelButton} onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className={styles.deleteButtonConfirm} onClick={handleDelete} disabled={saving}>
                {saving ? <span className={styles.spinner}></span> : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
