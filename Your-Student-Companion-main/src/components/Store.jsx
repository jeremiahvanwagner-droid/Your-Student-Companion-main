import { useState } from "react";
import { 
  Package, 
  Lock, 
  Sparkles, 
  Stethoscope, 
  Brain, 
  Scale, 
  Heart,
  Atom,
  CheckCircle2,
  Star,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// Course pack data with Stripe payment links
const COURSE_PACKS = [
  {
    id: "nursing",
    name: "Nursing Pack",
    description: "Comprehensive nursing terminology, pharmacology, and patient care concepts.",
    icon: Stethoscope,
    price: 9.99,
    features: ["500+ Medical Terms", "Drug Interactions", "Care Procedures", "AI Mentor Access"],
    color: "from-rose-500/20 to-pink-500/20",
    borderColor: "border-rose-500/30",
    iconColor: "text-rose-400",
    popular: true,
    paymentLink: "https://buy.stripe.com/test_eVq5kF0l71jV22fcw6bjW00"
  },
  {
    id: "psych101",
    name: "Psych 101 Pack",
    description: "Essential psychology concepts, theories, and research methodologies.",
    icon: Brain,
    price: 24.99,
    features: ["Key Theories", "Research Methods", "Case Studies", "AI Mentor Access"],
    color: "from-purple-500/20 to-violet-500/20",
    borderColor: "border-purple-500/30",
    iconColor: "text-purple-400",
    popular: false,
    paymentLink: null // No payment link yet
  },
  {
    id: "business-law",
    name: "Business Law Pack",
    description: "Contract law, corporate regulations, and legal terminology for business.",
    icon: Scale,
    price: 9.99,
    features: ["Contract Terms", "Corporate Law", "Case Precedents", "AI Mentor Access"],
    color: "from-amber-500/20 to-orange-500/20",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-400",
    popular: false,
    paymentLink: "https://buy.stripe.com/test_eVq5kF0l71jV22fcw6bjW00"
  },
  {
    id: "pre-med",
    name: "Pre-Med Pack",
    description: "MCAT preparation, anatomy, biochemistry, and medical school essentials.",
    icon: Heart,
    price: 39.99,
    features: ["MCAT Prep", "Anatomy Atlas", "Biochemistry", "AI Mentor Access"],
    color: "from-red-500/20 to-rose-500/20",
    borderColor: "border-red-500/30",
    iconColor: "text-red-400",
    popular: true,
    paymentLink: null // No payment link yet
  },
  {
    id: "stem",
    name: "STEM Foundations Pack",
    description: "Physics, chemistry, and advanced mathematics for engineering students.",
    icon: Atom,
    price: 29.99,
    features: ["Physics Formulas", "Chemistry Concepts", "Calculus", "AI Mentor Access"],
    color: "from-cyan-500/20 to-teal-500/20",
    borderColor: "border-cyan-500/30",
    iconColor: "text-cyan-400",
    popular: false,
    paymentLink: null // No payment link yet
  }
];

const STORAGE_KEY = "studentCompanion_unlockedPacks";

// Get unlocked packs from localStorage
const getUnlockedPacks = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

// Save unlocked pack to localStorage
const saveUnlockedPack = (packId) => {
  const current = getUnlockedPacks();
  if (!current.includes(packId)) {
    const updated = [...current, packId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  }
  return current;
};

const Store = ({ onPackUnlock }) => {
  const [unlockedPacks, setUnlockedPacks] = useState(getUnlockedPacks());
  const [selectedPack, setSelectedPack] = useState(null);

  const handleUnlock = (pack) => {
    // Check if pack has a Stripe payment link
    if (pack.paymentLink) {
      // Open Stripe payment link in new tab
      window.open(pack.paymentLink, '_blank', 'noopener,noreferrer');
      
      toast.info(`Redirecting to checkout...`, {
        description: `Complete payment to unlock ${pack.name}`,
      });
      return;
    }
    
    // Fallback for packs without payment links (demo mode)
    toast.success(`${pack.name} unlocked!`, {
      description: "Your AI Mentor is now specialized for this subject.",
    });
    
    const updated = saveUnlockedPack(pack.id);
    setUnlockedPacks(updated);
    onPackUnlock?.(pack.id);
  };

  const isUnlocked = (packId) => unlockedPacks.includes(packId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Package className="w-5 h-5 text-accent" />
          <h2 className="text-xl font-semibold text-foreground">Premium Course Packs</h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Unlock specialized knowledge and activate your AI Mentor for each subject area.
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-accent" />
          <span className="text-muted-foreground">
            {unlockedPacks.length} of {COURSE_PACKS.length} unlocked
          </span>
        </div>
      </div>

      {/* Course Pack Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COURSE_PACKS.map((pack) => {
          const IconComponent = pack.icon;
          const unlocked = isUnlocked(pack.id);
          const hasPaymentLink = !!pack.paymentLink;
          
          return (
            <Card 
              key={pack.id}
              className={`
                relative overflow-hidden
                bg-gradient-to-br ${pack.color}
                border ${unlocked ? 'border-accent/50' : pack.borderColor}
                hover:border-accent/30
                transition-all duration-300
                ${unlocked ? 'ring-1 ring-accent/20' : ''}
              `}
              data-testid={`store-card-${pack.id}`}
            >
              {/* Popular badge */}
              {pack.popular && !unlocked && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-accent/20 text-accent border-accent/30 text-xs">
                    <Star className="w-3 h-3 mr-1 fill-current" />
                    Popular
                  </Badge>
                </div>
              )}

              {/* Unlocked badge */}
              {unlocked && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-accent text-accent-foreground text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Unlocked
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl bg-card/50 ${pack.iconColor}`}>
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-sm">
                      {pack.name}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {pack.description}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pb-3">
                <ul className="space-y-1.5">
                  {pack.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-1 h-1 rounded-full bg-accent/50" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-0">
                {unlocked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-accent/30 text-accent hover:bg-accent/10"
                    disabled
                    data-testid={`store-btn-active-${pack.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Active
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleUnlock(pack)}
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
                    data-testid={`store-btn-unlock-${pack.id}`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Unlock - ${pack.price.toFixed(2)}</span>
                    {hasPaymentLink && (
                      <ExternalLink className="w-3.5 h-3.5 ml-1" />
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-muted-foreground/60">
        <Sparkles className="w-3 h-3 inline mr-1" />
        Each pack includes lifetime access and AI Mentor specialization
      </p>
    </div>
  );
};

export { Store, getUnlockedPacks, COURSE_PACKS };
export default Store;
