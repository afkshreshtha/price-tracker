import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// 1. Define the blueprint for your price records
interface NewPriceRecord {
  product_id: number | string; // Accepts both standard IDs and UUIDs
  current_price: number;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { data: products, error: fetchError } = await supabase
      .from("products")
      .select("id, url");

    if (fetchError || !products || products.length === 0) {
      return NextResponse.json({ message: "No products found to update." });
    }

    console.log(`Starting daily update for ${products.length} products...`);

    const newPrices: NewPriceRecord[] = [];

    // ==========================================
    // 1. SMART ROUTING: Split URLs to save API credits
    // ==========================================
    const flipkartProducts = products.filter((p) =>
      p.url.includes("flipkart.com"),
    );
    const firecrawlProducts = products.filter(
      (p) => !p.url.includes("flipkart.com"),
    );

    // ==========================================
    // 2. FIRECRAWL BATCH (Amazon, etc. - Uses Credits)
    // ==========================================
    for (const product of firecrawlProducts) {
      try {
        const firecrawlUrl = "https://api.firecrawl.dev/v1/scrape";
        const options = {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: product.url,
            formats: ["extract"],
            location: {
              country: "IN",
              languages: ["en-IN", "hi-IN"],
            },
            extract: {
              prompt:
                "Extract the current selling price as a raw number (if out of stock or hidden, return 0).",
              schema: {
                type: "object",
                properties: { currentPrice: { type: "number" } },
              },
            },
          }),
        };

        const response = await fetch(firecrawlUrl, options);
        const data = await response.json();

        if (data.success && data.data?.extract?.currentPrice) {
          const currentPrice = data.data.extract.currentPrice;
          if (currentPrice > 0) {
            await checkAndStoreDelta(
              product.id,
              product.url,
              currentPrice,
              newPrices,
            );
          }
        }
      } catch (err) {
        console.error(`❌ Firecrawl failed to update ${product.url}`, err);
      }
    }

    // ==========================================
    // 3. PUPPETEER BATCH (Flipkart - 100% Free)
    // ==========================================
    if (flipkartProducts.length > 0) {
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

      for (const product of flipkartProducts) {
        try {
          await page.goto(product.url, { waitUntil: "domcontentloaded" });
          await page.waitForSelector("h1", { timeout: 10000 });

          const currentPrice = await page.evaluate(() => {
            let current = 0;

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

            // 1. Scan the ENTIRE page (removed the 4-level H1 restriction)
            const candidateElements = Array.from(
              document.querySelectorAll("div, span"),
            );

            const priceElements = candidateElements.filter((el) => {
              if (!isVisible(el)) return false;
              const htmlEl = el as HTMLElement;
              if (htmlEl.children.length !== 0) return false;

              // Clean hidden formatting characters Flipkart sometimes injects
              const text = htmlEl.innerText
                ?.replace(/[\u200B-\u200D\uFEFF]/g, "")
                .trim();

              // Slightly more forgiving Regex for trailing spaces
              const isPriceFormat = /^₹?\s*[\d,]+\s*$/.test(text || "");
              return text && isPriceFormat && text.length > 3;
            });

            // 2. Measure font sizes for all found prices
            const parsedPrices = priceElements
              .map((el) => {
                const htmlEl = el as HTMLElement;
                const textValue = parseInt(
                  htmlEl.innerText.replace(/[^\d]/g, ""),
                  10,
                );
                if (textValue < 100)
                  return { textValue: 0, fontSize: 0, hasStrikeThrough: false };

                const style = window.getComputedStyle(htmlEl);
                const fontSize = parseFloat(style.fontSize) || 0;
                const inlineStyle = htmlEl.getAttribute("style") || "";

                const hasStrikeThrough =
                  style.textDecorationLine.includes("line-through") ||
                  style.textDecoration.includes("line-through") ||
                  inlineStyle.includes("line-through");

                return { textValue, fontSize, hasStrikeThrough };
              })
              .filter((p) => p.textValue >= 100);

            // 3. The actual price is ALWAYS the visually largest active text on the page
            let maxFontSize = 0;
            for (const p of parsedPrices) {
              if (!p.hasStrikeThrough && p.fontSize > maxFontSize) {
                maxFontSize = p.fontSize;
                current = p.textValue;
              }
            }

            return current;
          });

          if (currentPrice > 0) {
            await checkAndStoreDelta(
              product.id,
              product.url,
              currentPrice,
              newPrices,
            );
          }
        } catch (err) {
          console.error(`❌ Puppeteer failed to update ${product.url}`, err);
        }
      }
      await browser.close();
    }

    // ==========================================
    // 4. BULK INSERT NEW PRICES
    // ==========================================
    if (newPrices.length > 0) {
      const { error: insertError } = await supabase
        .from("prices")
        .insert(newPrices);
      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true, updatedCount: newPrices.length });
  } catch (error) {
    console.error("Cron Job Error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function checkAndStoreDelta(
  productId: number | string,
  url: string,
  currentPrice: number,
  newPrices: NewPriceRecord[],
) {
  const { data: lastPriceRecord } = await supabase
    .from("prices")
    .select("current_price")
    .eq("product_id", productId)
    .order("date", { ascending: false })
    .limit(1)
    .single();

  if (!lastPriceRecord || lastPriceRecord.current_price !== currentPrice) {
    newPrices.push({ product_id: productId, current_price: currentPrice });
    console.log(`✅ Price Changed! Updated: ${url} -> ₹${currentPrice}`);

    // Trigger emails if the price dropped
    if (lastPriceRecord && currentPrice < lastPriceRecord.current_price) {
      await triggerPriceDropEmails(
        productId,
        url,
        currentPrice,
        lastPriceRecord.current_price,
      );
    }
  } else {
    console.log(`➖ Price unchanged for: ${url}. Skipping.`);
  }
}

async function triggerPriceDropEmails(
  productId: number | string,
  url: string,
  newPrice: number,
  oldPrice: number,
) {
  // 1. Find all active subscribers for this product
  const { data: subscribers } = await supabase
    .from("alerts")
    .select("email")
    .eq("product_id", productId)
    .eq("is_active", true);

  if (!subscribers || subscribers.length === 0) return;

  // 2. Prepare the email list
  const emails = subscribers.map((sub) => sub.email);
  const discount = oldPrice - newPrice;

  console.log(
    `Sending ${emails.length} alert emails for product ${productId}...`,
  );

  // 3. Send emails via Resend
  try {
    await resend.emails.send({
      from: "Alerts <onboarding@resend.dev>", // Update this to your verified Resend domain when launching
      to: emails,
      subject: `🚨 Price Drop Alert! Save ₹${discount.toLocaleString("en-IN")}`,
      html: `
        <div style="font-family: sans-serif; background-color: #000; color: #fff; padding: 40px; border-radius: 10px;">
          <h2 style="color: #fff;">Huge Price Drop Detected!</h2>
          <p style="color: #a1a1aa; font-size: 16px;">The product you are tracking just dropped in price.</p>
          <div style="background-color: #18181b; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #a1a1aa; text-decoration: line-through;">Old Price: ₹${oldPrice.toLocaleString("en-IN")}</p>
            <p style="margin: 0; font-size: 24px; font-weight: bold; color: #fff;">New Price: ₹${newPrice.toLocaleString("en-IN")}</p>
          </div>
          <a href="${url}" style="display: inline-block; background-color: #fff; color: #000; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px;">Buy it now</a>
        </div>
      `,
    });
  } catch (error) {
    console.error("Failed to send emails via Resend:", error);
  }
}
