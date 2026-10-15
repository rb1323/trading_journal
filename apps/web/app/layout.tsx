import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northstar Journal",
  description: "DAS Trader live import and trading journal"
};

const navigation = [
  ["Demo", "/demo"],
  ["Dashboard", "/dashboard"],
  ["Treidit", "/trades"],
  ["Review", "/review"],
  ["Positiot", "/positions"],
  ["Executionit", "/executions"],
  ["Importit", "/imports"],
  ["DAS Sync", "/settings/sync"]
] as const;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fi">
      <body>
        <header className="topbar">
          <Link href="/trades" className="brand"><span>NORTHSTAR</span> JOURNAL</Link>
          <nav>{navigation.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</nav>
          <form action="/auth/signout" method="post"><button className="ghost" type="submit">Kirjaudu ulos</button></form>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
