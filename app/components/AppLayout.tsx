'use client'

import { useState, useEffect } from 'react'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Persist sidebar state in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed')
    if (saved !== null) {
      setSidebarCollapsed(saved === 'true')
    }
  }, [])

  const handleToggleSidebar = () => {
    const newValue = !sidebarCollapsed
    setSidebarCollapsed(newValue)
    localStorage.setItem('sidebarCollapsed', String(newValue))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar 
        onToggleSidebar={handleToggleSidebar} 
        sidebarCollapsed={sidebarCollapsed} 
      />
      <div className="flex">
        <Sidebar collapsed={sidebarCollapsed} />
        <main className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-0' : 'ml-0'}`}>
          {children}
        </main>
      </div>
    </div>
  )
}

export default AppLayout
