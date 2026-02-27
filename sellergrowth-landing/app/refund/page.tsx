import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy — SellerGrowth",
  description: "Refund Policy for SellerGrowth and AI Listing Pro.",
};

export default function RefundPolicy() {
  return (
    <main className="min-h-screen py-32 px-6">
      <article className="max-w-3xl mx-auto prose prose-slate">
        <a
          href="/"
          className="inline-flex items-center gap-1 text-sm text-primary font-medium mb-8 no-underline hover:underline"
        >
          ← Back to Home
        </a>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
          Refund Policy
        </h1>
        <p className="text-muted text-sm mb-8">
          Last updated: February 27, 2026
        </p>

        <section className="space-y-6 text-muted leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              1. Eligibility
            </h2>
            <p>
              If you are not satisfied with your Pro plan subscription, you may
              request a refund within 7 days of your payment. Refund requests
              made after 7 days will be evaluated on a case-by-case basis.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              2. How to Request a Refund
            </h2>
            <p>
              To request a refund, email us at{" "}
              <a
                href="mailto:support@sellergrowth.xyz"
                className="text-primary hover:underline"
              >
                support@sellergrowth.xyz
              </a>{" "}
              with your registered email address and reason for the refund. We
              will respond within 3 business days.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              3. Processing
            </h2>
            <p>
              Approved refunds will be processed within 5–7 business days.
              Refunds will be credited to your original payment method through
              Razorpay.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              4. Non-Refundable
            </h2>
            <p>
              Partial month usage is non-refundable. If you cancel your
              subscription, you retain access until the end of your current
              billing cycle.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              5. Contact
            </h2>
            <p>
              For refund inquiries, reach out to{" "}
              <a
                href="mailto:support@sellergrowth.xyz"
                className="text-primary hover:underline"
              >
                support@sellergrowth.xyz
              </a>
              .
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}
