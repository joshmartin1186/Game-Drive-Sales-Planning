export default function HomePage() {
  return (
    <div>
      {/* Most basic Tailwind test */}
      <div className="bg-red-500 p-8 m-4 text-white text-center">
        <h1 className="text-4xl font-bold">🔥 TAILWIND TEST 🔥</h1>
        <p className="text-xl mt-4">If this has a red background and large text, Tailwind is working!</p>
      </div>

      {/* Secondary test */}
      <div className="bg-blue-600 p-6 m-4 text-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-semibold">Secondary Test</h2>
        <p className="mt-2">Blue background + rounded corners + shadow</p>
      </div>

      {/* Grid test */}
      <div className="grid grid-cols-3 gap-4 p-4">
        <div className="bg-green-500 h-20 rounded flex items-center justify-center text-white font-bold">
          Green
        </div>
        <div className="bg-yellow-500 h-20 rounded flex items-center justify-center text-white font-bold">
          Yellow  
        </div>
        <div className="bg-purple-500 h-20 rounded flex items-center justify-center text-white font-bold">
          Purple
        </div>
      </div>

      {/* Text size test */}
      <div className="p-4 space-y-2">
        <div className="text-xs">Extra Small Text (text-xs)</div>
        <div className="text-sm">Small Text (text-sm)</div>
        <div className="text-base">Base Text (text-base)</div>
        <div className="text-lg">Large Text (text-lg)</div>
        <div className="text-xl">Extra Large Text (text-xl)</div>
        <div className="text-2xl font-bold">2XL Bold Text (text-2xl)</div>
      </div>

      {/* Debug info */}
      <div className="p-4 bg-gray-100 border-l-4 border-blue-500 m-4">
        <h3 className="font-bold text-lg">Debug Information</h3>
        <ul className="mt-2 space-y-1 text-sm">
          <li>• If you see styled boxes with colors: ✅ Tailwind is working</li>
          <li>• If everything looks plain/unstyled: ❌ CSS compilation issue</li>
          <li>• Red box should be very obvious if working</li>
        </ul>
      </div>
    </div>
  )
}