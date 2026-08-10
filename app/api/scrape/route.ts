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
      .select("id, title, description")
      .eq("url", url)
      .single();

    if (existingProduct) {
      // Fetch ALL historical prices for this product, ordered oldest to newest
      const { data: priceHistory } = await supabase
        .from("prices")
        .select("current_price, date")
        .eq("product_id", existingProduct.id)
        .order("date", { ascending: true });

      if (priceHistory && priceHistory.length > 0) {
        // The last item in the array is today's current price
        const latestPrice = priceHistory[priceHistory.length - 1].current_price;

        console.log("Returned history instantly from Supabase!");
        return NextResponse.json({
          success: true,
          message: "Loaded from database",
          productName: existingProduct.title,
          currentPrice: latestPrice,
          originalPrice: latestPrice,
          claimedDiscount: "History available",
          description: existingProduct.description,
          // Send the full array to the frontend for the graph!
          history: priceHistory,
        });
      }
    }

    // ==========================================
    // 2. SLOW PATH: Scrape Amazon (Only runs for new URLs)
    // ==========================================
    console.log("URL not found in DB. Launching scraper...");
// Check if we are running locally via Next.js development server
    const isLocal = process.env.NODE_ENV === 'development';

    const browser = await puppeteer.launch({
      args: isLocal 
        ? ["--disable-blink-features=AutomationControlled"] 
        : [...chromium.args, "--disable-blink-features=AutomationControlled"],
      defaultViewport: { width: 1920, height: 1080 },
      // If local, point to your computer's actual Chrome installation. If Vercel, use the serverless path.
      executablePath: isLocal 
        ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' 
        : await chromium.executablePath(),
      // Let's keep it visible locally for debugging, but invisible in production
      headless: isLocal ? false : true,
    });
    const page = await browser.newPage();

    await page.emulate({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
    });

    await page.goto(url, { waitUntil: "domcontentloaded" });

    let currentPrice = 0;
    let titleText = "";
    let originalPrice = 0;

    // ==========================================
    // SCRAPING LOGIC: AMAZON VS FLIPKART
    // ==========================================
    if (url.includes('amazon.in')) {
          // --- AMAZON LOGIC ---
          // 1. Give Vercel more time to render Amazon's heavy JS
          // 2. Provide fallback selectors in case Amazon serves a different layout to Datacenter IPs
          const amazonPriceSelectors = '.a-price-whole, .a-color-price, #priceblock_ourprice, #priceblock_dealprice';
          
          // Increased timeout from 5,000ms to 15,000ms
          await page.waitForSelector(amazonPriceSelectors, { timeout: 15000 }); 
          const priceText = await page.$eval(amazonPriceSelectors, (el: Element) => (el as HTMLElement).innerText);
          currentPrice = parseInt(priceText.replace(/,/g, ''), 10);

          titleText = await page.$eval('#productTitle', (el: Element) => (el as HTMLElement).innerText.trim());

          try {
            const mrpText = await page.$eval('.a-text-price span[aria-hidden="true"]', (el: Element) => (el as HTMLElement).innerText);
            originalPrice = parseInt(mrpText.replace(/[^\d]/g, ''), 10);
          } catch (e) {
            originalPrice = currentPrice;
          }
    } else if (url.includes("flipkart.com")) {
      // --- FLIPKART LOGIC (CLASS-IMMUNE APPROACH) ---

      // 1. Wait for the H1 (Product Title) to guarantee the page structure has loaded
      await page.waitForSelector("h1", { timeout: 10000 });

      // 2. Inject a visual parser directly into the browser to read the styles
      const scrapedData = await page.evaluate(() => {
        const title =
          document.querySelector("h1")?.innerText.trim() || "Unknown Product";

        let current = 0;
        let original = 0;

        // Grab every single div on the page
        const allDivs = Array.from(document.querySelectorAll("div"));

        // Filter down to only divs that contain a Rupee symbol and have no child elements
        const priceDivs = allDivs.filter((div) => {
          const text = div.innerText?.trim();
          return text && text.startsWith("₹") && div.children.length === 0;
        });

        for (const div of priceDivs) {
          const textValue = parseInt(div.innerText.replace(/[^\d]/g, ""), 10);
          const style = window.getComputedStyle(div);
          const inlineStyle = div.getAttribute("style") || "";

          // If the CSS says it has a strike-through, it is the Original MRP
          if (
            style.textDecorationLine.includes("line-through") ||
            inlineStyle.includes("line-through")
          ) {
            if (original === 0) original = textValue;
          }
          // If it doesn't have a strike-through, the first one we hit is the Current Price
          else {
            if (current === 0) current = textValue;
          }
        }

        return {
          titleText: title,
          currentPrice: current,
          originalPrice: original > 0 ? original : current,
        };
      });

      titleText = scrapedData.titleText;
      currentPrice = scrapedData.currentPrice;
      originalPrice = scrapedData.originalPrice;
    } else {
      throw new Error(
        "Unsupported website. Please use Amazon India or Flipkart.",
      );
    }

    // Now calculate the discount percentage universally!
    const discountPercentage = Math.round(
      ((originalPrice - currentPrice) / originalPrice) * 100,
    );
    let description = "Description not available.";
    try {
      const bullets = await page.$$eval(
        "#feature-bullets ul li span.a-list-item",
        (elements) =>
          elements
            .map((el) => (el as HTMLElement).innerText.trim())
            .filter((text) => text.length > 0),
      );
      if (bullets.length > 0) description = bullets.join(" | ");
    } catch (e) {
      console.log("No feature bullets found.");
    }

    await browser.close();

    // ==========================================
    // 3. SAVE NEW DATA TO DATABASE
    // ==========================================
    const { data: newProduct, error: insertError } = await supabase
      .from("products")
      .insert([{ url: url, title: titleText, description: description }])
      .select("id")
      .single();

    if (insertError) throw insertError;

    const { error: priceError } = await supabase
      .from("prices")
      .insert([{ product_id: newProduct.id, current_price: currentPrice }]);

    if (priceError) throw priceError;

    return NextResponse.json({
      success: true,
      message: "Scraped and saved to Supabase!",
      productName: titleText,
      currentPrice: currentPrice,
      originalPrice: originalPrice,
      claimedDiscount: `${discountPercentage}% off`,
      description: description,
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to process data." },
      { status: 500 },
    );
  }
}
