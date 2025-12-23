'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const pathname = usePathname()

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo and brand */}
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                <span className="text-white font-bold text-sm">GD</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                Game<span className="text-blue-600">Drive</span>
              </h1>
            </div>
          </div>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link 
              href="/" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === '/' 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Dashboard
            </Link>
            <Link 
              href="/planner" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === '/planner' 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Sales Planner
            </Link>
            <Link 
              href="/analytics" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === '/analytics' 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Analytics
            </Link>
          </div>

          {/* User menu */}
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">
              Utrecht, Netherlands
            </div>
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-gray-600 text-xs font-medium">A</span>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-500 hover:text-gray-700 focus:outline-none"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} 
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-gray-200 py-4">
            <div className="space-y-2">
              <Link 
                href="/" 
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-blue-600"
              >
                Dashboard
              </Link>
              <Link 
                href="/planner" 
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-blue-600"
              >
                Sales Planner
              </Link>
              <Link 
                href="/analytics" 
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-blue-600"
              >
                Analytics
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}