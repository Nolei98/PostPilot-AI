import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
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
        {/* Vercel Analytics (2026-07-30). É o mesmo script que o pacote
            @vercel/analytics injeta, colocado à mão porque o pacote
            arrasta um peer opcional do SvelteKit que conflita com o vite
            do vitest — uma tag <script> não vale um --legacy-peer-deps no
            lockfile inteiro. Só em produção: fora da Vercel o caminho
            /_vercel/insights/script.js dá 404 e sujaria o console do dev.
            Precisa de Analytics LIGADO no painel do projeto pra medir. */}
        {process.env.VERCEL_ENV === "production" && (
          <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
        )}
      </body>
    </html>
  );
}
