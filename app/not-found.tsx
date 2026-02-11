export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '72px', fontWeight: 700, color: '#1a1a2e', marginBottom: '8px' }}>404</div>
        <div style={{ fontSize: '20px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Page Not Found</div>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <a href="/" style={{ display: 'inline-block', padding: '10px 24px', background: '#3b82f6', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
          Go Home
        </a>
      </div>
    </div>
  )
}
