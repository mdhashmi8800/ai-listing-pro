export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Brand */}
          <div className="text-center md:text-left">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-primary">AI Listing</span>{" "}
              <span className="text-foreground">Pro</span>
            </span>
            <p className="text-sm text-muted mt-1">
              AI-powered tools for Meesho sellers.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <a
              href="/privacy"
              className="text-muted hover:text-foreground transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              className="text-muted hover:text-foreground transition-colors"
            >
              Terms of Service
            </a>
            <a
              href="/refund"
              className="text-muted hover:text-foreground transition-colors"
            >
              Refund Policy
            </a>
            <a
              href="mailto:support@sellergrowth.xyz"
              className="text-muted hover:text-foreground transition-colors"
            >
              Contact
            </a>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-8 border-t border-border text-center text-xs text-muted">
          &copy; {new Date().getFullYear()} AI Listing Pro. All rights reserved.
          Built by MD Hashmi.
        </div>
      </div>
    </footer>
  );
}
