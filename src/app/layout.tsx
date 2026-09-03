import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FactFrame V1.2 — Misteri Bersumber ke Video Pendek",
  description: "Hasilkan dokumentari misteri pendek yang bersumber, bernarasi dan sedia dimuat naik.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ms"><body className={`${geist.variable} ${mono.variable}`}>{children}</body></html>;
}
