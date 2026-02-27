import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — SellerGrowth",
  description: "Terms of Service for SellerGrowth and AI Listing Pro.",
};

export default function Terms() {
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
          Terms of Service
        </h1>
        <p className="text-muted text-sm mb-8">
          Last updated: February 27, 2026
        </p>

        <section className="space-y-6 text-muted leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              1. Acceptance of Terms
            </h2>
            <p>
              By using SellerGrowth (&quot;AI Listing Pro&quot;), you agree to
              these Terms of Service. If you do not agree, please do not use
              our services.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              2. Description of Service
            </h2>
            <p>
              SellerGrowth is an independent, third-party productivity tool for
              Meesho sellers. It is not affiliated with, endorsed by, or
              officially connected to Meesho in any way.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              3. User Accounts
            </h2>
            <p>
              You are responsible for maintaining the confidentiality of your
              account. You must use a valid Google account for authentication.
              You agree not to misuse the service for any unlawful purpose.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              4. Subscriptions &amp; Payments
            </h2>
            <p>
              Pro plan subscriptions are billed monthly through Razorpay. Prices
              are in Indian Rupees (₹). We reserve the right to change pricing
              with prior notice.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              5. Limitation of Liability
            </h2>
            <p>
              SellerGrowth is provided &quot;as is&quot; without warranties of any kind. We
              are not liable for any damages arising from the use of our
              service or any actions taken on the Meesho platform based on our
              suggestions.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              6. Contact
            </h2>
            <p>
              For questions about these terms, contact us at{" "}
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
