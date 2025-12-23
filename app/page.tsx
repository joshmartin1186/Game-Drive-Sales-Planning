'use client'

import { useState } from 'react'
import GanttChart from './components/GanttChart'

export default function Home() {
  const [currentView, setCurrentView] = useState<'planning' | 'analytics'>('planning')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales Planning Dashboard</h1>
          <p className="text-muted-foreground">
            Manage game sales across Steam, PlayStation, Xbox, Nintendo, and Epic
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentView('planning')}
            className={`px-4 py-2 rounded-md transition-colors ${
              currentView === 'planning'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            Planning
          </button>
          <button
            onClick={() => setCurrentView('analytics')}
            className={`px-4 py-2 rounded-md transition-colors ${
              currentView === 'analytics'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            Analytics
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="rounded-lg border bg-card p-6">
        {currentView === 'planning' ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Interactive Sales Timeline</h2>
            <p className="text-muted-foreground">
              Drag-and-drop Gantt chart for scheduling sales across all platforms
            </p>
            
            {/* Interactive Gantt Chart */}
            <GanttChart />
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Sales Analytics</h2>
            <p className="text-muted-foreground">
              Performance metrics and Steam API integration
            </p>
            
            {/* Placeholder for Analytics */}
            <div className="h-96 rounded-md border border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900">Analytics Dashboard</h3>
                <p className="text-gray-500 mt-2">Steam API integration and performance charts</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Add New Sale</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Schedule a new sale with automatic cooldown validation
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Check Conflicts</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Validate current schedule against platform rules
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Export to Excel</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Download current schedule in Excel format
          </p>
        </div>
      </div>
    </div>
  )
}
