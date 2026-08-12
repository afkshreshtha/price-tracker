import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    // ==========================================
    // 1. FAST PATH: Check Database First
    // ==========================================
    const { data: existingProduct } = await supabase
      .from("products")
      .select("id, title, description, image_urls") // Updated to plural
      .eq("url", url)
      .single();

    if (existingProduct) {
      const { data: priceHistory } = await supabase
        .from("prices")
        .select("current_price, date")
        .eq("product_id", existingProduct.id)
        .order("date", { ascending: true });

      if (priceHistory && priceHistory.length > 0) {
        const latestPrice = priceHistory[priceHistory.length - 1].current_price;
const maxHistoricalPrice = Math.max(...priceHistory.map(h => h.current_price));

        console.log("Returned history instantly from Supabase!");
        return NextResponse.json({
          success: true,
          id: existingProduct.id,
          message: "Loaded from database",
          productName: existingProduct.title,
          currentPrice: latestPrice,
          originalPrice: latestPrice,
          claimedDiscount: "History available",
          description: existingProduct.description,
          imageUrls: existingProduct.image_urls || [], // Return the array
          history: priceHistory,
        });
      }
    }

    // ==========================================
    // 2. SLOW PATH: Flipkart (Puppeteer) OR Universal (Firecrawl)
    // ==========================================
    console.log("URL not found in DB. Launching scraper...");

    let currentPrice = 0;
    let titleText = "";
    let originalPrice = 0;
    let description = "Description not available.";
    let imageUrls: string[] = []; // Now an Array!

    if (url.includes("flipkart.com")) {
      // --- FLIPKART LOGIC (USES PUPPETEER) ---
      const isLocal = process.env.NODE_ENV === "development";

      const browser = await puppeteer.launch({
        args: isLocal
          ? ["--disable-blink-features=AutomationControlled"]
          : [...chromium.args, "--disable-blink-features=AutomationControlled"],
        defaultViewport: { width: 1920, height: 1080 },
        executablePath: isLocal
          ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
          : await chromium.executablePath(),
        headless: isLocal ? false : true,
      });

      const page = await browser.newPage();
      await page.emulate({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        viewport: { width: 1920, height: 1080 },
      });

      await page.goto(url, { waitUntil: "domcontentloaded" });

      // Wait for the H1 to guarantee page load
      await page.waitForSelector("h1", { timeout: 10000 });
      const scrapedData = await page.evaluate(() => {
        const h1 = document.querySelector("h1") as HTMLElement | null;

        // Use textContent to get the hidden full text, then strip out "...more"
        let title = h1?.textContent?.trim() || "Unknown Product";
        title = title
          .replace(/\s*\.{3}more$/i, "")
          .replace(/\s*more$/i, "")
          .trim();

        let current = 0;
        let original = 0;

        // --- SCOPE TO MAIN PRODUCT COLUMN ONLY ---
        // Walk up from H1 to capture the product details column while excluding ad banners & sidebars
        let mainContainer: HTMLElement | null = h1;
        if (h1) {
          let parent = h1.parentElement;
          for (let i = 0; i < 4; i++) {
            if (parent && parent.tagName !== "BODY") {
              mainContainer = parent;
              parent = parent.parentElement;
            }
          }
        }
        if (!mainContainer) mainContainer = document.body;

        const isVisible = (elem: Element) => {
          const htmlElem = elem as HTMLElement;
          return (
            !!(
              htmlElem.offsetWidth ||
              htmlElem.offsetHeight ||
              htmlElem.getClientRects().length
            ) &&
            window.getComputedStyle(htmlElem).display !== "none" &&
            window.getComputedStyle(htmlElem).visibility !== "hidden"
          );
        };

        // --- 1. SCOPED PRICE PARSER ---
        const candidateElements = Array.from(
          document.querySelectorAll("div, span"),
        );

        const priceElements = candidateElements.filter((el) => {
          if (!isVisible(el)) return false;
          const htmlEl = el as HTMLElement;
          if (htmlEl.children.length !== 0) return false;

          // Added the invisible character cleaner here just like the cron job
          const text = htmlEl.innerText
            ?.replace(/[\u200B-\u200D\uFEFF]/g, "")
            .trim();
          const isPriceFormat = /^₹?\s*[\d,]+\s*$/.test(text || "");

          return text && isPriceFormat && text.length > 3;
        });

        // Extract the value, font size, and strikethrough status of all prices found
        const parsedPrices = priceElements
          .map((el) => {
            const htmlEl = el as HTMLElement;
            const textValue = parseInt(
              htmlEl.innerText.replace(/[^\d]/g, ""),
              10,
            );

            const style = window.getComputedStyle(htmlEl);
            // Measure the font size so we can find the "main" price
            const fontSize = parseFloat(style.fontSize) || 0;
            const inlineStyle = htmlEl.getAttribute("style") || "";

            const hasStrikeThrough =
              style.textDecorationLine.includes("line-through") ||
              style.textDecoration.includes("line-through") ||
              inlineStyle.includes("line-through");

            return { textValue, fontSize, hasStrikeThrough };
          })
          .filter((p) => p.textValue >= 100); // Ignore random tiny numbers

        // The actual current price is ALWAYS the visually largest text
        let maxFontSize = 0;
        for (const p of parsedPrices) {
          if (!p.hasStrikeThrough && p.fontSize > maxFontSize) {
            maxFontSize = p.fontSize;
            current = p.textValue; // Grabs the massive main price
          }
        }

        // For the original price, grab the first strikethrough price that isn't tiny
        const strikethroughPrices = parsedPrices.filter(
          (p) => p.hasStrikeThrough && p.fontSize >= 14,
        );

        if (strikethroughPrices.length > 0) {
          original = strikethroughPrices[0].textValue;
        } else {
          original = current > 0 ? current : 0;
        }
        // --- 2. IMAGE PARSER ---
        const imgElements = Array.from(document.querySelectorAll("img"));
        const rawUrls = imgElements
          .map((img) => img.getAttribute("src") || "")
          .filter(
            (src) =>
              src.includes("http") &&
              src.includes("rukminim") &&
              src.includes("/image/"),
          )
          .filter((src) => !src.includes("data:image"));

        const highResUrls = rawUrls.map((url) =>
          url.replace(/\/\d+\/\d+\//, "/800/800/"),
        );
        const uniqueImages = [...new Set(highResUrls)].slice(0, 6);

        // --- 3. DESCRIPTION PARSER ---
        let finalDescription = "Description not available.";

        // Find the "Highlights" section across the ENTIRE page
        const allTextElements = Array.from(
          document.querySelectorAll("div, span, h2, h3"),
        );
        const highlightHeader = allTextElements.find((el) => {
          const text = (el as HTMLElement).innerText?.trim() || "";
          return /^(Highlights|Product highlights|Key Highlights)$/i.test(text);
        });

        if (highlightHeader) {
          // Walk up the DOM to find the wrapper containing the highlight items
          let container = highlightHeader.parentElement;
          for (let i = 0; i < 6; i++) {
            if (!container) break;

            // Find all "leaf nodes" (elements with text but no nested HTML tags inside them)
            const leafNodes = Array.from(
              container.querySelectorAll("div, span, li, p"),
            ).filter((el) => {
              const htmlEl = el as HTMLElement;
              return (
                isVisible(htmlEl) &&
                htmlEl.children.length === 0 &&
                htmlEl.innerText.trim().length > 2
              );
            });

            const validTexts = leafNodes
              .map((el) =>
                (el as HTMLElement).innerText
                  .replace(/[\u200B-\u200D\uFEFF]/g, "")
                  .trim(),
              )
              .filter(
                (text) =>
                  !/^(Highlights|Product highlights|Key Highlights)$/i.test(
                    text,
                  ) &&
                  !text.includes("₹") &&
                  text.length < 150,
              );

            // If we found the text nodes, assemble them and stop walking up the tree
            if (validTexts.length > 2) {
              finalDescription = [...new Set(validTexts)]
                .slice(0, 10)
                .join(" | ");
              break;
            }
            container = container.parentElement;
          }
        }

        // Fallback: If no strict "Highlights" header was found, grab the first valid list on the page
        if (finalDescription === "Description not available.") {
          const allLis = Array.from(
            document.querySelectorAll("li"),
          ) as HTMLElement[];
          const validLis = allLis
            .filter(isVisible)
            .map((li) =>
              li.innerText.replace(/[\u200B-\u200D\uFEFF]/g, "").trim(),
            )
            .filter(
              (text) =>
                text.length > 8 && text.length < 150 && !text.includes("₹"),
            );

          if (validLis.length > 0) {
            finalDescription = [...new Set(validLis)].slice(0, 8).join(" | ");
          }
        }

        return {
          titleText: title,
          currentPrice: current,
          originalPrice: original > 0 ? original : current,
          images: uniqueImages,
          description: finalDescription,
        };
      });

      titleText = scrapedData.titleText;
      currentPrice = scrapedData.currentPrice;
      originalPrice = scrapedData.originalPrice;
      imageUrls = scrapedData.images;
      description = scrapedData.description;

      await browser.close();
    } else {
      // --- FIRECRAWL API LOGIC FOR EVERYTHING ELSE (Amazon, Myntra, etc.) ---
      // --- FIRECRAWL API LOGIC FOR EVERYTHING ELSE (Amazon, Myntra, etc.) ---
      const firecrawlUrl = "https://api.firecrawl.dev/v1/scrape";
      const options = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url,
          formats: ["extract"],
          // NEW: Force Firecrawl to use an Indian proxy and language headers!
          location: {
            country: "IN",
            languages: ["en-IN", "hi-IN"],
          },
          extract: {
            prompt:
              "Extract the current selling price as a raw number (if out of stock or hidden, return 0). Extract the original maximum retail price (MRP) as a raw number (if no discount exists, return the current price). Extract the full product title, a short product description, and an array of all product image URLs from the product gallery.",
            schema: {
              type: "object",
              properties: {
                currentPrice: { type: "number" },
                originalPrice: { type: "number" },
                titleText: { type: "string" },
                description: { type: "string" },
                imageUrls: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["titleText"],
            },
          },
        }),
      };

      const response = await fetch(firecrawlUrl, options);
      const data = await response.json();

      if (!data.success || !data.data?.extract) {
        throw new Error(`Firecrawl failed to extract data from ${url}`);
      }

      currentPrice = data.data.extract.currentPrice || 0;

      // Stop the process if Amazon hid the price due to location blocks
      if (currentPrice === 0) {
        throw new Error(
          "Amazon hid the price due to out-of-stock or region blocking. Please try another product.",
        );
      }

      originalPrice = data.data.extract.originalPrice || currentPrice;
      titleText = data.data.extract.titleText || "Unknown Product";
      description =
        data.data.extract.description || "Description not available.";
      imageUrls = data.data.extract.imageUrls || [];

      // Removed the duplicate variable assignments that were here!
    }

    // ==========================================
    // 3. CALCULATION & SAVE TO DATABASE
    // ==========================================
    const discountPercentage = Math.round(
      ((originalPrice - currentPrice) / originalPrice) * 100,
    );

    const { data: newProduct, error: insertError } = await supabase
      .from("products")
      .insert([
        {
          url: url,
          title: titleText,
          description: description,
          image_urls: imageUrls,
        },
      ])
      .select("id")
      .single();

    if (insertError) throw insertError;

    const { error: priceError } = await supabase
      .from("prices")
      .insert([{ product_id: newProduct.id, current_price: currentPrice }]);


    return NextResponse.json({
      success: true,
      message: "Scraped and saved to Supabase!",
      id: newProduct.id, // <--- ADD THIS LINE
      productName: titleText,
      currentPrice: currentPrice,
      originalPrice: originalPrice,
      claimedDiscount: `${discountPercentage}% off`,
      description: description,
      imageUrls: imageUrls,
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to process data." },
      { status: 500 },
    );
  }
}
