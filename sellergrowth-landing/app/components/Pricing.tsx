"use client";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const plans = [
  {
    name: "Trial",
    price: "₹79",
    amount: 79,
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
    name: "Monthly",
    price: "₹299",
    amount: 299,
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
    name: "3 Months",
    price: "₹899",
    amount: 899,
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
    name: "6 Months",
    price: "₹1499",
    amount: 1499,
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
    name: "Yearly",
    price: "₹2099",
    amount: 2099,
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
  const startPayment = async (amount: number, plan: string) => {
    try {
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, plan }),
      });

      const order = await res.json();

      if (!order.id) {
        alert("Failed to create order");
        return;
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: "INR",
        name: "AI Listing Pro",
        description: plan,
        order_id: order.id,
        handler: async function () {
          alert("Payment Successful! Your subscription is now active.");
          window.location.reload();
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error("Payment error:", err);
      alert("Something went wrong. Please try again.");
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
            Pick a subscription that fits your selling goals. No hidden fees. UPI
            payment via Razorpay.
          </p>
        </div>

        {/* Cards — responsive grid */}
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
                onClick={() => startPayment(plan.amount, plan.name)}
                className={`w-full py-3 rounded-full font-semibold text-sm transition-all cursor-pointer ${
                  plan.highlighted
                    ? "bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/25"
                    : plan.badge
                    ? "bg-accent text-white hover:bg-accent-dark shadow-lg shadow-accent/25"
                    : "bg-surface text-foreground border border-border hover:border-primary/30 hover:bg-primary/5"
                }`}
              >
                {plan.cta}
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
