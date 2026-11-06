import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Atlas · Sua carteira, por inteiro",
  description: "Carteira global, aportes e notícias dos seus ativos.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
