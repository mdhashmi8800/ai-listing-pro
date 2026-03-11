import { corsHeaders } from "../_shared/cors.ts"

const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY')

// HMAC SHA256 verification
async function verifySignature(orderId: string, paymentId: string, signature: string, secret: string) {
    const text = orderId + "|" + paymentId;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(text)
    );
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const generatedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return generatedSignature === signature;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            user_id,
            plan_type,
            amount,
            duration_days,
            phone
        } = await req.json()

        // 1. Verify Signature
        const isValid = await verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, RAZORPAY_KEY_SECRET!)

        if (!isValid) {
            return new Response(JSON.stringify({ error: 'Invalid payment signature' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400
            })
        }

        // 2. Initialize Supabase Admin Client
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

        // 3. Get User from profiles table
        const { data: user, error: userError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user_id)
            .single()

        if (userError || !user) throw new Error('User not found')

        // 4. Handle subscription-based plans (duration_days present)
        if (duration_days && Number(duration_days) > 0) {
            const durationDays = Number(duration_days)
            const startDate = new Date()
            const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000)

            // Insert subscription record
            const { error: subError } = await supabase
                .from('subscriptions')
                .insert({
                    user_id,
                    plan_name: plan_type || 'trial',
                    status: 'active',
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                    razorpay_payment_id,
                    razorpay_order_id,
                    amount: amount || 0,
                    phone: phone || null
                })

            if (subError) {
                console.error('Subscription insert error:', subError)
                throw new Error('Failed to create subscription')
            }

            // Update user plan
            await supabase
                .from('profiles')
                .update({
                    plan: plan_type || 'trial',
                    unlimited_until: endDate.toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', user_id)

            // Log payment
            await supabase.from('payments').insert({
                user_id,
                amount: amount || 0,
                plan: plan_type || 'trial',
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature,
                status: 'captured'
            })

            return new Response(
                JSON.stringify({
                    success: true,
                    subscription: true,
                    plan: plan_type,
                    end_date: endDate.toISOString()
                }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200
                }
            )
        }

        return new Response(JSON.stringify({ error: 'duration_days is required for subscription activation' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        })

    } catch (error) {
        console.error('Verify Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400
            }
        )
    }
})
