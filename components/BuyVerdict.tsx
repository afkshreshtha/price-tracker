import { useMemo } from "react";

interface PriceRecord {
  date: string;
  current_price: number;
}

interface BuyVerdictProps {
  currentPrice: number;
  history?: PriceRecord[];
}

export default function BuyVerdict({ currentPrice, history }: BuyVerdictProps) {
  const verdict = useMemo(() => {
    // We need at least 2 data points to make a judgment
    if (!history || history.length < 2) return null;

    const prices = history.map((h) => h.current_price);
    const minPrice = Math.min(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    if (currentPrice <= minPrice) {
      return {
        badge: "BUY NOW",
        title: "Lowest Price Tracked",
        description: "This is the best time to buy. The price has never been lower in our records.",
        color: "text-emerald-400",
        bg: "bg-emerald-950/30",
        border: "border-emerald-900",
        glow: "shadow-[0_0_15px_rgba(52,211,153,0.1)]",
      };
    }

    if (currentPrice < avgPrice) {
      return {
        badge: "GOOD DEAL",
        title: "Below Average Price",
        description: "It's a solid deal right now, though we have seen it dip slightly lower in the past.",
        color: "text-amber-400",
        bg: "bg-amber-950/30",
        border: "border-amber-900",
        glow: "shadow-[0_0_15px_rgba(251,191,36,0.1)]",
      };
    }

    return {
      badge: "WAIT",
      title: "Price is Currently High",
      description: "Do not buy this right now. The price is inflated compared to its historical average.",
      color: "text-rose-400",
      bg: "bg-rose-950/30",
      border: "border-rose-900",
      glow: "shadow-[0_0_15px_rgba(251,113,133,0.1)]",
    };
  }, [currentPrice, history]);

  if (!verdict) return null;

  return (
    <div className={`mt-8 p-6 rounded-2xl border ${verdict.border} ${verdict.bg} ${verdict.glow} transition-all duration-500`}>
      <div className="flex items-center gap-4 mb-2">
        <span className={`px-3 py-1 rounded-full text-xs font-black tracking-widest bg-black/50 ${verdict.color} border ${verdict.border}`}>
          {verdict.badge}
        </span>
        <h4 className={`font-bold tracking-tight ${verdict.color}`}>
          {verdict.title}
        </h4>
      </div>
      <p className="text-zinc-400 text-sm font-light leading-relaxed">
        {verdict.description}
      </p>
    </div>
  );
}