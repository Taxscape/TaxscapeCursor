/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  async redirects() {
    return [
      // Redirect apex domain to www
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'taxscape.ai',
          },
        ],
        destination: 'https://www.taxscape.ai/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

