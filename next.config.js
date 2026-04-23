/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-lib", "@pdf-lib/standard-fonts", "jszip", "exceljs"],
  },
};

module.exports = nextConfig;
