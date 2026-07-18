import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "PostPilot",
  description: "Seu perfil posta sozinho. Você só aprova.",
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
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
