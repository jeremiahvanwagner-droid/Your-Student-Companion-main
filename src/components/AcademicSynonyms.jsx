import { GraduationCap, Copy, Check, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// Academic synonym mapping - transforms simple words to academic alternatives
const ACADEMIC_SYNONYMS = {
  // Common adjectives
  'big': ['substantial', 'considerable', 'extensive', 'significant'],
  'small': ['minimal', 'negligible', 'modest', 'limited'],
  'good': ['beneficial', 'advantageous', 'favorable', 'optimal'],
  'bad': ['detrimental', 'adverse', 'unfavorable', 'deleterious'],
  'important': ['crucial', 'paramount', 'fundamental', 'pivotal'],
  'different': ['distinct', 'disparate', 'divergent', 'heterogeneous'],
  'same': ['identical', 'equivalent', 'analogous', 'homogeneous'],
  'old': ['antiquated', 'archaic', 'venerable', 'established'],
  'new': ['novel', 'contemporary', 'innovative', 'emergent'],
  'many': ['numerous', 'multitudinous', 'manifold', 'myriad'],
  'few': ['scant', 'sparse', 'limited', 'minimal'],
  'hard': ['arduous', 'rigorous', 'formidable', 'challenging'],
  'easy': ['straightforward', 'facile', 'elementary', 'accessible'],
  'fast': ['expeditious', 'accelerated', 'rapid', 'swift'],
  'slow': ['gradual', 'incremental', 'measured', 'deliberate'],
  
  // Common verbs
  'show': ['demonstrate', 'illustrate', 'exhibit', 'manifest'],
  'use': ['utilize', 'employ', 'implement', 'leverage'],
  'make': ['construct', 'formulate', 'establish', 'generate'],
  'get': ['obtain', 'acquire', 'procure', 'attain'],
  'give': ['provide', 'furnish', 'confer', 'bestow'],
  'help': ['facilitate', 'assist', 'aid', 'support'],
  'need': ['require', 'necessitate', 'mandate', 'demand'],
  'think': ['postulate', 'hypothesize', 'theorize', 'contemplate'],
  'say': ['assert', 'articulate', 'posit', 'contend'],
  'find': ['ascertain', 'determine', 'identify', 'discern'],
  'know': ['comprehend', 'cognize', 'recognize', 'understand'],
  'look': ['examine', 'scrutinize', 'observe', 'analyze'],
  'change': ['modify', 'alter', 'transform', 'amend'],
  'start': ['initiate', 'commence', 'inaugurate', 'embark'],
  'end': ['conclude', 'terminate', 'finalize', 'culminate'],
  
  // Common nouns
  'part': ['component', 'constituent', 'element', 'segment'],
  'way': ['methodology', 'approach', 'mechanism', 'paradigm'],
  'problem': ['predicament', 'dilemma', 'complication', 'impediment'],
  'answer': ['solution', 'resolution', 'response', 'remedy'],
  'thing': ['entity', 'phenomenon', 'artifact', 'construct'],
  'idea': ['concept', 'notion', 'proposition', 'hypothesis'],
  'reason': ['rationale', 'justification', 'basis', 'premise'],
  'result': ['outcome', 'consequence', 'implication', 'ramification'],
  'fact': ['veracity', 'actuality', 'reality', 'datum'],
  'area': ['domain', 'sphere', 'realm', 'discipline'],
  'point': ['assertion', 'contention', 'thesis', 'argument'],
};

// Find academic alternatives for words in definitions
const findAcademicAlternatives = (text) => {
  const words = text.toLowerCase().split(/\s+/);
  const alternatives = [];
  
  words.forEach(word => {
    // Clean the word of punctuation
    const cleanWord = word.replace(/[^a-z]/g, '');
    if (ACADEMIC_SYNONYMS[cleanWord]) {
      alternatives.push({
        original: cleanWord,
        academic: ACADEMIC_SYNONYMS[cleanWord]
      });
    }
  });
  
  return alternatives;
};

// Get academic version of the main word
const getAcademicVersion = (word) => {
  const cleanWord = word.toLowerCase().trim();
  return ACADEMIC_SYNONYMS[cleanWord] || null;
};

const AcademicSynonyms = ({ word, meanings }) => {
  const [copiedWord, setCopiedWord] = useState(null);
  
  // Get direct synonyms for the searched word
  const directSynonyms = getAcademicVersion(word);
  
  // Find academic alternatives in the definitions
  const definitionAlternatives = meanings
    .flatMap(m => m.definitions.map(d => d.definition))
    .flatMap(def => findAcademicAlternatives(def))
    .filter((item, index, self) => 
      index === self.findIndex(t => t.original === item.original)
    )
    .slice(0, 5);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedWord(text);
    toast.success(`"${text}" copied to clipboard`);
    setTimeout(() => setCopiedWord(null), 2000);
  };

  const hasContent = directSynonyms || definitionAlternatives.length > 0;

  if (!hasContent) {
    return (
      <Card className="bg-card border-border/50">
        <CardContent className="py-8 text-center">
          <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            No academic alternatives found for this term.
          </p>
          <p className="text-muted-foreground/70 text-xs mt-1">
            This word may already be sufficiently formal.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border/50 border-accent/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-accent" />
          <span className="text-foreground">Academic Alternatives</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Direct Synonyms for the searched word */}
        {directSynonyms && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Instead of
              </span>
              <Badge variant="outline" className="border-border/50 text-foreground font-mono text-xs">
                {word}
              </Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Use
              </span>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {directSynonyms.map((synonym, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(synonym)}
                  className="border-accent/30 text-accent hover:bg-accent/10 hover:border-accent/50 group"
                >
                  <span className="font-medium">{synonym}</span>
                  {copiedWord === synonym ? (
                    <Check className="w-3 h-3 ml-1.5" />
                  ) : (
                    <Copy className="w-3 h-3 ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Alternatives found in definitions */}
        {definitionAlternatives.length > 0 && (
          <div className="space-y-3">
            {directSynonyms && (
              <div className="border-t border-border/50 pt-3" />
            )}
            
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Common words → Academic versions
            </p>
            
            <div className="space-y-2">
              {definitionAlternatives.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground text-sm font-mono">
                    {item.original}
                  </span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <div className="flex flex-wrap gap-1.5">
                    {item.academic.slice(0, 3).map((alt, altIdx) => (
                      <button
                        key={altIdx}
                        onClick={() => copyToClipboard(alt)}
                        className="px-2 py-0.5 text-xs rounded bg-secondary/50 text-foreground hover:bg-accent/20 hover:text-accent transition-colors"
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tip */}
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground/70">
            💡 Tip: Click any word to copy it to your clipboard.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AcademicSynonyms;
