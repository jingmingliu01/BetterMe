import type { ReactNode } from "react";
import { Brain, ShieldCheck } from "lucide-react";

export function AppShell({
  title,
  subtitle,
  children,
  compact = false
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <main className={compact ? "app app-compact" : "app"}>
      <header className="hero">
        <div className="brand-mark">
          <ShieldCheck size={22} />
          <span>BetterMe</span>
        </div>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <Brain className="hero-icon" size={44} />
      </header>
      {children}
    </main>
  );
}
