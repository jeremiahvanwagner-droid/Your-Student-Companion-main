import { useEffect, useState } from "react";

import DefinitionCard from "@/components/DefinitionCard";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import FocusMode from "@/components/FocusMode";
import FocusStats from "@/components/FocusStats";
import LoadingState from "@/components/LoadingState";
import RecentSearches from "@/components/RecentSearches";
import SearchBar from "@/components/SearchBar";
import TruthLine from "@/components/TruthLine";
import { Card, CardContent } from "@/components/ui/card";

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [definition, setDefinition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("recentSearches");
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  const saveRecentSearch = (word) => {
    const updated = [word, ...recentSearches.filter((entry) => entry !== word)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  };

  const fetchDefinition = async (word) => {
    if (!word.trim()) {
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`);
      if (!response.ok) {
        throw new Error("Word not found");
      }

      const data = await response.json();
      setDefinition(data[0]);
      saveRecentSearch(word.trim().toLowerCase());
    } catch (err) {
      setError(
        err.message === "Word not found"
          ? "No definition found for this word. Try a different term."
          : "Failed to fetch definition. Please try again."
      );
      setDefinition(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Academic Mission Control</p>
        <h1 className="text-2xl font-semibold text-foreground">The Truth Search</h1>
        <p className="text-sm text-muted-foreground">Find definitions instantly and strengthen academic vocabulary.</p>
      </div>

      <Card className="border-border/40 bg-card/40">
        <CardContent className="py-4">
          <TruthLine />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <FocusMode />
        <FocusStats />
      </div>

      <SearchBar value={searchQuery} onChange={setSearchQuery} onSearch={fetchDefinition} />

      <div className="space-y-3">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchDefinition(searchQuery)} />
        ) : definition ? (
          <DefinitionCard definition={definition} />
        ) : hasSearched ? (
          <EmptyState />
        ) : recentSearches.length > 0 ? (
          <RecentSearches
            searches={recentSearches}
            onSearchClick={(word) => {
              setSearchQuery(word);
              fetchDefinition(word);
            }}
            onClear={() => {
              setRecentSearches([]);
              localStorage.removeItem("recentSearches");
            }}
          />
        ) : (
          <EmptyState isInitial />
        )}
      </div>
    </div>
  );
}
