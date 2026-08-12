"use client";

import { useState, FormEvent } from "react";

interface FirstTrackerCardProps {
  productId: string | number;
  hasHistory?: boolean; // NEW: Tell the card if history exists
}

export default function FirstTrackerCard({ productId, hasHistory = false }: FirstTrackerCardProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubscribe = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productId }),
      });

      const data = await res.json();
      
      if (data.success) {
        setStatus("success");
        setMessage(data.message);
      } else {
        setStatus("error");
        setMessage(data.message);
      }
    } catch (error) {
      setStatus("error");
      setMessage("Failed to connect. Please try again.");
    }
  };

  return (
    <div className="mt-8 p-8 rounded-2xl border border-zinc-800 bg-gradient-to-br from-[#121212] to-black shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
      
      <div className="relative z-10 space-y-4">
        <div className="inline-block bg-white text-black px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase mb-2">
          {hasHistory ? "Get Price Alerts 🔔" : "Target Acquired 🎯"}
        </div>
        
        <h3 className="text-2xl font-bold text-white tracking-tight">
          {hasHistory ? "Never miss a price drop." : "You are the first to track this item!"}
        </h3>
        
        <p className="text-zinc-400 font-light leading-relaxed">
          {hasHistory 
            ? "Drop your email below, and our automated system will instantly alert you the moment the price drops again."
            : "We don't have historical data for this product yet, but our systems are now monitoring it daily. Drop your email below, and we'll alert you on the first price drop."
          }
        </p>
        
        {status === "success" ? (
          <div className="mt-4 p-4 bg-emerald-950/30 border border-emerald-900 rounded-xl text-emerald-400 font-medium">
            ✅ {message}
          </div>
        ) : (
          <form className="flex flex-col sm:flex-row gap-3 pt-4" onSubmit={handleSubscribe}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address..."
              required
              className="flex-1 bg-black border border-zinc-700 text-white px-5 py-3 rounded-xl focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all placeholder:text-zinc-600"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="bg-white text-black font-bold px-8 py-3 rounded-xl hover:bg-zinc-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] whitespace-nowrap disabled:opacity-50"
            >
              {status === "loading" ? "Saving..." : "Alert Me"}
            </button>
          </form>
        )}
        
        {status === "error" && (
          <p className="text-rose-400 text-sm mt-2">{message}</p>
        )}
      </div>
    </div>
  );
}