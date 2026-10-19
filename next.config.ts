import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Las imágenes son privadas y se sirven por /api/files con autorización; el optimizador (sharp) queda apagado.
  images: { unoptimized: true },
  // Demo en Codespaces: el navegador llega por *.app.github.dev y next dev bloquea /_next desde otros orígenes.
  allowedDevOrigins: ["*.app.github.dev"],
  experimental: {
    // Fotos de cédula y selfies desde el teléfono.
    // Codespaces sirve la app detrás de un proxy (*.app.github.dev); sin esto Next rechaza las Server Actions por origen distinto.
    serverActions: { bodySizeLimit: "10mb", allowedOrigins: ["*.app.github.dev", "localhost:3000"] },
  },
};

export default nextConfig;
