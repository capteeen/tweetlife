/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['three'],
  experimental: { serverComponentsExternalPackages: ['bullmq', 'ioredis', '@prisma/client'] },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      { protocol: 'https', hostname: 'abs.twimg.com' },
    ],
  },
  async headers() {
    return [
      {
        // Worlds must embed in a tweet card iframe. Do not send X-Frame-Options; CSP governs framing.
        source: '/w/:path*',
        headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://*.x.com https://x.com https://*.twitter.com https://twitter.com https://*.twimg.com" }],
      },
    ];
  },
};
export default nextConfig;
