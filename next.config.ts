import type { NextConfig } from 'next'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const allowedHost = new URL(appUrl).host

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Lê de NEXT_PUBLIC_APP_URL para funcionar em dev/preview/produção.
      allowedOrigins: [allowedHost],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

export default nextConfig
