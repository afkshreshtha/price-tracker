"use client";

import { useState, FormEvent } from "react";
import PriceGraph from "@/components/PriceGraph";
import BuyVerdict from "@/components/BuyVerdict";
import FirstTrackerCard from "@/components/FirstTrackerCard";

interface ProductData {
  productName: string;
  currentPrice: number;
  originalPrice: number;
  claimedDiscount: string;
  description: string;
  imageUrls?: string[];
}
interface ProductData {
  id: string | number;
  productName: string;
  currentPrice: number;
  originalPrice: number;
  claimedDiscount: string;
  description: string;
  imageUrls?: string[];
  history?: { date: string; current_price: number }[]; // Added history
}
export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [product, setProduct] = useState<ProductData | null>(null);
  console.log(product);
  // New state to manage the main featured image in the gallery
  const [activeImage, setActiveImage] = useState<string>("");

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProduct(null);
    setActiveImage("");

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (data.success) {
        setProduct(data);
        // Set the first image as the active featured image
        if (data.imageUrls && data.imageUrls.length > 0) {
          setActiveImage(data.imageUrls[0]);
        }
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
    <main className="min-h-screen bg-black text-white selection:bg-zinc-800 font-sans p-6 md:p-12 lg:p-16">
      {/* Container expands from 4xl to 7xl when a product is loaded for that "full page" feel */}
      <div
        className={`mx-auto space-y-12 transition-all duration-700 ${product ? "max-w-7xl" : "max-w-4xl mt-24"}`}
      >
        {/* Header Section */}
        <div className="space-y-4 text-center md:text-left">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-white">
            Track Prices. <br />
            <span className="text-zinc-600">Catch Fake Deals.</span>
          </h1>
          {/* Updated Copy for Universal Scraping */}
          <p className="text-zinc-400 text-lg md:text-xl max-w-2xl font-light">
            Paste a link from Amazon, Flipkart, Myntra, Croma, or any major
            store. We bypass the marketing to show you the real numbers.
          </p>
        </div>

        {/* Search Form */}
        <form
          onSubmit={handleSearch}
          className="flex flex-col md:flex-row gap-4 relative"
        >
          <input
            type="url"
            required
            placeholder="Paste any product link (Amazon, Flipkart, Myntra, etc.)..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-black border-2 border-zinc-800 text-white px-6 py-5 rounded-xl focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all text-lg placeholder:text-zinc-600"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-white text-black font-bold px-10 py-5 rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
          >
            {loading ? "Scraping..." : "Analyze Deal"}
          </button>
        </form>

        {/* Error State */}
        {error && (
          <div className="border-l-4 border-red-500 bg-red-950/20 text-red-400 px-6 py-5 rounded-r-xl font-medium">
            {error}
          </div>
        )}

        {/* Full-Page Result Grid */}
        {product && (
          <div className="border border-zinc-800 rounded-2xl p-6 md:p-10 bg-[#0a0a0a] backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* LEFT COLUMN: Interactive Image Gallery */}
              <div className="space-y-6">
                {product.imageUrls && product.imageUrls.length > 0 ? (
                  <>
                    {/* Main Featured Image */}
                    <div className="w-full h-96 md:h-[500px] bg-white rounded-2xl border border-zinc-800 p-8 flex items-center justify-center relative overflow-hidden">
                      <img
                        src={activeImage}
                        alt="Featured Product"
                        className="max-w-full max-h-full object-contain mix-blend-multiply transition-opacity duration-300"
                      />
                    </div>
                    {/* Thumbnail Strip */}
                    <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar">
                      {product.imageUrls.map((imgUrl, index) => (
                        <button
                          key={index}
                          onClick={() => setActiveImage(imgUrl)}
                          className={`snap-start flex-shrink-0 bg-white p-2 rounded-xl border-2 transition-all w-24 h-24 flex items-center justify-center ${activeImage === imgUrl ? "border-zinc-400 scale-105" : "border-zinc-800 opacity-60 hover:opacity-100"}`}
                        >
                          <img
                            src={imgUrl}
                            alt={`Thumbnail ${index + 1}`}
                            className="max-w-full max-h-full object-contain mix-blend-multiply"
                          />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="w-full h-96 bg-zinc-900 rounded-2xl border border-zinc-800 flex items-center justify-center text-zinc-600">
                    No images available
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: Data & Details */}
              <div className="space-y-10 flex flex-col justify-center">
                {/* Header & Badges */}
                <div className="space-y-4">
                  <span className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-black shadow-sm uppercase tracking-widest">
                    {product.claimedDiscount}
                  </span>
                  <h2 className="text-3xl md:text-5xl font-bold leading-tight text-white tracking-tight">
                    {product.productName}
                  </h2>
                </div>

                {/* Price Block */}
                <div className="bg-black p-8 rounded-2xl border border-zinc-900 shadow-inner">
                  <div className="flex flex-col gap-2">
                    <span className="text-zinc-500 font-semibold uppercase tracking-widest text-sm">
                      Current Price
                    </span>
                    <div className="flex items-baseline gap-6">
                      <span className="text-6xl md:text-7xl font-black tracking-tighter text-white">
                        ₹{product.currentPrice.toLocaleString("en-IN")}
                      </span>
                      {product.originalPrice > product.currentPrice && (
                        <span className="text-3xl text-zinc-600 line-through font-medium">
                          ₹{product.originalPrice.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {/* Description */}
                <div className="border-t border-zinc-800/50 pt-8">
                  <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">
                    About this item
                  </h3>
                  <p className="text-zinc-400 leading-relaxed text-lg font-light">
                    {product.description.length > 500
                      ? product.description.substring(0, 500) + "..."
                      : product.description}
                  </p>
                </div>

                {/* AI Verdict - Only shows if there is enough history */}
                <BuyVerdict
                  currentPrice={product.currentPrice}
                  history={product.history}
                />
                {product.history && product.history.length > 1 && (
                  <PriceGraph history={product.history} />
                )}
                <FirstTrackerCard
                  productId={product.id}
                  hasHistory={!!(product.history && product.history.length > 1)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
