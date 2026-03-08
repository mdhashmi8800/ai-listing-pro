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
    console.log("CREATE ORDER REQUEST BODY:", req.body);

    const { amount, plan_id, user_id, phone, duration_days } = req.body;

    console.log("USER ID:", user_id);
    console.log("PLAN:", plan_id);
    console.log("DURATION:", duration_days);
    console.log("AMOUNT:", amount);

    if (!user_id || !plan_id || !duration_days || !amount) {
      console.log("MISSING FIELDS:", { user_id, plan_id, duration_days, amount });
      return res.status(400).json({ error: "Missing required fields: user_id, plan_id, duration_days, amount" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "order_" + Date.now(),
      notes: {
        user_id: String(user_id),
        plan: String(plan_id),
        duration_days: String(duration_days),
        ...(phone ? { phone: String(phone) } : {}),
      },
    });

    console.log("RAZORPAY ORDER:", order);

    res.status(200).json(order);
  } catch (error) {
    console.error("Order creation failed:", error);
    res.status(500).json({ error: "Order creation failed" });
  }
}
