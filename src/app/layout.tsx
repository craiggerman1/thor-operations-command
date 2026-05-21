import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShellRouter } from "@/components/AppShellRouter";
import "leaflet/dist/leaflet.css";
import "../../public/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thor Operations Command",
  description: "Thor Operations Command beta"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="next-app">
        <AppShellRouter>{children}</AppShellRouter>
      </body>
    </html>
  );
}
