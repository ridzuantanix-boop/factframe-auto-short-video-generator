import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pawarna — Auto Video Factory",
  description: "Upload produk dan avatar pilihan. Pawarna kenal pasti, selidik dan jana video affiliate Bahasa Melayu.",
  applicationName: "Pawarna",
  appleWebApp: { capable: true, title: "Pawarna", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#fafbf7", colorScheme: "light", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ms"><body className={`${geist.variable} ${mono.variable}`}>{children}</body></html>;
}
