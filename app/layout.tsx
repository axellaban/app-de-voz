import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loreado.ia 🦜",
  description: "Asistente de respuestas en tiempo real para llamadas",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Loreado.ia",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#040d0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
