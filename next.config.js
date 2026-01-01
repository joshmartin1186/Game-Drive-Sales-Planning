/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'cdn.akamai.steamstatic.com', 
      'steamcdn-a.akamaihd.net',
      'shared.akamai.steamstatic.com'
    ],
  },
}

module.exports = nextConfig
