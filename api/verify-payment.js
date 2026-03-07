import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // CORS headers for checkout page
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    user_id,
    plan,
    duration_days,
    amount,
    phone,
  } = req.body || {};

  // Log incoming payload for debugging
  console.log("[verify-payment] Incoming payload:", JSON.stringify({
    razorpay_payment_id: razorpay_payment_id || "MISSING",
    razorpay_order_id: razorpay_order_id || "MISSING",
    razorpay_signature: razorpay_signature ? "present" : "MISSING",
    user_id: user_id || "MISSING",
    plan: plan || "MISSING",
    duration_days,
    amount,
    phone,
  }));

  // Validate required fields
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({
      error: "Missing payment fields",
      missing: {
        razorpay_payment_id: !razorpay_payment_id,
        razorpay_order_id: !razorpay_order_id,
        razorpay_signature: !razorpay_signature,
      },
    });
  }

  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  // Verify Razorpay signature
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    console.error("[verify-payment] RAZORPAY_KEY_SECRET not configured");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(razorpay_signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
    if (!isValid) {
      console.error("[verify-payment] Signature mismatch");
      return res.status(400).json({ error: "Invalid payment signature" });
    }
  } catch (err) {
    console.error("[verify-payment] Signature verification error:", err);
    return res.status(400).json({ error: "Invalid payment signature" });
  }

  // Update database
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[verify-payment] Supabase credentials not configured");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const durationDays = parseInt(duration_days) || 30;
    const planName = plan || "trial";
    const startDate = new Date();
    const endDate = new Date(
      startDate.getTime() + durationDays * 24 * 60 * 60 * 1000
    );

    // Insert subscription
    const { error: subError } = await supabase.from("subscriptions").insert({
      user_id,
      plan_name: planName,
      status: "active",
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      razorpay_payment_id,
      razorpay_order_id,
      amount: amount || 0,
      phone: phone || null,
    });

    if (subError) {
      console.error("[verify-payment] Subscription insert error:", subError);
      return res.status(500).json({ error: "Failed to save subscription" });
    }

    // Update user plan
    await supabase
      .from("profiles")
      .update({ plan: planName, updated_at: new Date().toISOString() })
      .eq("id", user_id);

    // Log payment
    await supabase.from("payments").insert({
      user_id,
      amount: amount || 0,
      credits_added: 0,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      status: "captured",
    });

    console.log("[verify-payment] Success:", { user_id, planName, durationDays });

    return res.status(200).json({
      success: true,
      subscription: true,
      plan: planName,
      end_date: endDate.toISOString(),
    });
  } catch (err) {
    console.error("[verify-payment] DB error:", err);
    return res.status(500).json({ error: err.message });
  }
}
