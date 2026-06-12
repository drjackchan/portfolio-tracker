import React, { useState } from "react";

const ASSET_TYPE_COLORS: Record<string, string> = {
  stock: "hsl(var(--chart-2))",
  crypto: "hsl(var(--chart-3))",
  property: "hsl(var(--chart-4))",
  cash: "hsl(var(--chart-1))",
  other: "hsl(var(--chart-5))",
  commodity: "hsl(var(--chart-6))",
};

interface TickerLogoProps {
  ticker?: string | null;
  name?: string;
  logoUrl?: string | null;
  assetType: string;
  className?: string;
  /** Size in pixels (default 28 for desktop rows) */
  size?: number;
}

export function TickerLogo({
  ticker,
  name,
  logoUrl,
  assetType,
  className = "",
  size = 28,
}: TickerLogoProps) {
  const [imgError, setImgError] = useState(false);

  const showLogo = !!logoUrl && !imgError;

  const letter = (ticker || name || "??").slice(0, 3).toUpperCase();
  const bg = ASSET_TYPE_COLORS[assetType] ?? "#555";

  const style: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
  };

  const baseClasses = `rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden ${className}`;

  if (showLogo) {
    return (
      <div
        className={`${baseClasses} bg-muted/10 ring-1 ring-border/60`}
        style={style}
        title={ticker || name || undefined}
      >
        <img
          src={logoUrl!}
          alt={ticker || name || "logo"}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback to colored letter badge (original behavior)
  return (
    <div
      className={`${baseClasses} text-[9px] font-bold text-white`}
      style={{ ...style, background: bg }}
      title={ticker || name || undefined}
    >
      {letter}
    </div>
  );
}
