const features = [
  {
    icon: "🚚",
    title: "AI Shipping Optimizer",
    description:
      "Upload a product image and let AI run intelligent search iterations to achieve your target shipping cost — with real-time best result tracking.",
  },
  {
    icon: "📝",
    title: "AI Listing Generator",
    description:
      "Generate optimized product listings with AI-powered descriptions, bullet points, and SEO-friendly content tailored for Meesho marketplace.",
  },
  {
    icon: "✏️",
    title: "AI Product Title Generator",
    description:
      "Create high-converting product titles with keyword optimization that improves search visibility and click-through rates on Meesho.",
  },
  {
    icon: "🖼️",
    title: "AI Image Optimizer",
    description:
      "Automatically optimize product images for better quality, faster loading, and lower shipping costs through smart compression.",
  },
  {
    icon: "💰",
    title: "Profit Calculator",
    description:
      "Calculate exact profit margins after shipping, commission, and GST. Make informed pricing decisions for every product listing.",
  },
  {
    icon: "🔑",
    title: "Keyword Generator",
    description:
      "Discover high-performing keywords for your product listings. Boost visibility and rank higher in Meesho search results.",
  },
];

export default function Features() {
  return (
    <section id="features" className="relative py-24 md:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-surface to-background" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/[0.05] rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Core AI Tools
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight">
            Powerful tools built for{" "}
            <span className="text-primary">Meesho sellers</span>
          </h2>
          <p className="mt-5 text-muted text-lg md:text-xl leading-relaxed max-w-2xl mx-auto">
            Save time, improve product ranking, and optimize listings
            automatically with our AI-powered toolkit.
          </p>
        </div>

        {/* Feature Cards — 3-column grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map((f, i) => (
            <div
              key={i}
              className="group relative bg-surface rounded-2xl p-8 border border-border hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              <div className="relative">
                {/* Icon */}
                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-primary/10 text-2xl mb-6 group-hover:bg-primary/20 transition-colors duration-300">
                  {f.icon}
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold mb-3 tracking-tight text-foreground">
                  {f.title}
                </h3>

                {/* Description */}
                <p className="text-muted text-sm leading-relaxed">
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <p className="text-muted text-sm mb-5">
            And much more — built to save you hours every week.
          </p>
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3.5 rounded-full font-semibold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/25"
          >
            Start Optimizing Now
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
