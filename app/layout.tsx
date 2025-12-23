import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GameDrive Sales Planning Tool',
  description: 'Professional game sales planning across Steam, PlayStation, Xbox, Nintendo, and Epic',
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
      <body className={`${inter.className} antialiased`}>
        <div className="min-h-screen bg-blue-50">
          {/* Test header to verify Tailwind works */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4">
            <h1 className="text-2xl font-bold">GameDrive Sales Planning - Tailwind Test</h1>
            <p className="text-blue-100">Testing if Tailwind CSS is working properly</p>
          </div>
          
          {/* Main Content */}
          <main className="p-6">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}