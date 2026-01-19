'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Settings page error:', error);
  }, [error]);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ color: '#ef4444' }}>Settings Page Error</h2>
      <details style={{ marginTop: '20px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          Error Details
        </summary>
        <pre style={{
          marginTop: '10px',
          padding: '10px',
          background: '#f5f5f5',
          overflow: 'auto',
          fontSize: '12px'
        }}>
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
      </details>
      <button
        onClick={reset}
        style={{
          marginTop: '20px',
          padding: '10px 20px',
          background: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer'
        }}
      >
        Try again
      </button>
    </div>
  );
}
