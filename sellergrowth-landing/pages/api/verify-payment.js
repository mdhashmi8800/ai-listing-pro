import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // CORS headers for extension & checkout page
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, apikey"
  );

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
    plan_type,
    duration_days,
    amount,
    phone,
    credits_to_add,
  } = req.body || {};

  // Normalise plan name
  const planName = plan || plan_type || "trial";

  console.log(
    "[verify-payment] body:",
    JSON.stringify({
      razorpay_payment_id: razorpay_payment_id || "MISSING",
      razorpay_order_id: razorpay_order_id || "MISSING",
      razorpay_signature: razorpay_signature ? "present" : "MISSING",
      user_id: user_id || "MISSING",
      plan: planName,
      duration_days,
      amount,
      phone,
      credits_to_add,
    })
  );

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

  if (expectedSignature !== razorpay_signature) {
    console.error("[verify-payment] Signature mismatch");
    return res.status(400).json({ error: "Invalid payment signature" });
  }

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
    // ── Determine payment type: subscription vs credit pack ──
    const isCreditPack = credits_to_add && parseInt(credits_to_add) > 0 && !duration_days;

    if (isCreditPack) {
      // ════════════════════════════════════════
      //  CREDIT PACK PURCHASE
      // ════════════════════════════════════════
      const creditsToAdd = parseInt(credits_to_add);

      // Get current user profile
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("credits, first_purchase")
        .eq("id", user_id)
        .single();

      if (profileErr || !profile) {
        console.error("[verify-payment] User not found:", profileErr);
        return res.status(400).json({ error: "User not found" });
      }

      const newBalance = (profile.credits || 0) + creditsToAdd;

      // Update credits in profiles
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({
          credits: newBalance,
          first_purchase: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user_id);

      if (updateErr) {
        console.error("[verify-payment] Credit update error:", updateErr);
        return res.status(500).json({ error: "Failed to update credits" });
      }

      // Log payment record
      await supabase.from("payments").upsert(
        {
          user_id,
          amount: amount || 0,
          plan: planName,
          credits_added: creditsToAdd,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          status: "captured",
        },
        { onConflict: "razorpay_order_id" }
      );

      // Log credit transaction
      await supabase.from("credit_transactions").insert({
        user_id,
        delta: creditsToAdd,
        reason: "topup",
        meta: { razorpay_payment_id, plan: planName },
      });

      console.log("[verify-payment] Credit pack success:", {
        user_id,
        credits_added: creditsToAdd,
        new_balance: newBalance,
      });

      return res.status(200).json({
        success: true,
        subscription: false,
        credits_added: creditsToAdd,
        new_balance: newBalance,
      });
    }

    // ════════════════════════════════════════
    //  SUBSCRIPTION PURCHASE
    // ════════════════════════════════════════
    const durationDays = parseInt(duration_days) || 30;
    const startDate = new Date();
    const endDate = new Date(
      startDate.getTime() + durationDays * 24 * 60 * 60 * 1000
    );

    // 1. Upsert subscription
    const { error: subError } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id,
          plan: planName,
          status: "active",
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          razorpay_payment_id,
          razorpay_order_id,
          amount: amount || 0,
          phone: phone || null,
        },
        { onConflict: "razorpay_order_id" }
      );

    if (subError) {
      console.error("[verify-payment] Subscription upsert error:", subError);
      return res.status(500).json({ error: "Failed to save subscription" });
    }

    // 2. Update user plan in profiles
    await supabase
      .from("profiles")
      .update({ plan: planName, updated_at: new Date().toISOString() })
      .eq("id", user_id);

    // 3. Insert payment record
    await supabase.from("payments").upsert(
      {
        user_id,
        amount: amount || 0,
        plan: planName,
        credits_added: 0,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        status: "captured",
      },
      { onConflict: "razorpay_order_id" }
    );

    console.log("[verify-payment] Subscription success:", {
      user_id,
      plan: planName,
      durationDays,
      end_date: endDate.toISOString(),
    });

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