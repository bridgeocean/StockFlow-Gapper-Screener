import "./globals.css";
import type { ReactNode } from "react";
import SiteHeader from "./components/SiteHeader";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
