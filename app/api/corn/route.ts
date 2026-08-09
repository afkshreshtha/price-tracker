import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Force Next.js to not cache this route
export const dynamic = 'force-dynamic'; 

export async function GET(request: Request) {
  try {
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, url');

    if (fetchError || !products || products.length === 0) {
      return NextResponse.json({ message: "No products found to update." });
    }

    console.log(`Starting daily update for ${products.length} products...`);

    // ==========================================
    // SERVERLESS-SAFE BROWSER LAUNCH
    // ==========================================
    const isLocal = process.env.NODE_ENV === 'development';
    
    const browser = await puppeteer.launch({
      args: isLocal 
        ? ["--disable-blink-features=AutomationControlled"] 
        : [...chromium.args, "--disable-blink-features=AutomationControlled"],
      defaultViewport: chromium.defaultViewport,
      executablePath: isLocal 
        ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' 
        : await chromium.executablePath(),
      headless: isLocal ? false : chromium.headless,
    });

    const page = await browser.newPage();
    
    await page.emulate({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const newPrices = [];

    // ==========================================
    // LOOP & SCRAPE LOGIC
    // ==========================================
    for (const product of products) {
      try {
        await page.goto(product.url, { waitUntil: 'domcontentloaded' });
        
        let currentPrice = 0;

        if (product.url.includes('amazon.in')) {
          await page.waitForSelector('.a-price-whole', { timeout: 5000 });
          const priceText = await page.$eval('.a-price-whole', (el: Element) => (el as HTMLElement).innerText);
          currentPrice = parseInt(priceText.replace(/,/g, ''), 10);
          
        } else if (product.url.includes('flipkart.com')) {
          await page.waitForSelector('h1', { timeout: 10000 });
          const scrapedCurrent = await page.evaluate(() => {
            let current = 0;
            const allDivs = Array.from(document.querySelectorAll('div'));
            const priceDivs = allDivs.filter(div => {
              const text = div.innerText?.trim();
              return text && text.startsWith('₹') && div.children.length === 0;
            });
            for (const div of priceDivs) {
              const textValue = parseInt(div.innerText.replace(/[^\d]/g, ''), 10);
              const style = window.getComputedStyle(div);
              const inlineStyle = div.getAttribute('style') || '';
              if (!(style.textDecorationLine.includes('line-through') || inlineStyle.includes('line-through'))) {
                if (current === 0) current = textValue;
              }
            }
            return current;
          });
          currentPrice = scrapedCurrent;
        }

        if (currentPrice === 0) throw new Error("Could not parse price.");

        // ==========================================
        // DELTA STORAGE OPTIMIZATION
        // ==========================================
        const { data: lastPriceRecord } = await supabase
          .from('prices')
          .select('current_price')
          .eq('product_id', product.id)
          .order('date', { ascending: false })
          .limit(1)
          .single();

        if (!lastPriceRecord || lastPriceRecord.current_price !== currentPrice) {
          newPrices.push({
            product_id: product.id,
            current_price: currentPrice
          });
          console.log(`✅ Price Changed! Updated: ${product.url} -> ₹${currentPrice}`);
        } else {
          console.log(`➖ Price unchanged for: ${product.url}. Skipping.`);
        }
        
      } catch (err) {
        console.error(`❌ Failed to update ${product.url}`);
      }
    }
    
    await browser.close();

    if (newPrices.length > 0) {
      const { error: insertError } = await supabase
        .from('prices')
        .insert(newPrices);

      if (insertError) throw insertError;
    }

    return NextResponse.json({ 
      success: true, 
      updatedCount: newPrices.length 
    });

  } catch (error) {
    console.error("Cron Job Error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}