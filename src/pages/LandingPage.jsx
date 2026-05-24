import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { SignInButton, SignUpButton, useAuth, useClerk } from "@clerk/clerk-react";
import { 
  BookOpen, 
  Search, 
  Sparkles, 
  Clock, 
  Lock, 
  GraduationCap,
  Check,
  X,
  Star,
  ChevronRight,
  ArrowRight,
  Zap,
  Shield,
  Brain,
  MessageCircle,
  Play,
  Quote,
  Menu,
  XIcon,
  Timer,
  Wifi,
  WifiOff,
  Calendar,
  LogIn,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Check if Clerk is configured
const isClerkConfigured = Boolean(process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// Safe auth hook that returns defaults when Clerk is not configured
const useSafeAuth = () => {
  // Only call useAuth if Clerk is configured
  if (!isClerkConfigured) {
    return { isSignedIn: false, isLoaded: true };
  }
  
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAuth();
  } catch {
    return { isSignedIn: false, isLoaded: true };
  }
};

// Wrapper components that only render Clerk components when configured.
// NOTE: these MUST delegate to the imported SignInButton/SignUpButton — recursing
// back into Safe* (the original bug) caused an infinite render loop and crashed
// every CTA on the landing page.
const SafeSignInButton = ({ children, ...props }) => {
  if (!isClerkConfigured) {
    return <Link to="/">{children}</Link>;
  }
  return <SignInButton {...props}>{children}</SignInButton>;
};

const SafeSignUpButton = ({ children, ...props }) => {
  if (!isClerkConfigured) {
    return <Link to="/">{children}</Link>;
  }
  return <SignUpButton {...props}>{children}</SignUpButton>;
};

// SEO Meta component with ASO optimization
const SEOHead = () => {
  useEffect(() => {
    // ASO Optimized Title
    document.title = "Your Student Companion: Study & Focus | Dictionary, Thesaurus & AI Tutor";
    
    // Update meta tags
    const updateMeta = (name, content, isProperty = false) => {
      const attr = isProperty ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attr}="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    // ASO Optimized meta tags
    updateMeta('description', 'Dictionary, Thesaurus & AI Tutor - The best free study app for college. Focus timer with Pomodoro technique, college planner, homework helper, offline dictionary. No subscription required. Alternative to Chegg.');
    updateMeta('keywords', 'focus timer, Pomodoro, college planner, homework helper, offline dictionary, best free study app for college, alternative to Chegg, AI note taker no subscription, student companion, thesaurus, AI tutor, study app, free dictionary');
    updateMeta('robots', 'index, follow');
    updateMeta('author', 'Your Student Companion');
    updateMeta('application-name', 'Your Student Companion: Study & Focus');
    
    // Open Graph tags
    updateMeta('og:title', 'Your Student Companion: Study & Focus | Dictionary, Thesaurus & AI Tutor', true);
    updateMeta('og:description', 'The best free study app for college. Focus timer, Pomodoro, college planner, homework helper, offline dictionary - all FREE.', true);
    updateMeta('og:type', 'website', true);
    updateMeta('og:url', window.location.href, true);
    updateMeta('og:site_name', 'Your Student Companion', true);
    
    // Twitter Card tags
    updateMeta('twitter:card', 'summary_large_image');
    updateMeta('twitter:title', 'Your Student Companion: Study & Focus');
    updateMeta('twitter:description', 'Dictionary, Thesaurus & AI Tutor - Free forever. Focus timer, Pomodoro, homework helper.');

    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', window.location.origin);
  }, []);

  return null;
};

// Animated counter component
const AnimatedCounter = ({ end, duration = 2000, suffix = "" }) => {
  const [count, setCount] = useState(0);
  const countRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (countRef.current) {
      observer.observe(countRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    let startTime;
    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [isVisible, end, duration]);

  return <span ref={countRef}>{count.toLocaleString()}{suffix}</span>;
};

const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isSignedIn } = useSafeAuth();

  const features = [
    {
      icon: Search,
      title: "Offline Dictionary",
      description: "Instant definitions that work anywhere. Search any word, even without internet connection.",
      color: "text-cyan-400",
      keywords: ["offline dictionary", "homework helper"]
    },
    {
      icon: Sparkles,
      title: "Academic Thesaurus",
      description: "Transform simple words into scholarly language. Elevate your essays and papers instantly.",
      color: "text-purple-400",
      keywords: ["thesaurus", "AI tutor"]
    },
    {
      icon: Timer,
      title: "Pomodoro Focus Timer",
      description: "25-minute deep work sessions using the proven Pomodoro Technique. Build unstoppable study habits.",
      color: "text-emerald-400",
      keywords: ["focus timer", "Pomodoro"]
    },
    {
      icon: Brain,
      title: "AI Study Mentor",
      description: "Your personal AI tutor specialized in your subjects. Get help whenever you need it.",
      color: "text-rose-400",
      keywords: ["AI tutor", "homework helper"]
    },
    {
      icon: Calendar,
      title: "College Planner",
      description: "Track your semester with the Truth-Line. Never miss midterms or finals again.",
      color: "text-amber-400",
      keywords: ["college planner"]
    },
    {
      icon: Shield,
      title: "Course Packs",
      description: "Nursing, Pre-Med, Psychology, Business Law, STEM - specialized knowledge packs for your major.",
      color: "text-blue-400",
      keywords: ["homework helper"]
    }
  ];

  const competitors = [
    { name: "Chegg", price: "$19.95/mo", features: [true, true, false, false, true] },
    { name: "Quizlet Plus", price: "$7.99/mo", features: [true, false, false, false, true] },
    { name: "Course Hero", price: "$39.99/mo", features: [true, true, false, false, true] },
    { name: "Student Companion", price: "FREE", features: [true, true, true, true, true], highlight: true }
  ];

  const comparisonFeatures = [
    "Dictionary & Thesaurus",
    "Academic Writing Help",
    "Pomodoro Focus Timer",
    "AI Study Mentor",
    "Mobile & Offline Ready"
  ];

  const testimonials = [
    {
      name: "Sarah M.",
      role: "Nursing Student, UCLA",
      content: "The Pomodoro timer changed my study habits completely. I went from distracted scrolling to focused study sessions. And it's FREE!",
      rating: 5
    },
    {
      name: "James K.",
      role: "Pre-Med, Johns Hopkins",
      content: "Best homework helper I've found. The offline dictionary is perfect for studying in the library basement with no signal.",
      rating: 5
    },
    {
      name: "Maria L.",
      role: "Business Major, NYU",
      content: "Finally ditched my Chegg subscription. This college planner with the Truth-Line keeps me ahead of all my deadlines.",
      rating: 5
    }
  ];

  // FAQ data for SEO
  const faqs = [
    {
      question: "Is Your Student Companion really free?",
      answer: "Yes! 100% free with no subscription required. We believe education tools should be accessible to everyone."
    },
    {
      question: "How does the Pomodoro focus timer work?",
      answer: "Our focus timer uses the proven Pomodoro Technique - 25-minute focused study sessions followed by short breaks. Track your total study time and build better habits."
    },
    {
      question: "Does the dictionary work offline?",
      answer: "Yes! The app caches your recent searches for offline access. Premium Course Packs include full offline dictionary support for your subject area."
    },
    {
      question: "Is this a good alternative to Chegg?",
      answer: "Absolutely! Unlike Chegg ($19.95/mo) or Course Hero ($39.99/mo), Student Companion is completely free. Get dictionary, thesaurus, focus timer, and AI tutoring without any subscription."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEOHead />
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-accent" />
              <div className="flex flex-col">
                <span className="font-semibold text-foreground text-sm leading-tight">Student Companion</span>
                <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">Study & Focus</span>
              </div>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Compare</a>
              <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Reviews</a>
              <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
              
              {isSignedIn ? (
                <Link to="/app">
                  <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                    Launch App
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <SafeSignInButton mode="modal">
                    <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                      <LogIn className="w-4 h-4 mr-2" />
                      Sign In
                    </Button>
                  </SafeSignInButton>
                  <SafeSignUpButton mode="modal">
                    <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                      Get Started
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </SafeSignUpButton>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <button 
              className="md:hidden p-2 text-muted-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-card border-t border-border/50">
            <div className="px-4 py-4 space-y-3">
              <a href="#features" className="block text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Features</a>
              <a href="#pricing" className="block text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Compare</a>
              <a href="#testimonials" className="block text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Reviews</a>
              <a href="#faq" className="block text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
              
              {isSignedIn ? (
                <Link to="/app" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                    Launch App
                  </Button>
                </Link>
              ) : (
                <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                  <SafeSignInButton mode="modal">
                    <Button variant="outline" className="w-full" onClick={() => setMobileMenuOpen(false)}>
                      <LogIn className="w-4 h-4 mr-2" />
                      Sign In
                    </Button>
                  </SafeSignInButton>
                  <SafeSignUpButton mode="modal">
                    <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setMobileMenuOpen(false)}>
                      <User className="w-4 h-4 mr-2" />
                      Get Started Free
                    </Button>
                  </SafeSignUpButton>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-background to-background" />
        
        {/* Animated background elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-4xl mx-auto">
            {/* ASO Keywords Badge */}
            <Badge className="mb-6 bg-accent/10 text-accent border-accent/20 hover:bg-accent/20">
              <Zap className="w-3 h-3 mr-1" />
              Focus Timer • Pomodoro • Offline Dictionary • FREE
            </Badge>

            {/* Main Headline - H1 for SEO */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight mb-6">
              Stop Drowning.
              <span className="block text-accent">Start Evolving.</span>
            </h1>

            {/* ASO Subtitle */}
            <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground mb-4">
              The only student app that doesn't charge you a subscription.
            </p>
            
            {/* ASO Tagline */}
            <p className="text-base sm:text-lg text-accent/80 mb-8 font-medium">
              Dictionary, Thesaurus & AI Tutor — All Free
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              {isSignedIn ? (
                <Link to="/app">
                  <Button size="lg" className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 text-lg px-8 py-6 shadow-glow hover:shadow-glow-strong transition-all">
                    Launch App
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              ) : (
                <SafeSignUpButton mode="modal">
                  <Button size="lg" className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 text-lg px-8 py-6 shadow-glow hover:shadow-glow-strong transition-all">
                    Start Learning Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </SafeSignUpButton>
              )}
              <a href="#features">
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-border/50 text-foreground hover:bg-secondary/50 text-lg px-8 py-6">
                  <Play className="w-5 h-5 mr-2" />
                  See Features
                </Button>
              </a>
            </div>

            {/* Social Proof Stats */}
            <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
              <div className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-foreground">
                  <AnimatedCounter end={50000} suffix="+" />
                </p>
                <p className="text-sm text-muted-foreground">Students</p>
              </div>
              <div className="w-px h-12 bg-border/50 hidden sm:block" />
              <div className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-foreground">
                  <AnimatedCounter end={1200000} suffix="+" />
                </p>
                <p className="text-sm text-muted-foreground">Words Searched</p>
              </div>
              <div className="w-px h-12 bg-border/50 hidden sm:block" />
              <div className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-accent">$0</p>
                <p className="text-sm text-muted-foreground">Forever Free</p>
              </div>
            </div>
          </div>

          {/* Hero Image/App Preview */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
            <div className="relative rounded-xl overflow-hidden border border-border/30 shadow-2xl shadow-accent/10">
              <img 
                src="https://images.pexels.com/photos/5676744/pexels-photo-5676744.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2" 
                alt="College students using Your Student Companion - the best free study app with focus timer, Pomodoro technique, and offline dictionary"
                className="w-full h-auto object-cover opacity-90"
                style={{ maxHeight: '500px' }}
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/50 to-transparent flex items-center">
                <div className="p-8 sm:p-12 max-w-lg">
                  <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                    Your Academic Mission Control
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Pomodoro focus timer, offline dictionary, college planner, AI tutor — everything you need to succeed.
                  </p>
                  {isSignedIn ? (
                    <Link to="/app">
                      <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                        Open Dashboard <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  ) : (
                    <SafeSignUpButton mode="modal">
                      <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                        Try It Free <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </SafeSignUpButton>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-12 border-y border-border/30 bg-card/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-sm text-muted-foreground mb-6">Trusted by students at top universities</p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-16 opacity-60">
            {['Harvard', 'Stanford', 'MIT', 'UCLA', 'NYU', 'Berkeley'].map((uni) => (
              <span key={uni} className="text-lg sm:text-xl font-semibold text-muted-foreground">{uni}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-secondary text-foreground border-border/50">
              Features
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Everything You Need to <span className="text-accent">Succeed</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Focus timer, Pomodoro technique, college planner, homework helper, offline dictionary — all in one free app.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <Card 
                key={idx} 
                className="bg-card/50 border-border/30 hover:border-accent/30 transition-all group hover:shadow-lg hover:shadow-accent/5"
              >
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl bg-secondary/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${feature.color}`}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section id="pricing" className="py-20 sm:py-28 bg-card/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-destructive/10 text-destructive border-destructive/20">
              Save $240+/year
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Why Pay for What Should Be <span className="text-accent">Free?</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Chegg, Quizlet, Course Hero — they all want your money. We believe every student deserves free homework help.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-4 px-4 text-muted-foreground font-medium">Feature</th>
                  {competitors.map((comp, idx) => (
                    <th key={idx} className={`text-center py-4 px-4 ${comp.highlight ? 'bg-accent/10 rounded-t-xl' : ''}`}>
                      <div className={`font-semibold ${comp.highlight ? 'text-accent' : 'text-foreground'}`}>
                        {comp.name}
                      </div>
                      <div className={`text-sm ${comp.highlight ? 'text-accent font-bold' : 'text-muted-foreground'}`}>
                        {comp.price}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((feature, fIdx) => (
                  <tr key={fIdx} className="border-b border-border/30">
                    <td className="py-4 px-4 text-foreground">{feature}</td>
                    {competitors.map((comp, cIdx) => (
                      <td key={cIdx} className={`text-center py-4 px-4 ${comp.highlight ? 'bg-accent/5' : ''}`}>
                        {comp.features[fIdx] ? (
                          <Check className={`w-5 h-5 mx-auto ${comp.highlight ? 'text-accent' : 'text-green-500'}`} />
                        ) : (
                          <X className="w-5 h-5 mx-auto text-muted-foreground/50" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            {isSignedIn ? (
              <Link to="/app">
                <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-glow">
                  Open Your Dashboard
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            ) : (
              <SafeSignUpButton mode="modal">
                <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-glow">
                  Get Your Free Homework Helper
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </SafeSignUpButton>
            )}
            <p className="mt-4 text-sm text-muted-foreground">No credit card. No trial. Free forever.</p>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-secondary text-foreground border-border/50">
              <Star className="w-3 h-3 mr-1 fill-current" />
              4.9/5 Average Rating
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Students Love Our <span className="text-accent">Free Study App</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Join thousands who've discovered the best alternative to expensive study subscriptions.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, idx) => (
              <Card key={idx} className="bg-card/50 border-border/30">
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {Array(testimonial.rating).fill(0).map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-amber-400 fill-current" />
                    ))}
                  </div>
                  <Quote className="w-8 h-8 text-accent/20 mb-2" />
                  <p className="text-foreground mb-4">"{testimonial.content}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                      <span className="text-accent font-semibold">{testimonial.name[0]}</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{testimonial.name}</p>
                      <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 sm:py-28 bg-card/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-secondary text-foreground border-border/50">
              FAQ
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Frequently Asked <span className="text-accent">Questions</span>
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <Card key={idx} className="bg-card border-border/30">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-foreground mb-2">{faq.question}</h3>
                  <p className="text-sm text-muted-foreground">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-accent/5 to-background" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl" />
        
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-6">
            Ready for the Best <span className="text-accent">Free Study App?</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Focus timer, Pomodoro technique, college planner, offline dictionary, AI tutor — all free. Join 50,000+ students today.
          </p>
          {isSignedIn ? (
            <Link to="/app">
              <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg px-10 py-6 shadow-glow hover:shadow-glow-strong transition-all">
                Go to Dashboard
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          ) : (
            <SafeSignUpButton mode="modal">
              <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg px-10 py-6 shadow-glow hover:shadow-glow-strong transition-all">
                Start Using Student Companion
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </SafeSignUpButton>
          )}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-accent" />
              100% Free Forever
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-accent" />
              Quick Sign-up
            </span>
            <span className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-accent" />
              Works Offline
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-accent" />
              <div>
                <span className="font-semibold text-foreground">Your Student Companion</span>
                <span className="text-xs text-muted-foreground block">Study & Focus</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors">Features</a>
              <a href="#pricing" className="hover:text-foreground transition-colors">Compare</a>
              <a href="#testimonials" className="hover:text-foreground transition-colors">Reviews</a>
              <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
              {isSignedIn ? (
                <Link to="/app" className="hover:text-accent transition-colors">Dashboard</Link>
              ) : (
                <SafeSignInButton mode="modal">
                  <button className="hover:text-accent transition-colors">Sign In</button>
                </SafeSignInButton>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Free forever.
            </p>
          </div>
          
          {/* SEO Footer Text */}
          <div className="mt-8 pt-8 border-t border-border/30 text-center">
            <p className="text-xs text-muted-foreground/60 max-w-3xl mx-auto">
              Your Student Companion: Study & Focus is the best free study app for college. Features include focus timer with Pomodoro technique, 
              college planner, homework helper, offline dictionary, academic thesaurus, and AI tutor. The perfect alternative to Chegg, Quizlet, 
              and Course Hero — without the subscription fees.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
