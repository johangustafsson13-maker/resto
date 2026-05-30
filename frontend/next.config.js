/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
  async redirects() {
    return [
      // /search?q=... → /?q=... — /search retired in design-pass-v1 A4
      { source: '/search', destination: '/', permanent: true },
    ]
  },
}

module.exports = nextConfig
