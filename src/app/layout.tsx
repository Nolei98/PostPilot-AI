import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "PostPilot AI",
  description: "Seu perfil de IA posta sozinho. Você só aprova.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      {/* Cores/fonte vêm do design system (globals.css) */}
      <body className={geistSans.variable}>
        {children}
      </body>
    </html>
  );
}
