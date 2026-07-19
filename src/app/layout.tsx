import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

// El nombre de estas variables no es libre: globals.css las consume en su bloque
// `@theme inline` (`--font-sans: var(--font-jakarta)`). Si se renombran acá, la fuente
// deja de resolver y la página cae al fallback del navegador **sin que nada falle**.
//
// Plus Jakarta Sans es la tipografía aprobada para CLIDENT. next/font la descarga en
// build y la sirve desde el mismo dominio: no hay pedido a Google en runtime, no hay
// parpadeo al cargar y no depende de que una CDN externa siga en pie.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

// El monoespaciado se conserva a propósito y sólo se usa para dinero y horas: sus
// dígitos tienen el mismo ancho, así que una columna de montos queda alineada por el
// punto decimal sin trucos de CSS.
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
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
