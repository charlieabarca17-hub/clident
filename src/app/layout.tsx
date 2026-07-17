import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// El nombre de estas variables no es libre: globals.css las consume en su bloque
// `@theme inline` (`--font-sans: var(--font-geist-sans)`). Si se renombran acá, la fuente
// deja de resolver y la página cae al fallback del navegador **sin que nada falle**.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CLIDENT",
  description: "Sistema de gestión para clínicas odontológicas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
