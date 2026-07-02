import type { Metadata } from "next";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Barsy Analytics — Зареждания",
  description: "Анализ на СКЛАД → ЗАРЕЖДАНИЯ по доставчик и артикул",
};

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <body>
      {hasClerk && (
        <div className="userbar">
          <UserButton />
        </div>
      )}
      {children}
    </body>
  );
  return (
    <html lang="bg">
      {hasClerk ? <ClerkProvider>{body}</ClerkProvider> : body}
    </html>
  );
}
