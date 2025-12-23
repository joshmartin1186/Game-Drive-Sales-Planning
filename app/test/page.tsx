export default function TestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-8">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Tailwind CSS Test</h1>
        <div className="space-y-4">
          <div className="w-full h-4 bg-blue-500 rounded"></div>
          <div className="w-3/4 h-4 bg-green-500 rounded"></div>
          <div className="w-1/2 h-4 bg-red-500 rounded"></div>
          <button className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 px-6 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all">
            If you can see colors and styling, Tailwind works!
          </button>
          <p className="text-sm text-gray-600 text-center">
            If this looks styled, the issue is with our components.<br/>
            If this is plain text, Tailwind isn't loading.
          </p>
        </div>
      </div>
    </div>
  )
}