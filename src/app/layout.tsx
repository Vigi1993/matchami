import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "MatchAmI",
  description: "Il nuovo modo di affittare casa.",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MatchAmI",
  },
};

// Stesse impostazioni del <meta viewport> del prototipo: niente zoom,
// contenuto esteso fino ai bordi dello schermo.
export const viewport: Viewport = {
  themeColor: "#10151A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className="h-full antialiased">
      <body className="h-full">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
