export default function About() {
  return (
    <section id="about" className="py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">
            About
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            Built for Meesho sellers, by someone who gets it
          </h2>
          <div className="space-y-4 text-muted text-lg leading-relaxed">
            <p>
              <strong className="text-foreground">AI Listing Pro</strong> is an
              independent productivity tool designed to help Meesho sellers
              optimize their product listings, automate repetitive workflows,
              and grow their business faster.
            </p>
            <p>
              This is <strong className="text-foreground">not</strong> an official Meesho
              product. It&apos;s a third-party tool built with love to solve real
              problems that sellers face every day — from writing better product
              titles to managing catalogs at scale.
            </p>
          </div>

          {/* Developer card */}
          <div className="mt-12 inline-flex items-center gap-4 bg-surface border border-border rounded-2xl px-8 py-6">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              MH
            </div>
            <div className="text-left">
              <p className="font-semibold text-lg">MD Hashmi</p>
              <p className="text-muted text-sm">
                Developer &amp; Creator of SellerGrowth
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
