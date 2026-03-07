import Razorpay from "razorpay";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    const { amount, plan_id, user_id, phone, duration_days } = req.body;

    const notes = {};
    if (plan_id) {
      notes.plan_id = String(plan_id);
      notes.plan = String(plan_id);
    }
    if (user_id) notes.user_id = String(user_id);
    if (phone) notes.phone = String(phone);
    if (duration_days) notes.duration_days = String(duration_days);

    const options = {
      amount: amount * 100, // Convert to paise
      currency: "INR",
      receipt: "receipt_" + Date.now(),
      notes,
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json(order);
  } catch (error) {
    console.error("Order creation failed:", error);
    res.status(500).json({ error: "Order creation failed" });
  }
}
