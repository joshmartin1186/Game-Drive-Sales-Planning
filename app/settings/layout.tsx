'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sidebar } from '../components/Sidebar'
import { useAuth } from '@/lib/auth-context'
import styles from './settings-layout.module.css'

interface SettingsTab {
  name: string
  href: string
  feature: 'api_settings' | 'client_management' | 'platform_settings' | null
  superadminOnly?: boolean
}

const SETTINGS_TABS: SettingsTab[] = [
  { name: 'Client API Keys', href: '/settings/client-keys', feature: 'api_settings' },
  { name: 'System API Keys', href: '/settings/system-keys', feature: 'api_settings' },
  { name: 'Clients', href: '/settings/clients', feature: 'client_management' },
  { name: 'Platforms', href: '/settings/platforms', feature: 'platform_settings' },
  { name: 'Users', href: '/settings/users', feature: null, superadminOnly: true },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { hasAccess, isSuperAdmin, loading } = useAuth()
  const pathname = usePathname()

  const visibleTabs = SETTINGS_TABS.filter((tab) => {
    if (tab.superadminOnly) return isSuperAdmin
    if (tab.feature) return hasAccess(tab.feature, 'view')
    return true
  })

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.layoutContainer}>
        <Sidebar />
        <main className={styles.mainContent}>
          <div className={styles.header}>
            <h1>Settings</h1>
            <p>Manage API keys, clients, platforms, and users</p>
          </div>

          <nav className={styles.tabBar}>
            {visibleTabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={pathname === tab.href ? styles.tabActive : styles.tab}
              >
                {tab.name}
              </Link>
            ))}
          </nav>

          <div className={styles.tabContent}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
