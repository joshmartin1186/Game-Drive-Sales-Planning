'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Sidebar } from '../components/Sidebar'

interface Platform {
  id: string
  name: string
  cooldown_days: number
  color_hex: string
  approval_required: boolean
  max_sale_days: number | null
  special_sales_no_cooldown: boolean
}

export default function PlatformsPage() {
  const supabase = createClientComponentClient()
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  useEffect(() => {
    fetchPlatforms()
  }, [])

  const fetchPlatforms = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('platforms')
      .select('*')
      .order('name')
    
    if (!error && data) {
      setPlatforms(data)
    }
    setIsLoading(false)
  }

  const handleSave = async (platform: Platform) => {
    setSaveStatus('Saving...')
    const { error } = await supabase
      .from('platforms')
      .update({
        cooldown_days: platform.cooldown_days,
        color_hex: platform.color_hex,
        approval_required: platform.approval_required,
        max_sale_days: platform.max_sale_days,
        special_sales_no_cooldown: platform.special_sales_no_cooldown
      })
      .eq('id', platform.id)
    
    if (!error) {
      setSaveStatus('Saved!')
      setEditingPlatform(null)
      fetchPlatforms()
      setTimeout(() => setSaveStatus(null), 2000)
    } else {
      setSaveStatus('Error saving')
    }
  }

  const getPlatformIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'steam':
        return '🎮'
      case 'playstation':
        return '🎯'
      case 'xbox':
        return '🟢'
      case 'nintendo':
        return '🔴'
      case 'epic':
        return '🏪'
      default:
        return '📦'
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar />
      
      <div style={{ flex: 1, padding: '32px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Platform Settings</h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>Configure cooldown rules and platform-specific settings</p>
          </div>

          {saveStatus && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: saveStatus === 'Saved!' ? '#dcfce7' : saveStatus === 'Error saving' ? '#fee2e2' : '#f1f5f9',
              color: saveStatus === 'Saved!' ? '#166534' : saveStatus === 'Error saving' ? '#dc2626' : '#475569',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '14px'
            }}>
              {saveStatus}
            </div>
          )}

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Loading platforms...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {platforms.map(platform => (
                <div
                  key={platform.id}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '24px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    borderLeft: `4px solid ${platform.color_hex}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '24px' }}>{getPlatformIcon(platform.name)}</span>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', margin: 0 }}>{platform.name}</h3>
                        <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
                          {platform.cooldown_days} day cooldown
                          {platform.approval_required && ' • Approval required'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditingPlatform(editingPlatform?.id === platform.id ? null : platform)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: editingPlatform?.id === platform.id ? '#f1f5f9' : 'white',
                        color: '#475569',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      {editingPlatform?.id === platform.id ? 'Cancel' : 'Edit'}
                    </button>
                  </div>

                  {editingPlatform?.id === platform.id && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                            Cooldown Days
                          </label>
                          <input
                            type="number"
                            value={editingPlatform.cooldown_days}
                            onChange={(e) => setEditingPlatform({ ...editingPlatform, cooldown_days: parseInt(e.target.value) || 0 })}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              fontSize: '14px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                            Platform Color
                          </label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="color"
                              value={editingPlatform.color_hex}
                              onChange={(e) => setEditingPlatform({ ...editingPlatform, color_hex: e.target.value })}
                              style={{
                                width: '50px',
                                height: '42px',
                                padding: '0',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                cursor: 'pointer'
                              }}
                            />
                            <input
                              type="text"
                              value={editingPlatform.color_hex}
                              onChange={(e) => setEditingPlatform({ ...editingPlatform, color_hex: e.target.value })}
                              style={{
                                flex: 1,
                                padding: '10px 12px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '14px',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                            Max Sale Days
                          </label>
                          <input
                            type="number"
                            value={editingPlatform.max_sale_days || ''}
                            onChange={(e) => setEditingPlatform({ ...editingPlatform, max_sale_days: e.target.value ? parseInt(e.target.value) : null })}
                            placeholder="No limit"
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              fontSize: '14px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={editingPlatform.approval_required}
                              onChange={(e) => setEditingPlatform({ ...editingPlatform, approval_required: e.target.checked })}
                              style={{ width: '18px', height: '18px' }}
                            />
                            <span style={{ fontSize: '14px', color: '#374151' }}>Approval Required</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={editingPlatform.special_sales_no_cooldown}
                              onChange={(e) => setEditingPlatform({ ...editingPlatform, special_sales_no_cooldown: e.target.checked })}
                              style={{ width: '18px', height: '18px' }}
                            />
                            <span style={{ fontSize: '14px', color: '#374151' }}>Special Sales Skip Cooldown</span>
                          </label>
                        </div>
                      </div>
                      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleSave(editingPlatform)}
                          style={{
                            padding: '10px 24px',
                            backgroundColor: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: 'pointer'
                          }}
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
