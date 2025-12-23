import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GameDrive Sales Planner',
  description: 'Visual sales planning tool for game publishers with platform cooldown management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
          <nav className="bg-white shadow-lg border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <h1 className="text-2xl font-bold text-gray-900">
                      Game<span className="text-blue-600">Drive</span>
                    </h1>
                  </div>
                  <div className="ml-10 flex items-baseline space-x-4">
                    <a href="/" className="text-gray-900 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                      Dashboard
                    </a>
                    <a href="/planner" className="text-gray-900 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                      Sales Planner
                    </a>
                    <a href="/analytics" className="text-gray-900 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">
                      Analytics
                    </a>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-gray-600">
                    Utrecht, Netherlands
                  </span>
                </div>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}