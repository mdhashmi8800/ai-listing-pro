import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";

// ── Allowed origins (extension + hosted checkout) ──────────────
const ALLOWED_ORIGINS = [
  "chrome-extension://mabegbmfmmlmgphgfblcjcalgfepldkm",
  "https://meesho-ai-tool.vercel.app",
];

// ── Plan→price map (source of truth for pricing) ──────────────
const PLAN_PRICES = {
  trial: 79,
  monthly: 299,
  quarterly: 899,
  half_yearly: 1499,
  yearly: 2099,
};

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, apikey"
  );
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // ── 1. Authenticate the caller via Supabase JWT ─────────────
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const jwt = authHeader.split(" ")[1];
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[create-order] Supabase credentials not configured");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify the token belongs to a real, authenticated user
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !authUser) {
    console.error("[create-order] Auth failed:", authError?.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const { amount, plan_id, user_id, phone, duration_days } = req.body;

    // ── 2. Validate required fields ───────────────────────────
    if (!user_id || !plan_id || !duration_days || !amount) {
      return res.status(400).json({
        error: "Missing required fields: user_id, plan_id, duration_days, amount",
      });
    }

    // ── 3. Ensure the authenticated user matches the user_id ──
    if (authUser.id !== user_id) {
      console.error("[create-order] user_id mismatch:", authUser.id, "!=", user_id);
      return res.status(403).json({ error: "user_id does not match authenticated user" });
    }

    // ── 4. Validate amount matches expected plan price ────────
    const expectedPrice = PLAN_PRICES[plan_id];
    if (!expectedPrice) {
      return res.status(400).json({ error: `Unknown plan: ${plan_id}` });
    }
    if (Number(amount) !== expectedPrice) {
      console.error("[create-order] Price mismatch:", amount, "!= expected", expectedPrice);
      return res.status(400).json({
        error: `Invalid amount for plan '${plan_id}'. Expected ₹${expectedPrice}`,
      });
    }

    // ── 5. Create Razorpay order ──────────────────────────────
    const order = await razorpay.orders.create({
      amount: expectedPrice * 100, // Use server-validated price, not client-supplied
      currency: "INR",
      receipt: "order_" + Date.now(),
      notes: {
        user_id: String(user_id),
        plan: String(plan_id),
        duration_days: String(duration_days),
        ...(phone ? { phone: String(phone) } : {}),
      },
    });

    console.log("[create-order] Order created:", order.id);
    res.status(200).json(order);
  } catch (error) {
    console.error("[create-order] Order creation failed:", error);
    res.status(500).json({ error: "Order creation failed" });
  }
}