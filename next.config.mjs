/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma (and later Playwright) must stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", "prisma", "xlsx", "playwright-core"],
};

export default nextConfig;
