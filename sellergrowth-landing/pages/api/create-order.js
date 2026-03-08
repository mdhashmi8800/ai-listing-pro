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

    const { amount, plan_id, user_id, phone, duration_days, credits_to_add } = req.body;

    console.log("USER ID:", user_id);
    console.log("PLAN:", plan_id);
    console.log("DURATION:", duration_days);
    console.log("CREDITS_TO_ADD:", credits_to_add);
    console.log("AMOUNT:", amount);

    if (!user_id || !plan_id || !amount) {
      console.log("MISSING FIELDS:", { user_id, plan_id, amount });
      return res.status(400).json({ error: "Missing required fields: user_id, plan_id, amount" });
    }

    // Must have either duration_days (subscription) or credits_to_add (credit pack)
    if (!duration_days && !credits_to_add) {
      return res.status(400).json({ error: "Missing duration_days or credits_to_add" });
    }

    const notes = {
      user_id: String(user_id),
      plan: String(plan_id),
      ...(phone ? { phone: String(phone) } : {}),
    };
    if (credits_to_add) {
      notes.credits_to_add = String(credits_to_add);
    }
    if (duration_days) {
      notes.duration_days = String(duration_days);
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "order_" + Date.now(),
      notes,
    });

    console.log("RAZORPAY ORDER:", order);

    res.status(200).json(order);
  } catch (error) {
    console.error("Order creation failed:", error);
    res.status(500).json({ error: "Order creation failed" });
  }
}
