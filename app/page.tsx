export default function HomePage() {
  return (
    <div>
      {/* Direct CSS test - bypass Tailwind completely */}
      <div style={{
        backgroundColor: '#ef4444',
        padding: '32px',
        margin: '16px',
        color: 'white',
        textAlign: 'center',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{fontSize: '36px', fontWeight: 'bold'}}>
          🔥 DIRECT CSS TEST 🔥
        </h1>
        <p style={{fontSize: '20px', marginTop: '16px'}}>
          If this is red and styled, CSS works but Tailwind doesn't!
        </p>
      </div>

      {/* Secondary CSS test */}
      <div style={{
        backgroundColor: '#2563eb',
        padding: '24px',
        margin: '16px',
        color: 'white',
        borderRadius: '12px'
      }}>
        <h2 style={{fontSize: '24px', fontWeight: '600'}}>Direct CSS Secondary Test</h2>
        <p style={{marginTop: '8px'}}>Blue background with inline styles</p>
      </div>

      {/* CSS Grid test */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '16px',
        padding: '16px'
      }}>
        <div style={{
          backgroundColor: '#10b981',
          height: '80px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold'
        }}>
          Green Box
        </div>
        <div style={{
          backgroundColor: '#eab308',
          height: '80px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold'
        }}>
          Yellow Box
        </div>
        <div style={{
          backgroundColor: '#8b5cf6',
          height: '80px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold'
        }}>
          Purple Box
        </div>
      </div>

      {/* Diagnosis */}
      <div style={{
        padding: '16px',
        backgroundColor: '#f3f4f6',
        borderLeft: '4px solid #3b82f6',
        margin: '16px'
      }}>
        <h3 style={{fontWeight: 'bold', fontSize: '18px'}}>Diagnosis</h3>
        <ul style={{marginTop: '8px', fontSize: '14px', lineHeight: '1.5'}}>
          <li>• If you see red/blue/colored boxes: ✅ CSS works, Tailwind is the problem</li>
          <li>• If still plain text: ❌ Deeper CSS compilation issue</li>
          <li>• This bypasses Tailwind completely using inline styles</li>
        </ul>
      </div>
    </div>
  )
}