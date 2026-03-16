import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ALISSON | Gestão de Fábrica",
  description: "Sistema de gestão de produção — Joalheria ALISSON",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.leaoverde.webp",
    apple: "/logo.leaoverde.webp",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ALISSON",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${jetbrains.variable} ${playfair.variable}`}
    >
      <head>
        <meta name="theme-color" content="#184036" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="antialiased">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}`,
          }}
        />
      </body>
    </html>
  );
}
