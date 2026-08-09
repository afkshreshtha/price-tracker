"use client";

import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [product, setProduct] = useState<any>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProduct(null);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (data.success) {
        setProduct(data);
      } else {
        setError(data.message || "Failed to fetch product details.");
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white selection:bg-zinc-800 font-sans p-6 md:p-24">
      <div className="max-w-3xl mx-auto space-y-12">
        {/* Header Section */}
        <div className="space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Track Prices. <br />
            <span className="text-zinc-500">Catch Fake Deals.</span>
          </h1>
          {/* UPDATE THIS LINE: */}
          <p className="text-zinc-400 text-lg max-w-xl">
            Paste an Amazon or Flipkart link below. We bypass the marketing to
            show you the real numbers and save it to your history.
          </p>
        </div>

        {/* Search Form */}
        <form
          onSubmit={handleSearch}
          className="flex flex-col md:flex-row gap-4"
        >
          <input
            type="url"
            required
            placeholder="Paste Amazon or Flipkart link here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 text-white px-6 py-4 rounded-lg focus:outline-none focus:border-white transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-white text-black font-semibold px-8 py-4 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? "Scraping..." : "Analyze Deal"}
          </button>
        </form>

        {/* Error State */}
        {error && (
          <div className="border border-red-900 bg-red-950/30 text-red-400 px-6 py-4 rounded-lg">
            {error}
          </div>
        )}

        {/* Result Card */}
        {product && (
          <div className="border border-zinc-800 rounded-xl p-8 space-y-6 bg-zinc-950/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-start gap-4">
              <h2 className="text-2xl font-semibold leading-snug">
                {product.productName}
              </h2>
              {/* Discount Badge */}
              <span className="bg-white text-black px-4 py-1 rounded-full text-sm font-bold whitespace-nowrap">
                {product.claimedDiscount}
              </span>
            </div>

            <div className="flex items-baseline gap-4">
              <span className="text-5xl font-bold tracking-tight">
                ₹{product.currentPrice.toLocaleString("en-IN")}
              </span>
              {product.originalPrice > product.currentPrice && (
                <span className="text-xl text-zinc-500 line-through">
                  ₹{product.originalPrice.toLocaleString("en-IN")}
                </span>
              )}
            </div>

            <div className="border-t border-zinc-800 pt-6">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                About this item
              </h3>
              <p className="text-zinc-300 leading-relaxed text-sm">
                {product.description.length > 300
                  ? product.description.substring(0, 300) + "..."
                  : product.description}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
