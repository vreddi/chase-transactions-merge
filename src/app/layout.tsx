import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/ui/header";
import { Inter } from "next/font/google";

export const metadata: Metadata = {
  title: "Chase transactions merge",
  description:
    "💸 Merges the transactions from CSV to single table view because ChatGPT could not",
};

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="light">
        <Header />
        {children}
      </body>
    </html>
  );
}
