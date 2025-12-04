import type { Metadata } from "next";
import { Inter, Jura } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/components/providers/Web3Provider";

const inter = Inter({ subsets: ["latin"] });
const jura = Jura({ subsets: ["latin"], variable: "--font-jura" });

export const metadata: Metadata = {
  title: "Digital Monetary Framework - Stability Meets Growth",
  description: "Transparent, secure, and fully backed token protocol",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${jura.variable}`}>
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}

