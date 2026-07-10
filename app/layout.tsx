import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CotorreadoAI 🦜",
  description: "El loro que te sopla las respuestas en vivo para tus entrevistas",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CotorreadoAI",
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

