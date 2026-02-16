import { useState, useEffect } from "react";
import Header from "@/components/Header";
import SearchBar from "@/components/SearchBar";
import DefinitionCard from "@/components/DefinitionCard";
import RecentSearches from "@/components/RecentSearches";
import Footer from "@/components/Footer";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import TruthLine from "@/components/TruthLine";
import FocusMode from "@/components/FocusMode";
import FocusStats from "@/components/FocusStats";
import Store, { getUnlockedPacks } from "@/components/Store";
import TheMentor from "@/components/TheMentor";
import ContextShifterUI from "@/components/ContextShifterUI";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ShoppingBag, MessageCircle, Sparkles } from "lucide-react";

const HomePage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [definition, setDefinition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isFocusActive, setIsFocusActive] = useState(false);
  const [activeTab, setActiveTab] = useState("search");
  const [unlockedPacks, setUnlockedPacks] = useState(getUnlockedPacks());

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("recentSearches");
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  // Save recent searches to localStorage
  const saveRecentSearch = (word) => {
    const updated = [word, ...recentSearches.filter(w => w !== word)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  };

  // Fetch definition from Free Dictionary API
  const fetchDefinition = async (word) => {
    if (!word.trim()) return;
    
    setLoading(true);
    setError(null);
    setHasSearched(true);
    
    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`
      );
      
      if (!response.ok) {
        throw new Error("Word not found");
      }
      
      const data = await response.json();
      setDefinition(data[0]);
      saveRecentSearch(word.trim().toLowerCase());
    } catch (err) {
      setError(err.message === "Word not found" 
        ? "No definition found for this word. Try a different term."
        : "Failed to fetch definition. Please try again."
      );
      setDefinition(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    fetchDefinition(query);
  };

  const handleRecentClick = (word) => {
    setSearchQuery(word);
    fetchDefinition(word);
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem("recentSearches");
  };

  const handlePackUnlock = (packId) => {
    setUnlockedPacks(getUnlockedPacks());
  };

  return (
    <div className={`min-h-screen flex flex-col bg-background ${isFocusActive ? 'overflow-hidden' : ''}`}>
      <Header />
      
      <main className="flex-1 flex flex-col">
        {/* Truth-Line - Semester Week Tracker */}
        <section className="px-4 pt-4 pb-2">
          <div className="max-w-3xl mx-auto">
            <TruthLine />
          </div>
        </section>

        {/* Main Content with Tabs */}
        <section className="flex-1 px-4 py-4">
          <div className="max-w-3xl mx-auto">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              {/* Tab Navigation */}
              <TabsList className="grid w-full grid-cols-4 mb-6 bg-card/50 border border-border/30">
                <TabsTrigger 
                  value="search" 
                  className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-2"
                >
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:inline">Search</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="shifter" 
                  className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">Shifter</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="store" 
                  className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-2"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span className="hidden sm:inline">Store</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="mentor" 
                  className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-2 relative"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Mentor</span>
                  {unlockedPacks.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Search Tab */}
              <TabsContent value="search" className="mt-0">
                {/* Focus Mode Button */}
                <div className="flex justify-center mb-6">
                  <FocusMode onFocusStateChange={setIsFocusActive} />
                </div>

                {/* Hero Content */}
                <div className="text-center mb-6">
                  <p className="text-xs sm:text-sm font-medium tracking-[0.2em] uppercase text-accent mb-2">
                    Academic Mission Control
                  </p>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-foreground leading-tight mb-2">
                    The Truth Search
                  </h1>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                    Find definitions instantly. Elevate your vocabulary.
                  </p>
                </div>

                {/* Search Bar */}
                <SearchBar 
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={handleSearch}
                />

                {/* Results */}
                <div className="mt-6 space-y-4">
                  <FocusStats />

                  {loading ? (
                    <LoadingState />
                  ) : error ? (
                    <ErrorState message={error} onRetry={() => fetchDefinition(searchQuery)} />
                  ) : definition ? (
                    <div className="animate-scaleIn">
                      <DefinitionCard definition={definition} />
                    </div>
                  ) : hasSearched ? (
                    <EmptyState />
                  ) : recentSearches.length > 0 ? (
                    <RecentSearches 
                      searches={recentSearches}
                      onSearchClick={handleRecentClick}
                      onClear={clearRecentSearches}
                    />
                  ) : (
                    <EmptyState isInitial />
                  )}
                </div>
              </TabsContent>

              {/* Context Shifter Tab */}
              <TabsContent value="shifter" className="mt-0">
                <div className="space-y-6">
                  <div className="text-center mb-4">
                    <p className="text-xs sm:text-sm font-medium tracking-[0.2em] uppercase text-accent mb-2">
                      Academic Writing Assistant
                    </p>
                    <h2 className="text-xl sm:text-2xl font-semibold text-foreground">
                      Context Shifter
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Transform everyday language into academic prose
                    </p>
                  </div>
                  <ContextShifterUI />
                </div>
              </TabsContent>

              {/* Store Tab */}
              <TabsContent value="store" className="mt-0">
                <Store onPackUnlock={handlePackUnlock} />
              </TabsContent>

              {/* Mentor Tab */}
              <TabsContent value="mentor" className="mt-0">
                <TheMentor unlockedPacks={unlockedPacks} />
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default HomePage;
