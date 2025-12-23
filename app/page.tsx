export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* DEPLOYMENT TEST - SHOULD BE VISIBLE */}
      <div className="bg-red-500 text-white p-6 rounded-lg shadow-lg border-4 border-red-600">
        <h2 className="text-2xl font-bold text-center">
          🚨 DEPLOYMENT TEST - If you see this styled, Tailwind is working! 🚨
        </h2>
        <p className="text-center mt-2 text-red-100">
          This should have red background, white text, padding, and rounded corners.
        </p>
      </div>

      {/* Test Tailwind Styling */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 transform hover:scale-105 transition-transform">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">📊</span>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold text-gray-900">Total Revenue</h3>
              <p className="text-3xl font-bold text-green-600">$42,500</p>
            </div>
          </div>
          <p className="text-gray-600 text-sm">This month vs last month</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 transform hover:scale-105 transition-transform">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">📈</span>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold text-gray-900">Units Sold</h3>
              <p className="text-3xl font-bold text-blue-600">1,247</p>
            </div>
          </div>
          <p className="text-gray-600 text-sm">Across all platforms</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 transform hover:scale-105 transition-transform">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">⭐</span>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold text-gray-900">Conversion Rate</h3>
              <p className="text-3xl font-bold text-purple-600">18.2%</p>
            </div>
          </div>
          <p className="text-gray-600 text-sm">Average across all sales</p>
        </div>
      </div>

      {/* Simple Sales Timeline Mockup */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white">Sales Timeline - Simplified View</h2>
          <p className="text-blue-100">Interactive Gantt chart coming soon...</p>
        </div>
        
        <div className="p-6">
          {/* Timeline Header */}
          <div className="grid grid-cols-12 gap-2 mb-4">
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => (
              <div key={month} className={`text-center p-2 rounded-lg text-sm font-medium ${
                index % 2 === 0 ? 'bg-gray-100 text-gray-700' : 'bg-blue-50 text-blue-700'
              }`}>
                {month} 2025
              </div>
            ))}
          </div>

          {/* Sample Game Rows */}
          <div className="space-y-3">
            {/* shapez */}
            <div className="flex items-center">
              <div className="w-48 flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                  S
                </div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">shapez</div>
                  <div className="text-xs text-gray-500">Base Game</div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-12 gap-2 h-8">
                <div className="col-start-3 col-span-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                  Steam 50%
                </div>
                <div className="col-start-7 col-span-2 bg-gradient-to-r from-green-500 to-green-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                  Xbox 30%
                </div>
              </div>
            </div>

            {/* shapez 2 */}
            <div className="flex items-center">
              <div className="w-48 flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                  S2
                </div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">shapez 2</div>
                  <div className="text-xs text-gray-500">New Release</div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-12 gap-2 h-8">
                <div className="col-start-5 col-span-2 bg-gradient-to-r from-red-500 to-red-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                  PS 25%
                </div>
                <div className="col-start-9 col-span-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                  Steam 40%
                </div>
              </div>
            </div>

            {/* Tricky Towers */}
            <div className="flex items-center">
              <div className="w-48 flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                  TT
                </div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">Tricky Towers</div>
                  <div className="text-xs text-gray-500">Established Game</div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-12 gap-2 h-8">
                <div className="col-start-2 col-span-2 bg-gradient-to-r from-green-500 to-green-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                  Xbox 35%
                </div>
                <div className="col-start-6 col-span-2 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                  Epic 45%
                </div>
              </div>
            </div>
          </div>

          {/* Platform Legend */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-600 rounded"></div>
                <span className="text-gray-700">Steam (30d cooldown)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-600 rounded"></div>
                <span className="text-gray-700">PlayStation (42d cooldown)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-600 rounded"></div>
                <span className="text-gray-700">Xbox (28d cooldown)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-purple-600 rounded"></div>
                <span className="text-gray-700">Epic (14d cooldown)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-transform cursor-pointer">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <span className="text-2xl">➕</span>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-bold">Add New Sale</h3>
              <p className="text-blue-100 text-sm">Schedule with automatic validation</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-transform cursor-pointer">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-bold">Check Conflicts</h3>
              <p className="text-yellow-100 text-sm">Validate platform cooldowns</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-transform cursor-pointer">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-bold">Export to Excel</h3>
              <p className="text-green-100 text-sm">Download current schedule</p>
            </div>
          </div>
        </div>
      </div>

      {/* Success Message */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-3xl">✅</span>
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-bold text-green-800">Deployment Pipeline Fixed!</h3>
            <p className="text-green-700 mt-1">
              GitHub → Vercel deployments are now working correctly. Next step: Add back the interactive Gantt chart component.
            </p>
            <div className="mt-3 text-sm text-green-600">
              <strong>What's working:</strong> Tailwind CSS compilation, responsive design, modern UI components
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}