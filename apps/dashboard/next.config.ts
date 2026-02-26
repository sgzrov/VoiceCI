import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const apiUrl =
      process.env["INTERNAL_API_URL"] ||
      process.env["NEXT_PUBLIC_API_URL"] ||
      "http://localhost:3001";
    return [
      {
        source: "/backend/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
