'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SidebarProps {
  collapsed?: boolean
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname()

  // Only show settings/management items - Planning/Analytics handled by center toggle
  const navItems = [
    {
      name: 'Client Management',
      href: '/clients',
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
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
      description: 'Steam API keys'
    }
  ]

  const platforms = [
    { name: 'Steam', color: '#1b2838', cooldown: '30d' },
    { name: 'PlayStation', color: '#0070d1', cooldown: '42d' },
    { name: 'Xbox', color: '#107c10', cooldown: '28d' },
    { name: 'Nintendo', color: '#e60012', cooldown: '56d' },
    { name: 'Epic', color: '#000000', cooldown: '14d' }
  ]

  if (collapsed) {
    return (
      <div className="flex flex-col w-16 bg-white border-r border-gray-200">
        <div className="flex flex-col flex-grow pt-5 pb-4">
          <nav className="flex-1 px-2 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center justify-center p-3 rounded-md transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  title={item.name}
                >
                  <div className={isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}>
                    {item.icon}
                  </div>
                </Link>
              )
            })}
          </nav>

          {/* Collapsed platform indicators */}
          <div className="flex-shrink-0 px-2 py-4 border-t border-gray-200">
            <div className="space-y-2">
              {platforms.map((platform) => (
                <div 
                  key={platform.name} 
                  className="flex justify-center"
                  title={`${platform.name}: ${platform.cooldown} cooldown`}
                >
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: platform.color }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-64 bg-white border-r border-gray-200">
      <div className="flex flex-col flex-grow pt-5 pb-4">
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
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
        </nav>

        {/* Bottom section - Platform overview */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-2 font-medium">Platform Cooldowns</div>
          <div className="space-y-1">
            {platforms.map((platform) => (
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
      </div>
    </div>
  )
}

export default Sidebar
