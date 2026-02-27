import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — SellerGrowth",
  description: "Privacy Policy for SellerGrowth and AI Listing Pro.",
};

export default function PrivacyPolicy() {
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
          Privacy Policy
        </h1>
        <p className="text-muted text-sm mb-8">
          Last updated: February 27, 2026
        </p>

        <section className="space-y-6 text-muted leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              1. Information We Collect
            </h2>
            <p>
              When you use SellerGrowth (&quot;AI Listing Pro&quot;), we may
              collect your Google account information (name, email, profile
              picture) for authentication purposes. We do not collect payment
              card details directly — all payments are processed through
              Razorpay, a PCI-DSS compliant payment gateway.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              2. How We Use Your Data
            </h2>
            <p>
              Your data is used to provide and improve our services, including
              listing optimization, workflow automation, and cloud sync
              features. We do not sell or share your personal data with third
              parties for marketing purposes.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              3. Data Storage
            </h2>
            <p>
              Your data is securely stored using Supabase infrastructure with
              encryption at rest and in transit. We retain your data only as
              long as your account is active.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              4. Third-Party Services
            </h2>
            <p>
              We use third-party services including Google OAuth, Supabase, and
              Razorpay. Each service has its own privacy policy governing data
              handling.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              5. Contact
            </h2>
            <p>
              For privacy-related inquiries, contact us at{" "}
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
