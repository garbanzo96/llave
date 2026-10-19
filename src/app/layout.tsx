import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// Atkinson Hyperlegible fue diseñada para lectores con baja visión: clientes mayores y pantallas al sol.
const atkinson = Atkinson_Hyperlegible({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-atkinson" });

export const metadata: Metadata = {
  title: { default: "Llave", template: "%s · Llave" },
  description: "Servicios del hogar con personas verificadas: limpieza, jardinería, gasfitería, gas y electricidad.",
  applicationName: "Llave",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Leer los encabezados hace la página dinámica, requisito para el nonce de la CSP.
  await headers();
  return (
    <html lang="es-CL" className={atkinson.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
