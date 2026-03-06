export default function Contact() {
  return (
    <section id="contact" className="py-20 md:py-28 bg-surface">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">
            Contact
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Have questions? Reach out.
          </h2>
          <p className="text-muted text-lg mb-10">
            We&apos;d love to hear from you. Whether it&apos;s feedback, support, or a
            partnership inquiry — drop us a line.
          </p>

          <a
            href="mailto:support@sellergrowth.xyz"
            className="inline-flex items-center gap-3 px-8 py-4 bg-surface-2 border border-border rounded-2xl hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 transition-all group"
          >
            <svg
              className="w-6 h-6 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <span className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
              support@sellergrowth.xyz
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
