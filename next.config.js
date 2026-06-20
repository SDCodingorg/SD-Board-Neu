/** @type {import('next').NextConfig} */
const serverActionAllowedOrigins = (process.env.SERVER_ACTION_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const nextConfig = {
  output: 'standalone',
  ...(process.env.DEPLOYMENT_VERSION ? { deploymentId: process.env.DEPLOYMENT_VERSION } : {}),
  ...(serverActionAllowedOrigins.length
    ? {
        experimental: {
          serverActions: { allowedOrigins: serverActionAllowedOrigins },
        },
      }
    : {}),
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

module.exports = nextConfig
