'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { ROUTE_FEATURE_MAP, type FeatureKey } from '@/lib/auth'

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const { profile, loading, isSuperAdmin, hasAccess, signOut } = useAuth()

  const navItems: { name: string; href: string; icon: React.ReactNode; description: string; feature: FeatureKey }[] = [
    {
      name: 'Sales Timeline',
      href: '/',
      feature: 'sales_timeline',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      description: 'Interactive Gantt chart'
    },
    {
      name: 'Analytics',
      href: '/analytics',
      feature: 'analytics',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      description: 'Performance metrics'
    },
    {
      name: 'Client Management',
      href: '/clients',
      feature: 'client_management',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      description: 'Manage game clients'
    },
    {
      name: 'Platform Settings',
      href: '/platforms',
      feature: 'platform_settings',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      description: 'Configure cooldown rules'
    },
    {
      name: 'Excel Export',
      href: '/export',
      feature: 'export',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      description: 'Download reports'
    },
    {
      name: 'API Settings',
      href: '/settings',
      feature: 'api_settings',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
      description: 'Steam API keys'
    }
  ]

  // Filter nav items based on user permissions
  const visibleNavItems = navItems.filter((item) =>
    hasAccess(item.feature, 'view')
  )

  return (
    <div className="hidden lg:flex lg:flex-shrink-0">
      <div className="flex flex-col w-64">
        <div className="flex flex-col flex-grow pt-5 pb-4 bg-white border-r border-gray-200">
          <div className="flex flex-col flex-grow">
            <nav className="flex-1 px-4 space-y-1 bg-white">
              {visibleNavItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-blue-50 border-r-2 border-blue-500 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className={`mr-3 ${isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}`}>
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className={`text-xs ${isActive ? 'text-blue-500' : 'text-gray-500'}`}>
                        {item.description}
                      </div>
                    </div>
                  </Link>
                )
              })}

              {/* Admin link - superadmin only */}
              {isSuperAdmin && (
                <Link
                  href="/admin"
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    pathname === '/admin'
                      ? 'bg-blue-50 border-r-2 border-blue-500 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className={`mr-3 ${pathname === '/admin' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Admin</div>
                    <div className={`text-xs ${pathname === '/admin' ? 'text-blue-500' : 'text-gray-500'}`}>
                      User management
                    </div>
                  </div>
                </Link>
              )}
            </nav>
          </div>

          {/* Bottom section */}
          <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 mb-2">Active Platforms</div>
            <div className="space-y-1">
              {[
                { name: 'Steam', color: '#1b2838', cooldown: '30d' },
                { name: 'PlayStation', color: '#0070d1', cooldown: '42d' },
                { name: 'Xbox', color: '#107c10', cooldown: '28d' },
                { name: 'Nintendo', color: '#e60012', cooldown: '56d' },
                { name: 'Epic', color: '#000000', cooldown: '14d' }
              ].map((platform) => (
                <div key={platform.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: platform.color }}
                    />
                    <span className="text-gray-600">{platform.name}</span>
                  </div>
                  <span className="text-gray-500">{platform.cooldown}</span>
                </div>
              ))}
            </div>
          </div>

          {/* User info & sign out */}
          {profile && (
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-700 truncate">
                    {profile.display_name || profile.email}
                  </div>
                  <div className="text-xs text-gray-500 capitalize">{profile.role}</div>
                </div>
                <button
                  onClick={signOut}
                  className="ml-2 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Sign out"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Sidebar
