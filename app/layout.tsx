import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prometheus",
  description: "Greek DAM battery intelligence cockpit",
  icons: {
    icon: "/prometheus-icon.png",
    apple: "/prometheus-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        style={
          {
            "--font-ui": "Inter",
            "--font-mono": "IBM Plex Mono",
            fontFamily: "var(--font-ui), system-ui, sans-serif",
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
