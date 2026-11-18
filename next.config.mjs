/** @type {import('next').NextConfig} */
const nextConfig = {
  // The HarnessRouter API key is read only in server code (Node runtime route handlers),
  // never exposed to the browser. Do not add it to `env` or any NEXT_PUBLIC_ name.
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
