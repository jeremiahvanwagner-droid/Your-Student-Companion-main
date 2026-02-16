import { Heart, Github, ExternalLink } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border/30 py-6">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Branding */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Built with</span>
            <Heart className="w-3.5 h-3.5 text-destructive" />
            <span>for students everywhere</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-4">
            <a 
              href="https://dictionaryapi.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent transition-colors"
            >
              <span>Free Dictionary API</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Copyright */}
        <p className="text-center text-xs text-muted-foreground/50 mt-4">
          © {new Date().getFullYear()} Your Student Companion. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
