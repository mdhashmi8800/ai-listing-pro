"use client";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const plans = [
  {
    name: "Starter",
    price: "₹79",
    amount: 79,
    period: "ONE-TIME",
    description: "50 Credits (+25 Bonus on 1st Buy)",
    features: [
      "50 optimization credits",
      "25 bonus credits on first purchase",
      "Google login",
      "Basic listing analysis",
      "Community support",
    ],
    cta: "Buy Starter",
    highlighted: false,
    badge: null,
    badgeColor: "",
  },
  {
    name: "Growth",
    price: "₹149",
    amount: 149,
    period: "ONE-TIME",
    description: "200 Credits — best value for growing sellers.",
    features: [
      "200 optimization credits",
      "Smart listing optimization",
      "Workflow automation",
      "Cloud sync across devices",
      "Priority support",
    ],
    cta: "Buy Growth",
    highlighted: true,
    badge: "MOST POPULAR",
    badgeColor: "from-primary to-accent",
  },
  {
    name: "Pro Monthly",
    price: "₹249",
    amount: 249,
    period: "/mo · AUTO-RENEW",
    description: "500 Credits/month — for power sellers.",
    features: [
      "500 credits every month",
      "Unlimited listing optimization",
      "Advanced analytics & bulk editing",
      "Priority support",
      "Cloud sync across devices",
      "Auto-renewal for uninterrupted access",
    ],
    cta: "Subscribe Pro",
    highlighted: false,
    badge: "POWER SELLERS",
    badgeColor: "from-emerald-500 to-emerald-600",
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
        handler: async function (response: any) {
          alert("Payment Successful!");
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
            Upgrade Credits
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-muted text-lg">
            Pick a plan that fits your selling goals. No hidden fees.
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`relative rounded-2xl p-8 border transition-all ${
                plan.highlighted
                  ? "bg-white border-primary shadow-xl shadow-primary/10 scale-[1.02]"
                  : plan.badge
                  ? "bg-white border-emerald-400 hover:shadow-lg"
                  : "bg-white border-border hover:border-primary/20 hover:shadow-lg"
              }`}
            >
              {plan.badge && (
                <div
                  className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r ${plan.badgeColor} text-white text-xs font-bold rounded-full whitespace-nowrap`}
                >
                  {plan.badge}
                </div>
              )}
              <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
              <p className="text-muted text-sm mb-6">{plan.description}</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-extrabold">{plan.price}</span>
                <span className="text-muted text-xs uppercase">{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm">
                    <svg
                      className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        plan.highlighted
                          ? "text-primary"
                          : plan.badge
                          ? "text-emerald-500"
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
                onClick={() => {
                  if (plan.name === "Starter") {
                    startPayment(79, "Starter");
                    return;
                  }

                  if (plan.name === "Growth") {
                    startPayment(149, "Growth");
                    return;
                  }

                  startPayment(249, "Pro Monthly");
                }}
                className={`w-full py-3 rounded-full font-semibold text-sm transition-all ${
                  plan.highlighted
                    ? "bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/25"
                    : plan.badge
                    ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/25"
                    : "bg-surface text-foreground border border-border hover:bg-primary-light hover:border-primary/30"
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
