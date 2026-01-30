'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter, useSearchParams } from 'next/navigation'

export default function SetupPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [verified, setVerified] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  // Verify the invite token on mount
  useEffect(() => {
    async function verifyToken() {
      if (!tokenHash || type !== 'invite') {
        setError('Invalid or missing invite link.')
        setVerifying(false)
        return
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'invite',
      })

      if (error) {
        setError('This invite link is invalid or has expired. Please ask your admin for a new one.')
        setVerifying(false)
        return
      }

      setVerified(true)
      setVerifying(false)
    }

    verifyToken()
  }, [tokenHash, type, supabase])

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    // Update password
    const { error: passwordError } = await supabase.auth.updateUser({
      password,
    })

    if (passwordError) {
      setError(passwordError.message)
      setLoading(false)
      return
    }

    // Update display name in user_profiles
    const { data: { user } } = await supabase.auth.getUser()
    if (user && displayName.trim()) {
      await supabase
        .from('user_profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', user.id)
    }

    router.push('/')
    router.refresh()
  }

  if (verifying) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg)', fontFamily: 'Inter, sans-serif',
      }}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Verifying invite link...</p>
      </div>
    )
  }

  if (!verified) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg)', fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          width: '100%', maxWidth: '400px', padding: '40px',
          background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)', border: '1px solid var(--color-border)',
          textAlign: 'center',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '48px', height: '48px', borderRadius: 'var(--radius-md)',
            background: 'var(--color-danger)', color: '#fff', fontSize: '18px', fontWeight: 700,
            marginBottom: '16px',
          }}>
            !
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 8px 0' }}>
            Invalid Invite
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: 0 }}>
            {error}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg)', fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px', padding: '40px',
        background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)', border: '1px solid var(--color-border)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '48px', height: '48px', borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary)', color: '#fff', fontSize: '18px', fontWeight: 700,
            marginBottom: '16px',
          }}>
            GD
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 4px 0' }}>
            Welcome to GameDrive
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: 0 }}>
            Set up your account to get started
          </p>
        </div>

        <form onSubmit={handleSetup}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block', fontSize: '13px', fontWeight: 500,
              color: 'var(--color-text)', marginBottom: '6px',
            }}>
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              style={{
                width: '100%', padding: '10px 12px', fontSize: '14px',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                outline: 'none', background: 'var(--color-bg)', color: 'var(--color-text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block', fontSize: '13px', fontWeight: 500,
              color: 'var(--color-text)', marginBottom: '6px',
            }}>
              Password *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
              style={{
                width: '100%', padding: '10px 12px', fontSize: '14px',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                outline: 'none', background: 'var(--color-bg)', color: 'var(--color-text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block', fontSize: '13px', fontWeight: 500,
              color: 'var(--color-text)', marginBottom: '6px',
            }}>
              Confirm Password *
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Re-enter your password"
              style={{
                width: '100%', padding: '10px 12px', fontSize: '14px',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                outline: 'none', background: 'var(--color-bg)', color: 'var(--color-text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 12px', marginBottom: '16px', fontSize: '13px',
              color: 'var(--color-danger)', background: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: 'var(--radius-md)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '10px 16px', fontSize: '14px', fontWeight: 600,
              color: '#fff', background: loading ? 'var(--color-text-light)' : 'var(--color-primary)',
              border: 'none', borderRadius: 'var(--radius-md)',
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'var(--transition)',
            }}
          >
            {loading ? 'Setting up...' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </div>
  )
}
