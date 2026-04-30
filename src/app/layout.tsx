import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../../public/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thor Operations Command",
  description: "Thor Operations Command beta"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="next-app">{children}</body>
    </html>
  );
}
