import Link from "next/link";

const links = [
  ["Overview", "/demo"],
  ["Dashboard", "/demo/dashboard"],
  ["Treidit", "/demo/trades"],
  ["Analytiikka", "/demo/analytics"],
  ["Review", "/demo/reviews"]
] as const;

export function DemoShell({ children }: { children: React.ReactNode }) {
  return <div className="demo-shell">
    <div className="demo-banner"><span>DEMO MODE</span><strong>Synthetic demo data · Read only</strong><Link href="/login">Avaa oikea journal</Link></div>
    <div className="demo-nav">
      <div><p className="eyebrow">PORTFOLIO DEMO</p><h1>Northstar Journal</h1></div>
      <nav aria-label="Demo navigation">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>
    </div>
    {children}
  </div>;
}
