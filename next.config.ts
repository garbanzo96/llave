import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Fotos de cédula y selfies desde el teléfono.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
