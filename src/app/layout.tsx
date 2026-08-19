import type { Metadata } from "next";
import {
  Chakra_Petch,
  Heebo,
  IBM_Plex_Mono,
  Instrument_Sans,
} from "next/font/google";
import { getSetting } from "@/core/app-settings";
import { themeAttr } from "@/core/theme";
import "./globals.css";

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Hebrew face (exposed as --font-hebrew so swapping it is a one-line change).
// Latin text still uses the fonts above; Hebrew glyphs (absent from them) fall
// through to this face via the font-family stacks in globals.css — so Hebrew
// renders crisply instead of in the generic system font.
const hebrew = Heebo({
  variable: "--font-hebrew",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "apOS — Agentic Personalized Operating System",
  description:
    "One intelligent workspace: tasks, projects, notes, content and autonomous AI agents.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Apply the saved appearance theme at SSR so there's no flash. Resilient: any
  // failure (e.g. DB not ready during build) falls back to the default look.
  const theme = await getSetting("theme").catch(() => null);
  const attr = themeAttr(theme);
  return (
    <html
      lang="en"
      data-theme={attr || undefined}
      className={`${chakra.variable} ${instrument.variable} ${plexMono.variable} ${hebrew.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
