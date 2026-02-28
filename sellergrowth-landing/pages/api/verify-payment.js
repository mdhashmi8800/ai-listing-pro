import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const secret = "AIListingProWebhook2026Secure"; // same as Razorpay webhook secret

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks);

  const signature = req.headers["x-razorpay-signature"];

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSignature) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody.toString());

  if (event.event === "payment.captured") {
    const payment = event.payload.payment.entity;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase.from("subscriptions").insert({
      email: payment.email,
      plan: payment.notes?.plan || "unknown",
      payment_id: payment.id,
      expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    console.log("Subscription saved ✅");
  }

  return res.status(200).json({ status: "ok" });
}