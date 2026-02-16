/**
 * Context Shifter Utility
 * Transforms simple/weak language into academic/professional alternatives
 * Returns structured data for "Truth Cards" UI pop-ups
 */

// The "Truth" Database: Mapping simple language to Academic/Professional Tiers
// Structure: 'simple_word': { academic: 'replacement', nuance: 'context_explanation' }
const TRUTH_MAP = {
  // Original 15 entries
  "big": { academic: "substantial", nuance: "Implies importance, not just size." },
  "small": { academic: "negligible", nuance: "Suggests something can be disregarded in analysis." },
  "bad": { academic: "detrimental", nuance: "Indicates active harm rather than just poor quality." },
  "good": { academic: "advantageous", nuance: "Focuses on benefits and utility." },
  "change": { academic: "fluctuation", nuance: "Best for data or market variances." },
  "show": { academic: "demonstrate", nuance: "Implies proof through evidence." },
  "think": { academic: "hypothesize", nuance: "Suggests a tentative theory based on reasoning." },
  "fix": { academic: "rectify", nuance: "Implies setting something right formally." },
  "help": { academic: "facilitate", nuance: "Implies making a process easier." },
  "get": { academic: "acquire", nuance: "Implies effort in obtaining something." },
  "use": { academic: "utilize", nuance: "Implies using something for a practical purpose." },
  "guess": { academic: "conjecture", nuance: "An opinion formed on incomplete information." },
  "stop": { academic: "cease", nuance: "Formal termination of an action." },
  "make": { academic: "construct", nuance: "To build or create systematically." },
  
  // 20+ Additional Academic Synonyms for Essays
  "say": { academic: "assert", nuance: "To state with confidence or authority." },
  "said": { academic: "asserted", nuance: "Past tense of stating with confidence." },
  "tell": { academic: "convey", nuance: "To communicate or make known effectively." },
  "talk": { academic: "discourse", nuance: "To engage in formal discussion or communication." },
  "important": { academic: "paramount", nuance: "Of supreme importance or priority." },
  "very": { academic: "exceedingly", nuance: "To a great degree; emphasizes without informality." },
  "really": { academic: "fundamentally", nuance: "At the most basic or essential level." },
  "also": { academic: "furthermore", nuance: "Adds information while showing logical progression." },
  "but": { academic: "however", nuance: "Introduces contrast in a formal manner." },
  "so": { academic: "consequently", nuance: "Shows cause-effect relationship formally." },
  "because": { academic: "owing to", nuance: "Indicates causation in formal writing." },
  "about": { academic: "regarding", nuance: "Concerning or with reference to a topic." },
  "many": { academic: "numerous", nuance: "A large but unspecified quantity." },
  "few": { academic: "scarce", nuance: "Insufficient in quantity; rarely found." },
  "most": { academic: "predominantly", nuance: "For the greatest part or majority." },
  "some": { academic: "certain", nuance: "Specific but unidentified instances." },
  "give": { academic: "provide", nuance: "To supply or furnish formally." },
  "gave": { academic: "provided", nuance: "Past tense of formal supply." },
  "find": { academic: "ascertain", nuance: "To discover through investigation or analysis." },
  "found": { academic: "ascertained", nuance: "Past tense of formal discovery." },
  "know": { academic: "comprehend", nuance: "To understand thoroughly or grasp fully." },
  "see": { academic: "observe", nuance: "To notice or perceive through careful attention." },
  "saw": { academic: "observed", nuance: "Past tense of careful perception." },
  "seem": { academic: "appear", nuance: "To give the impression of being." },
  "need": { academic: "require", nuance: "To demand as essential or necessary." },
  "want": { academic: "desire", nuance: "To wish for or aspire to obtain." },
  "keep": { academic: "maintain", nuance: "To preserve or sustain over time." },
  "start": { academic: "commence", nuance: "To begin formally or officially." },
  "begin": { academic: "initiate", nuance: "To set in motion or originate." },
  "end": { academic: "conclude", nuance: "To bring to a formal close." },
  "try": { academic: "attempt", nuance: "To make an effort toward achieving." },
  "tried": { academic: "endeavored", nuance: "Past tense of making sustained effort." },
  "hard": { academic: "arduous", nuance: "Requiring considerable effort or difficulty." },
  "easy": { academic: "straightforward", nuance: "Uncomplicated and simple to accomplish." },
  "fast": { academic: "expeditious", nuance: "Acting with speed and efficiency." },
  "slow": { academic: "gradual", nuance: "Proceeding in small stages over time." },
  "old": { academic: "antiquated", nuance: "Belonging to an earlier period; outdated." },
  "new": { academic: "novel", nuance: "Original and innovative; not seen before." },
  "different": { academic: "disparate", nuance: "Fundamentally distinct or dissimilar." },
  "same": { academic: "identical", nuance: "Exactly alike in every respect." },
  "part": { academic: "component", nuance: "A constituent element of a larger whole." },
  "whole": { academic: "entirety", nuance: "The complete or total amount." },
  "thing": { academic: "entity", nuance: "Something with distinct existence." },
  "stuff": { academic: "material", nuance: "Substance or matter of a specified kind." },
  "way": { academic: "methodology", nuance: "A systematic approach or procedure." },
  "problem": { academic: "predicament", nuance: "A difficult or challenging situation." },
  "answer": { academic: "resolution", nuance: "A solution or response to an issue." },
  "idea": { academic: "concept", nuance: "An abstract notion or mental construct." },
  "point": { academic: "assertion", nuance: "A proposition put forward for consideration." },
  "fact": { academic: "empirical evidence", nuance: "Information derived from observation." },
  "reason": { academic: "rationale", nuance: "The underlying basis or justification." },
  "result": { academic: "outcome", nuance: "The consequence or effect of an action." },
  "effect": { academic: "ramification", nuance: "A consequence, especially indirect." },
  "cause": { academic: "catalyst", nuance: "Something that precipitates an event." },
  "right": { academic: "accurate", nuance: "Correct and free from error." },
  "wrong": { academic: "erroneous", nuance: "Containing or based on error." },
  "true": { academic: "verifiable", nuance: "Capable of being proven or confirmed." },
  "false": { academic: "fallacious", nuance: "Based on a mistaken belief or unsound reasoning." },
  "likely": { academic: "probable", nuance: "Expected to happen or be true." },
  "maybe": { academic: "potentially", nuance: "With the capacity for development." },
  "now": { academic: "presently", nuance: "At the current moment in time." },
  "then": { academic: "subsequently", nuance: "Following in time or order." },
  "always": { academic: "invariably", nuance: "On every occasion; without exception." },
  "never": { academic: "under no circumstances", nuance: "Absolute negation of possibility." },
  "often": { academic: "frequently", nuance: "Occurring at short intervals." },
  "sometimes": { academic: "periodically", nuance: "Occurring at regular intervals." },
  "usually": { academic: "typically", nuance: "In most cases; as a general rule." },
  "mainly": { academic: "primarily", nuance: "For the most part; chiefly." },
  "actually": { academic: "in reality", nuance: "Used to emphasize what is true." },
  "basically": { academic: "fundamentally", nuance: "At the most essential level." },
  "clearly": { academic: "evidently", nuance: "In a way that is obvious or apparent." },
  "therefore": { academic: "thus", nuance: "As a logical consequence." },
  "moreover": { academic: "additionally", nuance: "As a further consideration." },
  "first": { academic: "initially", nuance: "At the beginning of a process." },
  "next": { academic: "subsequently", nuance: "Coming after in sequence." },
  "finally": { academic: "ultimately", nuance: "In the end; after all considerations." },
  "last": { academic: "concluding", nuance: "Coming at the end of a series." },
};

// Multi-word phrases mapping
const PHRASE_MAP = {
  "look at": { academic: "examine", nuance: "Implies inspecting closely/analytically." },
  "a lot": { academic: "considerably", nuance: "To a notably large extent." },
  "a lot of": { academic: "substantial amounts of", nuance: "Significant quantities." },
  "kind of": { academic: "somewhat", nuance: "To a moderate degree." },
  "sort of": { academic: "relatively", nuance: "In comparison to something else." },
  "due to": { academic: "attributable to", nuance: "Caused by or resulting from." },
  "in order to": { academic: "to", nuance: "Simplified formal construction." },
  "as well as": { academic: "in addition to", nuance: "Formal way to add information." },
  "on the other hand": { academic: "conversely", nuance: "Introducing an opposing point." },
  "at the end": { academic: "ultimately", nuance: "In the final analysis." },
  "in the end": { academic: "conclusively", nuance: "As a final result." },
  "for example": { academic: "for instance", nuance: "Introducing an illustration." },
  "such as": { academic: "including", nuance: "Introducing specific examples." },
  "in fact": { academic: "indeed", nuance: "Emphasizing the truth of a statement." },
  "of course": { academic: "naturally", nuance: "As would be expected." },
  "right now": { academic: "currently", nuance: "At the present time." },
  "a little": { academic: "marginally", nuance: "To a small extent." },
  "more and more": { academic: "increasingly", nuance: "To a growing degree." },
  "less and less": { academic: "decreasingly", nuance: "To a diminishing degree." },
  "at first": { academic: "initially", nuance: "At the beginning." },
};

/**
 * Clean a word by removing punctuation for matching
 */
const cleanWord = (word) => {
  return word.replace(/[^a-zA-Z]/g, '').toLowerCase();
};

/**
 * Get the punctuation from the end of a word
 */
const getTrailingPunctuation = (word) => {
  const match = word.match(/[^a-zA-Z]+$/);
  return match ? match[0] : '';
};

/**
 * Get the punctuation from the start of a word
 */
const getLeadingPunctuation = (word) => {
  const match = word.match(/^[^a-zA-Z]+/);
  return match ? match[0] : '';
};

/**
 * Preserve original word's capitalization pattern
 */
const preserveCase = (original, replacement) => {
  if (original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement.toLowerCase();
};

/**
 * Main Context Shifter class
 * Scans input text for 'weak' words and returns the 'Truth' academic version
 */
export class ContextShifter {
  constructor(customMappings = {}) {
    this.truthMap = { ...TRUTH_MAP, ...customMappings };
    this.phraseMap = { ...PHRASE_MAP };
  }

  /**
   * Shift input text to academic language
   * Returns structured data for UI Truth Cards
   */
  shift(inputText) {
    if (!inputText.trim()) {
      return {
        originalText: inputText,
        shiftedText: inputText,
        truthCards: [],
        improvementCount: 0,
        improvementPercentage: 0,
      };
    }

    let processedText = inputText;
    const truthCards = [];
    let position = 0;

    // First pass: Check for multi-word phrases
    for (const [phrase, entry] of Object.entries(this.phraseMap)) {
      const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(inputText.toLowerCase())) !== null) {
        const originalPhrase = inputText.substring(match.index, match.index + phrase.length);
        const replacement = preserveCase(originalPhrase, entry.academic);
        
        truthCards.push({
          original: phrase,
          upgrade: entry.academic,
          truthContext: entry.nuance,
          position: match.index,
        });
        
        processedText = processedText.replace(
          new RegExp(`\\b${originalPhrase}\\b`, 'i'),
          `[${replacement.toUpperCase()}]`
        );
      }
    }

    // Second pass: Process individual words
    const words = processedText.split(/\s+/);
    const shiftedWords = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const leadingPunc = getLeadingPunctuation(word);
      const trailingPunc = getTrailingPunctuation(word);
      const cleanedWord = cleanWord(word);

      // Skip if already processed (contains brackets)
      if (word.includes('[') && word.includes(']')) {
        shiftedWords.push(word);
        continue;
      }

      if (cleanedWord && this.truthMap[cleanedWord]) {
        const entry = this.truthMap[cleanedWord];
        const originalWord = word.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z]+$/, '');
        const replacement = preserveCase(originalWord, entry.academic);

        truthCards.push({
          original: cleanedWord,
          upgrade: entry.academic,
          truthContext: entry.nuance,
          position: position,
        });

        shiftedWords.push(`${leadingPunc}[${replacement.toUpperCase()}]${trailingPunc}`);
      } else {
        shiftedWords.push(word);
      }
      
      position++;
    }

    const totalWords = inputText.split(/\s+/).filter(w => cleanWord(w)).length;
    const improvementCount = truthCards.length;
    const improvementPercentage = totalWords > 0 
      ? Math.round((improvementCount / totalWords) * 100) 
      : 0;

    return {
      originalText: inputText,
      shiftedText: shiftedWords.join(' '),
      truthCards: truthCards.sort((a, b) => a.position - b.position),
      improvementCount,
      improvementPercentage,
    };
  }

  /**
   * Get highlighted words array for UI rendering
   */
  getHighlightedWords(inputText) {
    const words = inputText.split(/\s+/);
    const result = [];

    for (const word of words) {
      const cleanedWord = cleanWord(word);
      
      if (cleanedWord && this.truthMap[cleanedWord]) {
        const entry = this.truthMap[cleanedWord];
        result.push({
          word,
          isUpgraded: true,
          original: cleanedWord,
          upgrade: entry.academic,
          nuance: entry.nuance,
        });
      } else {
        result.push({
          word,
          isUpgraded: false,
        });
      }
    }

    return result;
  }

  /**
   * Check if a single word has an academic upgrade
   */
  hasUpgrade(word) {
    return cleanWord(word) in this.truthMap;
  }

  /**
   * Get upgrade for a single word
   */
  getUpgrade(word) {
    const cleaned = cleanWord(word);
    return this.truthMap[cleaned] || null;
  }

  /**
   * Get all available mappings
   */
  getAllMappings() {
    return { ...this.truthMap };
  }
}

// Export singleton instance for convenience
export const contextShifter = new ContextShifter();

// Export utility functions
export const shiftText = (text) => contextShifter.shift(text);
export const getHighlightedWords = (text) => contextShifter.getHighlightedWords(text);
export const hasAcademicUpgrade = (word) => contextShifter.hasUpgrade(word);
export const getAcademicUpgrade = (word) => contextShifter.getUpgrade(word);

export default ContextShifter;
