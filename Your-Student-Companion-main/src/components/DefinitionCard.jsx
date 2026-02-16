import { useState } from "react";
import { Volume2, Lock, Sparkles, BookMarked, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import AcademicSynonyms from "@/components/AcademicSynonyms";
import { toast } from "sonner";

// Complex terms that trigger the "Study Pack" lock
const COMPLEX_TERMS = [
  'mitosis', 'meiosis', 'photosynthesis', 'macroeconomics', 'microeconomics',
  'cryptocurrency', 'blockchain', 'algorithm', 'paradigm', 'epistemology',
  'ontology', 'metaphysics', 'thermodynamics', 'quantum', 'relativity',
  'calculus', 'derivative', 'integral', 'homeostasis', 'osmosis',
  'capitalism', 'socialism', 'democracy', 'philosophy', 'psychology',
  'anthropology', 'sociology', 'linguistics', 'etymology', 'morphology'
];

// Determine subject based on the word
const getSubject = (word) => {
  const lowerWord = word.toLowerCase();
  const subjects = {
    biology: ['mitosis', 'meiosis', 'photosynthesis', 'homeostasis', 'osmosis', 'cell', 'dna', 'rna', 'gene'],
    economics: ['macroeconomics', 'microeconomics', 'capitalism', 'socialism', 'inflation', 'gdp'],
    technology: ['cryptocurrency', 'blockchain', 'algorithm', 'software', 'hardware', 'programming'],
    physics: ['thermodynamics', 'quantum', 'relativity', 'energy', 'force', 'velocity'],
    mathematics: ['calculus', 'derivative', 'integral', 'algebra', 'geometry', 'statistics'],
    philosophy: ['epistemology', 'ontology', 'metaphysics', 'ethics', 'logic', 'paradigm'],
    social: ['democracy', 'anthropology', 'sociology', 'psychology', 'culture'],
    language: ['linguistics', 'etymology', 'morphology', 'syntax', 'semantics']
  };

  for (const [subject, terms] of Object.entries(subjects)) {
    if (terms.some(term => lowerWord.includes(term))) {
      return subject.charAt(0).toUpperCase() + subject.slice(1);
    }
  }
  return 'General Studies';
};

const DefinitionCard = ({ definition }) => {
  const [showAcademic, setShowAcademic] = useState(false);
  const word = definition?.word || '';
  const phonetic = definition?.phonetic || definition?.phonetics?.find(p => p.text)?.text || '';
  const audioUrl = definition?.phonetics?.find(p => p.audio)?.audio;
  const meanings = definition?.meanings || [];
  
  const isComplex = COMPLEX_TERMS.some(term => 
    word.toLowerCase().includes(term) || term.includes(word.toLowerCase())
  );
  const subject = isComplex ? getSubject(word) : null;

  const playAudio = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
    } else {
      toast.info("No pronunciation audio available for this word.");
    }
  };

  const handleUnlockClick = () => {
    toast.info(`${subject} Study Pack coming soon!`, {
      description: "Join our waitlist to get early access.",
    });
  };

  return (
    <div className="space-y-4">
      {/* Main Definition Card */}
      <Card className="bg-card border-border/50 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            {/* Word & Phonetic */}
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
                  {word}
                </h2>
                {phonetic && (
                  <span className="text-muted-foreground font-mono text-sm">
                    {phonetic}
                  </span>
                )}
              </div>
              
              {/* Part of speech badges */}
              <div className="flex flex-wrap gap-2 mt-2">
                {meanings.map((meaning, idx) => (
                  <Badge 
                    key={idx}
                    variant="secondary"
                    className="bg-secondary/50 text-muted-foreground text-xs font-normal"
                  >
                    {meaning.partOfSpeech}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Audio Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={playAudio}
              className="shrink-0 border-border/50 text-muted-foreground hover:text-accent hover:border-accent/50 transition-colors"
            >
              <Volume2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Definitions */}
          {meanings.map((meaning, meaningIdx) => (
            <div key={meaningIdx} className="space-y-3">
              {meaningIdx > 0 && <Separator className="bg-border/50" />}
              
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-accent">
                  {meaning.partOfSpeech}
                </p>
                
                {meaning.definitions.slice(0, 3).map((def, defIdx) => (
                  <div key={defIdx} className="pl-4 border-l-2 border-border/50 hover:border-accent/50 transition-colors">
                    <p className="text-foreground text-sm leading-relaxed">
                      {def.definition}
                    </p>
                    {def.example && (
                      <p className="text-muted-foreground text-sm mt-1 italic">
                        "{def.example}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Complex Term Lock Banner */}
          {isComplex && (
            <div 
              onClick={handleUnlockClick}
              className="mt-4 p-3 rounded-lg bg-secondary/30 border border-border/50 cursor-pointer hover:border-accent/30 hover:bg-secondary/50 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10 text-accent animate-pulse-soft">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    Unlock full {subject} Study Pack
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    In-depth materials, practice problems & more
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Academic Synonyms Toggle */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={() => setShowAcademic(!showAcademic)}
          className={`
            border-border/50 text-foreground gap-2
            hover:border-accent/50 hover:text-accent
            transition-all
            ${showAcademic ? 'border-accent/50 text-accent bg-accent/5' : ''}
          `}
        >
          <Sparkles className="w-4 h-4" />
          {showAcademic ? 'Hide Academic Version' : 'Make it Academic'}
        </Button>
      </div>

      {/* Academic Synonyms Section */}
      {showAcademic && (
        <div className="animate-slideUp">
          <AcademicSynonyms word={word} meanings={meanings} />
        </div>
      )}
    </div>
  );
};

export default DefinitionCard;
