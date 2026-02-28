import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const secret = "AIListingProWebhook2026Secure";

  const signature = req.headers["x-razorpay-signature"];

  const body = JSON.stringify(req.body);

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (signature === expectedSignature) {
    console.log("Payment Verified ✅");

    // 👉 Yahan baad me Supabase update karenge
    // user ko PRO banayenge

    res.status(200).json({ status: "ok" });
  } else {
    res.status(400).json({ status: "invalid signature" });
  }
}