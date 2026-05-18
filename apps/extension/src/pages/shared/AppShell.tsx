import type { ReactNode } from "react";

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
        <div className="hero-copy">
          <div className="brand-mark">
            <img className="brand-icon" src="/icon.svg" alt="" aria-hidden="true" />
            <span>BetterMe</span>
          </div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>
      {children}
    </main>
  );
}
