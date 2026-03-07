import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const PLAN_DETAILS = {
  trial: { planName: "trial", durationDays: 10 },
  monthly: { planName: "monthly", durationDays: 30 },
  "3_months": { planName: "quarterly", durationDays: 90 },
  quarterly: { planName: "quarterly", durationDays: 90 },
  "6_months": { planName: "half_yearly", durationDays: 180 },
  half_yearly: { planName: "half_yearly", durationDays: 180 },
  yearly: { planName: "yearly", durationDays: 365 },
};

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function getPlanDetails(rawPlan) {
  if (!rawPlan) {
    return null;
  }

  return PLAN_DETAILS[String(rawPlan).trim()] || null;
}

function isDuplicateError(error) {
  return error?.code === "23505";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const rawChunks = [];
  for await (const chunk of req) {
    rawChunks.push(chunk);
  }

  const rawBody = Buffer.concat(rawChunks);
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const signature = req.headers["x-razorpay-signature"];
  if (!signature || typeof signature !== "string") {
    console.error("[razorpay-webhook] Missing x-razorpay-signature header");
    return res.status(400).json({ error: "Missing signature" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );

    if (!isValid) {
      console.error("[razorpay-webhook] Signature mismatch");
      return res.status(400).json({ error: "Invalid signature" });
    }
  } catch (error) {
    console.error("[razorpay-webhook] Signature verification failed:", error);
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    console.error("[razorpay-webhook] Invalid JSON payload:", error);
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const payment = event?.payload?.payment?.entity;
  const notes = payment?.notes || {};

  console.log("[razorpay-webhook] webhook received");
  console.log("[razorpay-webhook] event type:", event?.event || null);
  console.log("[razorpay-webhook] payment.id:", payment?.id || null);
  console.log("[razorpay-webhook] notes.user_id:", notes.user_id || null);
  console.log("[razorpay-webhook] notes.plan:", notes.plan || null);

  if (event?.event !== "payment.captured") {
    return res.status(200).json({ status: "ok", ignored: true });
  }

  const paymentId = payment?.id;
  const orderId = payment?.order_id;
  const amount = Number(payment?.amount || 0) / 100;
  const userId = notes.user_id;
  const requestedPlan = notes.plan || notes.plan_id;
  const planDetails = getPlanDetails(requestedPlan);
  const planName = planDetails?.planName || String(requestedPlan || "").trim();
  const durationDays = planDetails?.durationDays || 30;

  if (!userId) {
    console.error("[razorpay-webhook] Missing notes.user_id", {
      paymentId,
      orderId,
      requestedPlan,
    });
    return res.status(400).json({ error: "Missing notes.user_id" });
  }

  if (!paymentId || !orderId || !amount || !planName) {
    console.error("[razorpay-webhook] Missing required payment fields", {
      paymentId,
      orderId,
      amount,
      userId,
      requestedPlan,
    });
    return res.status(400).json({ error: "Missing required payment fields" });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("[razorpay-webhook] Supabase credentials missing");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const now = new Date();
  const startDate = now.toISOString();
  const endDate = addDays(now, durationDays).toISOString();

  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from("payments")
    .select("id")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();

  if (existingPaymentError) {
    console.error("[razorpay-webhook] Failed to check existing payment:", existingPaymentError);
    return res.status(500).json({ error: "Failed to check payment status" });
  }

  if (!existingPayment) {
    const { data: paymentInsertResponse, error: paymentInsertError } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        amount,
        currency: payment.currency || "INR",
        credits_added: 0,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        status: "success",
        created_at: startDate,
        updated_at: startDate,
      })
      .select("id, user_id, razorpay_payment_id, status, created_at");

    console.log("[razorpay-webhook] Payments insert response:", paymentInsertResponse);

    if (paymentInsertError) {
      console.error("[razorpay-webhook] Payments insert error:", paymentInsertError);
    }

    if (paymentInsertError && !isDuplicateError(paymentInsertError)) {
      console.error("[razorpay-webhook] Payment insert failed:", paymentInsertError);
      return res.status(500).json({ error: "Failed to insert payment" });
    }
  } else {
    console.log("[razorpay-webhook] Payment already exists:", existingPayment);
  }

  const { data: existingSubscription, error: existingSubscriptionError } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();

  if (existingSubscriptionError) {
    console.error(
      "[razorpay-webhook] Failed to check existing subscription:",
      existingSubscriptionError
    );
    return res.status(500).json({ error: "Failed to check subscription status" });
  }

  if (!existingSubscription) {
    const { data: activeSubscription, error: activeSubscriptionError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSubscriptionError) {
      console.error(
        "[razorpay-webhook] Failed to load active subscription:",
        activeSubscriptionError
      );
      return res.status(500).json({ error: "Failed to update subscription" });
    }

    if (activeSubscription?.id) {
      const { error: subscriptionUpdateError } = await supabase
        .from("subscriptions")
        .update({
          plan_name: planName,
          status: "active",
          start_date: startDate,
          end_date: endDate,
          razorpay_payment_id: paymentId,
          razorpay_order_id: orderId,
          amount,
          updated_at: startDate,
        })
        .eq("id", activeSubscription.id);

      if (subscriptionUpdateError) {
        console.error("[razorpay-webhook] Subscription update failed:", subscriptionUpdateError);
        return res.status(500).json({ error: "Failed to update subscription" });
      }
    } else {
      const { error: subscriptionInsertError } = await supabase
        .from("subscriptions")
        .insert({
          user_id: userId,
          plan_name: planName,
          status: "active",
          start_date: startDate,
          end_date: endDate,
          razorpay_payment_id: paymentId,
          razorpay_order_id: orderId,
          amount,
          created_at: startDate,
          updated_at: startDate,
        });

      if (subscriptionInsertError) {
        console.error("[razorpay-webhook] Subscription insert failed:", subscriptionInsertError);
        return res.status(500).json({ error: "Failed to update subscription" });
      }
    }
  }

  console.log("[razorpay-webhook] payment.captured processed", {
    paymentId,
    userId,
    planName,
    amount,
    durationDays,
  });

  return res.status(200).json({ status: "ok" });
}
