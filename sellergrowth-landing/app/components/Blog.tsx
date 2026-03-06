const blogPosts = [
  {
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=400&fit=crop",
    category: "E-commerce Tips",
    date: "Feb 20, 2026",
    title: "10 Tips to Boost Your Meesho Sales in 2026",
    description:
      "Learn proven strategies to increase your visibility and convert more customers on Meesho marketplace.",
    author: "Priya Sharma",
  },
  {
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=400&fit=crop",
    category: "Product Listing",
    date: "Feb 15, 2026",
    title: "How to Write Product Descriptions That Sell",
    description:
      "Master the art of compelling product descriptions with AI-powered optimization techniques.",
    author: "Rahul Verma",
  },
  {
    image: "https://images.unsplash.com/photo-1553729459-uj7y7w7x1z0j?w=600&h=400&fit=crop",
    category: "Seller Growth",
    date: "Feb 10, 2026",
    title: "From 0 to 1000 Orders: A Seller Success Story",
    description:
      "Discover how one seller transformed their business using smart automation and AI tools.",
    author: "Amit Kumar",
  },
];

export default function Blog() {
  return (
    <section id="blog" className="py-20 md:py-28 bg-surface">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">
            Blog
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Latest Tips & Insights
          </h2>
          <p className="mt-4 text-muted text-lg">
            Stay updated with the latest e-commerce trends, seller tips, and 
            strategies to grow your Meesho business.
          </p>
        </div>

        {/* Blog Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {blogPosts.map((post, i) => (
            <article
              key={i}
              className="group bg-surface-2 rounded-2xl overflow-hidden border border-border hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300"
            >
              {/* Image */}
              <div className="relative h-48 overflow-hidden bg-surface">
                <img
                  src={post.image}
                  alt={post.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <span className="absolute top-4 left-4 bg-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                  {post.category}
                </span>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-sm text-muted mb-2">{post.date}</p>
                <h3 className="text-lg font-semibold mb-3 group-hover:text-primary transition-colors line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-muted text-sm leading-relaxed mb-4 line-clamp-2">
                  {post.description}
                </p>
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <span className="text-sm font-medium">{post.author}</span>
                  <a
                    href="#"
                    className="text-primary text-sm font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    Read More
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* View All Button */}
        <div className="text-center mt-12">
          <a
            href="#"
            className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3 rounded-full font-semibold hover:bg-primary-dark transition-colors"
          >
            View All Posts
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
