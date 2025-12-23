'use client'

import { useState } from 'react'
import GanttChart from './components/GanttChart'

export default function Home() {
  const [currentView, setCurrentView] = useState<'planning' | 'analytics'>('planning')

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales Planning Timeline</h1>
            <p className="text-gray-600 mt-1">
              Interactive Gantt chart with automatic cooldown validation across all platforms
            </p>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setCurrentView('planning')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                currentView === 'planning'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📅 Planning
            </button>
            <button
              onClick={() => setCurrentView('analytics')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                currentView === 'analytics'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📊 Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {currentView === 'planning' ? (
        <div className="space-y-4">
          {/* Interactive Gantt Chart */}
          <GanttChart />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Steam Analytics Dashboard</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Performance metrics, revenue tracking, and Steam API integration will be available here in Phase 2
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600 mb-1">$42.5K</div>
                <div className="text-sm text-gray-600">Last Month Revenue</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600 mb-1">1,247</div>
                <div className="text-sm text-gray-600">Units Sold</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-600 mb-1">18%</div>
                <div className="text-sm text-gray-600">Conversion Rate</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Add New Sale</h3>
          </div>
          <p className="text-sm text-gray-600">
            Schedule a new sale with automatic cooldown validation
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center mb-2">
            <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Check Conflicts</h3>
          </div>
          <p className="text-sm text-gray-600">
            Validate current schedule against platform rules
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center mb-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Export to Excel</h3>
          </div>
          <p className="text-sm text-gray-600">
            Download current schedule in Excel format
          </p>
        </div>
      </div>
    </div>
  )
}