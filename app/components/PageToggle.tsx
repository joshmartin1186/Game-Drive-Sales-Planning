'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './PageToggle.module.css'

export default function PageToggle() {
  const pathname = usePathname()
  
  const isPlanning = pathname === '/' || pathname === '/planning'
  const isAnalytics = pathname === '/analytics'
  
  return (
    <div className={styles.toggleContainer}>
      <div className={styles.toggleWrapper}>
        <Link 
          href="/" 
          className={`${styles.toggleOption} ${isPlanning ? styles.active : ''}`}
        >
          <svg className={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <span>Planning</span>
        </Link>
        <Link 
          href="/analytics" 
          className={`${styles.toggleOption} ${isAnalytics ? styles.active : ''}`}
        >
          <svg className={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>Analytics</span>
        </Link>
      </div>
    </div>
  )
}
