import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const { email, productId } = await request.json();
    console.log(email,productId)

    if (!email || !productId) {
      return NextResponse.json({ success: false, message: "Missing data" }, { status: 400 });
    }

    // Check if this user is already tracking this exact product
    const { data: existingAlert } = await supabase
      .from("alerts")
      .select("id")
      .eq("email", email)
      .eq("product_id", productId)
      .single();

    if (existingAlert) {
      return NextResponse.json({ success: true, message: "You are already tracking this item!" });
    }

    // Save new subscription
    const { error } = await supabase
      .from("alerts")
      .insert([{ email, product_id: productId }]);

    if (error) throw error;

    return NextResponse.json({ success: true, message: "Alert set successfully!" });
  } catch (error) {
    console.error("Subscription Error:", error);
    return NextResponse.json({ success: false, message: "Failed to subscribe" }, { status: 500 });
  }
}