import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Las imágenes son privadas y se sirven por /api/files con autorización; el optimizador (sharp) queda apagado.
  images: { unoptimized: true },
  experimental: {
    // Fotos de cédula y selfies desde el teléfono.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
