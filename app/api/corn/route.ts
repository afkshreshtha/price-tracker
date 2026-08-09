import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Force Next.js to not cache this route
export const dynamic = 'force-dynamic'; 

export async function GET(request: Request) {
  try {
    // 1. Fetch all existing products from Supabase
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, url');

    if (fetchError || !products || products.length === 0) {
      return NextResponse.json({ message: "No products found to update." });
    }

    console.log(`Starting daily update for ${products.length} products...`);

    // 2. Launch Puppeteer ONCE for the entire loop
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.emulate({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const newPrices = [];

    // 3. Loop through each product and scrape the new price
// 3. Loop through each product and scrape the new price
    for (const product of products) {
      try {
        await page.goto(product.url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.a-price-whole', { timeout: 5000 });
        
        const priceText = await page.$eval('.a-price-whole', (el: Element) => (el as HTMLElement).innerText);
        const currentPrice = parseInt(priceText.replace(/,/g, ''), 10);

        // --- NEW OPTIMIZATION LOGIC ---
        // Grab the most recent price from the database for this product
        const { data: lastPriceRecord } = await supabase
          .from('prices')
          .select('current_price')
          .eq('product_id', product.id)
          .order('date', { ascending: false })
          .limit(1)
          .single();

        // ONLY insert a new row if there is no previous price, OR if the price has changed!
        if (!lastPriceRecord || lastPriceRecord.current_price !== currentPrice) {
          newPrices.push({
            product_id: product.id,
            current_price: currentPrice
          });
          console.log(`✅ Price Changed! Updated: ${product.url} -> ₹${currentPrice}`);
        } else {
          console.log(`➖ Price unchanged for: ${product.url}. Skipping database insert.`);
        }
        
      } catch (err) {
        console.error(`❌ Failed to update ${product.url}`);
      }
    }
    await browser.close();

    // 4. Batch Insert all new prices at once (much faster than inserting one by one)
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