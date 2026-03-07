import { corsHeaders } from "../_shared/cors.ts"

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response("Method Not Allowed", {
            status: 405,
            headers: corsHeaders
        });
    }

    let body: any;
    try {
        body = await req.json();
        console.log("Incoming body:", body);
    } catch {
        return new Response("Invalid JSON", {
            status: 400,
            headers: corsHeaders
        });
    }

    if (!body?.amount) {
        return new Response("Amount is required", {
            status: 400,
            headers: corsHeaders
        });
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid amount" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!keyId || !keySecret) {
        return new Response("Razorpay keys missing", {
            status: 500,
            headers: corsHeaders
        });
    }

    const auth = btoa(`${keyId}:${keySecret}`);

    // Build notes for Razorpay order (passed through to verify-payment)
    const notes: Record<string, string> = {};
    if (body.plan_id) {
      notes.plan_id = String(body.plan_id);
      notes.plan = String(body.plan_id);
    }
    if (body.user_id) notes.user_id = String(body.user_id);
    if (body.phone) notes.phone = String(body.phone);
    if (body.duration_days) notes.duration_days = String(body.duration_days);

    try {
        const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
            method: "POST",
            headers: {
                "Authorization": `Basic ${auth}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                amount: Math.round(amount * 100), // Razorpay expects paise
                currency: "INR",
                notes,
            }),
        });

        const data = await razorpayRes.json();

        if (!razorpayRes.ok) {
            console.error("Razorpay error:", data);
            return new Response(JSON.stringify(data), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Error creating order:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
