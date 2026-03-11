"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState, useRef } from "react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

// Client-side Supabase instance — requires NEXT_PUBLIC_ env vars on Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

interface Plan {
  id: string;
  name: string;
  price: string;
  amount: number;
  duration_days: number;
  period: string;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
  badge: string | null;
  badgeColor: string;
}



const plans: Plan[] = [
  {
    id: "trial",
    name: "Trial",
    price: "₹79",
    amount: 79,
    duration_days: 10,
    period: "10 DAYS",
    description: "Try all AI tools for 10 days.",
    features: [
      "All 6 AI tools included",
      "10 days full access",
      "Google login",
      "Shipping optimizer",
      "Community support",
    ],
    cta: "Start Trial",
    highlighted: false,
    badge: null,
    badgeColor: "",
  },
  {
    id: "monthly",
    name: "Monthly",
    price: "₹299",
    amount: 299,
    duration_days: 30,
    period: "/month",
    description: "Full access for active sellers.",
    features: [
      "All AI tools unlocked",
      "30 days access",
      "Listing & title generator",
      "Image optimizer",
      "Priority support",
    ],
    cta: "Subscribe Monthly",
    highlighted: true,
    badge: "POPULAR",
    badgeColor: "from-primary to-purple-400",
  },
  {
    id: "quarterly",
    name: "3 Months",
    price: "₹899",
    amount: 899,
    duration_days: 90,
    period: "/ 3 MONTHS",
    description: "Save ₹98 vs monthly billing.",
    features: [
      "All AI tools unlocked",
      "90 days access",
      "Profit calculator",
      "Keyword generator",
      "Priority support",
    ],
    cta: "Get 3 Months",
    highlighted: false,
    badge: null,
    badgeColor: "",
  },
  {
    id: "half_yearly",
    name: "6 Months",
    price: "₹1499",
    amount: 1499,
    duration_days: 180,
    period: "/ 6 MONTHS",
    description: "Save ₹295 vs monthly billing.",
    features: [
      "All AI tools unlocked",
      "180 days access",
      "All optimization features",
      "Dedicated support",
      "Early access to new tools",
    ],
    cta: "Get 6 Months",
    highlighted: false,
    badge: null,
    badgeColor: "",
  },
  {
    id: "yearly",
    name: "Yearly",
    price: "₹2099",
    amount: 2099,
    duration_days: 365,
    period: "/ YEAR",
    description: "Best value — save ₹1489 per year.",
    features: [
      "All AI tools unlocked",
      "365 days access",
      "All optimization features",
      "VIP priority support",
      "Early access to new tools",
      "Exclusive seller insights",
    ],
    cta: "Get Best Value",
    highlighted: false,
    badge: "BEST VALUE",
    badgeColor: "from-accent to-emerald-400",
  },
];



export default function Pricing() {
  const [userId, setUserId] = useState<string | null>(null);
  const [payingPlan, setPayingPlan] = useState<string | null>(null);
  const pendingPlanRef = useRef<Plan | null>(null);

  useEffect(() => {
    if (!supabase) return;
    // Check for existing session
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
    // Listen for auth changes (e.g. after OAuth redirect)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      // If user just logged in and had a pending plan, start payment
      if (uid && pendingPlanRef.current) {
        const plan = pendingPlanRef.current;
        pendingPlanRef.current = null;
        startPayment(plan, uid);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (plan: Plan) => {
    if (!supabase) {
      alert("Authentication is not configured. Please use the Chrome extension to subscribe.");
      return;
    }
    pendingPlanRef.current = plan;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/#pricing" },
    });
  };

  const startPayment = async (plan: Plan, uid?: string) => {
    const currentUserId = uid || userId;
    if (!currentUserId) {
      handleLogin(plan);
      return;
    }

    try {
      setPayingPlan(plan.id);

      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: plan.amount,
          plan_id: plan.id,
          user_id: currentUserId,
          duration_days: plan.duration_days,
        }),
      });

      const order = await res.json();

      if (!order.id) {
        alert(order.error || "Failed to create order");
        return;
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: "INR",
        name: "AI Listing Pro",
        description: plan.name,
        order_id: order.id,
        notes: {
          user_id: currentUserId,
          plan: plan.id,
          duration_days: String(plan.duration_days),
        },
        handler: async function (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) {
          try {
            const verifyRes = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                user_id: currentUserId,
                plan: plan.id,
                duration_days: plan.duration_days,
                amount: plan.amount,
              }),
            });
            const result = await verifyRes.json();
            if (result.success) {
              alert("Payment Successful! Your subscription is now active.");
              window.location.reload();
            } else {
              alert("Payment verification failed. Please contact support.");
            }
          } catch {
            alert("Payment verification failed. Please contact support.");
          }
        },
        modal: {
          ondismiss: () => setPayingPlan(null),
        },
        theme: { color: "#7c3aed" },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error("Payment error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setPayingPlan(null);
    }
  };



  return (
    <section id="pricing" className="py-20 md:py-28 bg-surface">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">
            Pricing Plans
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-muted text-lg">
            Subscribe for unlimited access to all AI tools.
            No hidden fees. UPI payment via Razorpay.
          </p>
        </div>

        {/* ── SUBSCRIPTION PLANS ── */}
        <div className="text-center mb-8">
          <h3 className="text-xl font-bold text-foreground mb-1">⚡ Unlimited Access Plans</h3>
          <p className="text-muted text-sm">All AI tools unlimited during your plan period</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`relative rounded-2xl p-7 border transition-all duration-300 hover:-translate-y-1 ${
                plan.highlighted
                  ? "bg-surface-2 border-primary shadow-xl shadow-primary/15 scale-[1.02]"
                  : plan.badge
                  ? "bg-surface-2 border-accent/40 hover:shadow-lg hover:shadow-accent/10"
                  : "bg-surface-2 border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10"
              }`}
            >
              {plan.badge && (
                <div
                  className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r ${plan.badgeColor} text-white text-xs font-bold rounded-full whitespace-nowrap`}
                >
                  {plan.badge}
                </div>
              )}
              <h3 className="text-lg font-bold mb-1 text-foreground">{plan.name}</h3>
              <p className="text-muted text-xs mb-5">{plan.description}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-extrabold text-foreground">{plan.price}</span>
                <span className="text-muted text-xs uppercase">{plan.period}</span>
              </div>
              <ul className="space-y-2.5 mb-6">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-muted">
                    <svg
                      className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                        plan.highlighted
                          ? "text-primary"
                          : "text-accent"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => startPayment(plan)}
                disabled={payingPlan === plan.id}
                className={`w-full py-3 rounded-full font-semibold text-sm transition-all cursor-pointer ${
                  plan.highlighted
                    ? "bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/25"
                    : plan.badge
                    ? "bg-accent text-white hover:bg-accent-dark shadow-lg shadow-accent/25"
                    : "bg-surface text-foreground border border-border hover:border-primary/30 hover:bg-primary/5"
                }`}
              >
                {payingPlan === plan.id ? "Processing..." : plan.cta}
              </button>
            </div>
          ))}
        </div>





        {/* UPI badge */}
        <div className="text-center mt-12 flex items-center justify-center gap-2 text-muted text-sm">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          Secure UPI Payment via Razorpay
        </div>
      </div>
    </section>
  );
}
