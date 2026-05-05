import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ICRA",
  description: "Intelligent Code Review Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): ReactElement {
  return (
    <html lang="en">
      <body className={mono.variable}>{children}</body>
    </html>
  );
}
