import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600"],
});

import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "FoolDB — SQL to Draw.io Live Editor",
  description: "Convert MySQL/MariaDB SQL DDL schemas into Draw.io (.drawio) XML files automatically. 100% offline, client-side, with ELK.js layout and Crow's Foot relations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body
        className={`${inter.variable} antialiased bg-background text-on-surface font-body-md min-h-dvh relative overflow-x-hidden selection:bg-primary-container selection:text-on-primary-container`}
      >
        {/* Atmospheric Background Layers */}
        <div className="fixed inset-0 z-[-1] pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[120%] h-[120%] bg-glow-radial opacity-50"></div>
          <div className="absolute top-[30%] right-[-20%] w-[800px] h-[800px] bg-glow-radial opacity-30"></div>
        </div>

        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
