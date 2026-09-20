import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { poolSize } from "@/lib/pool";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });
/* Names and headlines only. A serif on a candidate's name is the single move
   that makes this read as a dossier rather than a CRM row. */
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sourcing — Flexiple",
  description: "Describe a role in plain English, then refine the search by talking to it.",
};

/* Applied before first paint, so an explicit dark choice never flashes the
   light palette. Only reads a stored choice — the system default needs no JS,
   because the CSS media query already handles it. */
const NO_FLASH = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${mono.variable} ${display.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="font-sans antialiased">
        {/* Mounted in the layout, not a page: App Router layouts do not remount
            across client navigation, so the search survives moving between
            /, /refine and /shortlist. */}
        <SessionProvider poolSize={poolSize()}>{children}</SessionProvider>
      </body>
    </html>
  );
}
