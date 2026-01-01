/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force clean rebuild: 2026-01-01T19:15:00Z
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
  images: {
    domains: [
      'cdn.akamai.steamstatic.com', 
      'steamcdn-a.akamaihd.net',
      'shared.akamai.steamstatic.com'
    ],
  },
}

module.exports = nextConfig
