import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Barsy Analytics — Зареждания",
  description: "Анализ на СКЛАД → ЗАРЕЖДАНИЯ по доставчик и артикул",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <body>{children}</body>
    </html>
  );
}
