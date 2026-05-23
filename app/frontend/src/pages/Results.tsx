import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Award, Download, Share2, Printer, Trophy, Medal, Search, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';

interface Tournament {
  id: number;
  name: string;
  date: string;
  status: string;
  location?: string;
  divisions?: string;
}

interface LeaderboardEntry {
  rank: number;
  archer_name: string;
  division: string;
  total_score: number;
  targets_completed: number;
}

interface ScoreDetail {
  target_number: number;
  score: number;
  course_number?: number;
}

interface SavedScorecard {
  id: number;
  template_name: string;
  score_values: number[] | string;
  is_custom: boolean;
}

function inferStatus(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  if (dateStr === today) return 'active';
  if (dateStr > today) return 'upcoming';
  return 'completed';
}

export default function Results() {
  const { user } = useAuth();
  const client = getClient();

  // Tournament search state
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentSearch, setTournamentSearch] = useState('');
  const [archerFilter, setArcherFilter] = useState('');
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [expandedArcher, setExpandedArcher] = useState<string | null>(null);
  const [archerScores, setArcherScores] = useState<Record<string, ScoreDetail[]>>({});
  const [loadingScores, setLoadingScores] = useState<string | null>(null);

  // Scorecard search state
  const [scorecards, setScorecards] = useState<SavedScorecard[]>([]);
  const [scorecardSearch, setScorecardSearch] = useState('');

  useEffect(() => {
    fetchTournaments();
    fetchScorecards();
  }, []);

  const fetchTournaments = async () => {
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/tournament/public-list', method: 'GET', data: {} });
      setTournaments(res?.data?.items || []);
    } catch {
      setTournaments([]);
    }
  };

  const fetchScorecards = async () => {
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/tournament/scoring-templates',
        method: 'GET',
        data: {},
      });
      const items = res?.data?.items || res?.data || [];
      setScorecards(Array.isArray(items) ? items : []);
    } catch {
      setScorecards([]);
    }
  };

  // Filter completed tournaments
  const completedTournaments = tournaments.filter((t) => {
    const status = t.status === 'auto' ? inferStatus(t.date) : t.status;
    return status === 'completed';
  });

  const filteredTournaments = completedTournaments.filter((t) => {
    const matchesName = t.name.toLowerCase().includes(tournamentSearch.toLowerCase());
    const matchesLocation = t.location?.toLowerCase().includes(tournamentSearch.toLowerCase());
    return matchesName || matchesLocation;
  });

  const filteredScorecards = scorecards.filter((sc) =>
    sc.template_name.toLowerCase().includes(scorecardSearch.toLowerCase())
  );

  const selectTournament = async (t: Tournament) => {
    setSelectedTournament(t);
    setExpandedArcher(null);
    setLoadingEntries(true);
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/tournament/leaderboard/${t.id}`,
        method: 'GET',
        data: {},
      });
      setEntries(res?.data || []);
    } catch {
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  };

  const toggleArcherDetails = async (archerName: string) => {
    if (expandedArcher === archerName) {
      setExpandedArcher(null);
      return;
    }
    setExpandedArcher(archerName);

    // Fetch detailed scores if not cached
    if (!archerScores[archerName] && selectedTournament) {
      setLoadingScores(archerName);
      try {
        const params = new URLSearchParams({
          tournament_id: selectedTournament.id.toString(),
          archer_name: archerName,
        });
        const res = await client.apiCall.invoke({
          url: `/api/v1/tournament/scores?${params.toString()}`,
          method: 'GET',
          data: {},
        });
        const scores = res?.data?.items || res?.data || [];
        setArcherScores((prev) => ({ ...prev, [archerName]: scores }));
      } catch {
        setArcherScores((prev) => ({ ...prev, [archerName]: [] }));
      } finally {
        setLoadingScores(null);
      }
    }
  };

  const filteredEntries = archerFilter
    ? entries.filter((e) => e.archer_name.toLowerCase().includes(archerFilter.toLowerCase()))
    : entries;

  const exportJSON = async () => {
    if (!selectedTournament || !user) return;
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/tournament/export-results/${selectedTournament.id}`,
        method: 'POST',
        data: {},
      });
      const blob = new Blob([JSON.stringify(res?.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `results-${selectedTournament.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handlePrint = () => window.print();

  const handleShare = async () => {
    if (navigator.share && selectedTournament) {
      try {
        await navigator.share({
          title: `${selectedTournament.name} Results`,
          text: `Check out the results for ${selectedTournament.name}!`,
          url: window.location.href,
        });
      } catch {
        // User cancelled
      }
    }
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-amber-400" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-slate-300" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-slate-500 font-mono">{rank}</span>;
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Award className="h-8 w-8 text-amber-400" /> Results
        </h1>
        <p className="text-slate-400 mb-8">Search completed tournaments and scorecards.</p>

        {/* Section 1: Search Tournaments */}
        <section className="mb-10">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            <div className="p-5 border-b border-slate-700/50">
              <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                <Trophy className="h-5 w-5 text-emerald-400" />
                Search Tournaments
              </h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    value={tournamentSearch}
                    onChange={(e) => setTournamentSearch(e.target.value)}
                    placeholder="Search by name or location..."
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 pl-10 h-11"
                  />
                </div>
              </div>
            </div>

            <div className="p-5">
              {filteredTournaments.length === 0 ? (
                <div className="text-center py-8">
                  <Award className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">
                    {completedTournaments.length === 0
                      ? 'No completed tournaments yet.'
                      : 'No tournaments match your search.'}
                  </p>
                </div>
              ) : !selectedTournament ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {filteredTournaments.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTournament(t)}
                      className="w-full text-left p-4 rounded-lg border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-white font-medium">{t.name}</h3>
                        <span className="text-xs text-slate-500">{t.date}</span>
                      </div>
                      {t.location && (
                        <p className="text-sm text-slate-400 mt-0.5">{t.location}</p>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  {/* Selected tournament header */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">{selectedTournament.name}</h3>
                      <p className="text-sm text-slate-400">
                        {selectedTournament.date}
                        {selectedTournament.location && ` · ${selectedTournament.location}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => { setSelectedTournament(null); setEntries([]); setArcherFilter(''); }}
                        variant="outline"
                        size="sm"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                      >
                        Back
                      </Button>
                      <Button onClick={handleShare} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700/50">
                        <Share2 className="h-4 w-4" />
                      </Button>
                      <Button onClick={handlePrint} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700/50">
                        <Printer className="h-4 w-4" />
                      </Button>
                      {user && (
                        <Button onClick={exportJSON} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700/50 gap-1">
                          <Download className="h-4 w-4" /> JSON
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Archer name filter */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      value={archerFilter}
                      onChange={(e) => setArcherFilter(e.target.value)}
                      placeholder="Filter by archer name..."
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 pl-10 h-10"
                    />
                  </div>

                  {/* Results table */}
                  {loadingEntries ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-14 bg-slate-800 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : filteredEntries.length > 0 ? (
                    <div className="space-y-1">
                      {filteredEntries.map((e) => (
                        <div key={`${e.archer_name}-${e.rank}`}>
                          <button
                            onClick={() => toggleArcherDetails(e.archer_name)}
                            className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${
                              expandedArcher === e.archer_name
                                ? 'bg-slate-800 border-emerald-500/30'
                                : 'border-slate-700/30 hover:bg-slate-800/80'
                            }`}
                          >
                            <div className="w-8 flex justify-center">{getRankDisplay(e.rank)}</div>
                            <div className="flex-1 min-w-0">
                              <span className="text-white font-medium">{e.archer_name}</span>
                              {e.division && <span className="text-xs text-slate-500 ml-2">{e.division}</span>}
                            </div>
                            <span className="text-lg font-bold text-emerald-400 mr-2">{e.total_score}</span>
                            {expandedArcher === e.archer_name ? (
                              <ChevronUp className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            )}
                          </button>

                          {/* Expanded score details */}
                          {expandedArcher === e.archer_name && (
                            <div className="ml-11 mr-2 mt-1 mb-2 p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                              {loadingScores === e.archer_name ? (
                                <div className="h-8 bg-slate-800 rounded animate-pulse" />
                              ) : (archerScores[e.archer_name] || []).length > 0 ? (
                                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                                  {(archerScores[e.archer_name] || [])
                                    .sort((a, b) => a.target_number - b.target_number)
                                    .map((s) => (
                                      <div
                                        key={s.target_number}
                                        className="text-center p-2 rounded bg-slate-800 border border-slate-700/50"
                                      >
                                        <p className="text-xs text-slate-500">T{s.target_number}</p>
                                        <p className="text-sm font-bold text-white">{s.score}</p>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-500">No detailed scores available.</p>
                              )}
                              <p className="text-xs text-slate-500 mt-2">
                                {e.targets_completed} targets completed · Total: {e.total_score}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-slate-400 text-sm">No results found.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: Search Scorecards */}
        <section>
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            <div className="p-5 border-b border-slate-700/50">
              <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                <ClipboardList className="h-5 w-5 text-amber-400" />
                Search Scorecards
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  value={scorecardSearch}
                  onChange={(e) => setScorecardSearch(e.target.value)}
                  placeholder="Search by scorecard name..."
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 pl-10 h-11"
                />
              </div>
            </div>

            <div className="p-5">
              {filteredScorecards.length === 0 ? (
                <div className="text-center py-8">
                  <ClipboardList className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">
                    {scorecards.length === 0
                      ? (!user ? 'Sign in to view your scorecards.' : 'No scorecards created yet.')
                      : 'No scorecards match your search.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredScorecards.map((sc) => {
                    let scoreValues: number[] = [];
                    try {
                      if (Array.isArray(sc.score_values)) {
                        scoreValues = sc.score_values.map(Number);
                      } else if (typeof sc.score_values === 'string') {
                        let parsed: unknown = sc.score_values;
                        // Handle double-encoded strings (e.g., "\"[10, 8, 5, 0]\"")
                        if (typeof parsed === 'string') {
                          parsed = JSON.parse(parsed);
                        }
                        // If still a string after first parse, try again (double-encoded)
                        if (typeof parsed === 'string') {
                          parsed = JSON.parse(parsed);
                        }
                        if (Array.isArray(parsed)) {
                          scoreValues = parsed.map(Number);
                        }
                      } else if (typeof sc.score_values === 'object' && sc.score_values !== null) {
                        // Handle unexpected object format
                        scoreValues = Object.values(sc.score_values).map(Number);
                      }
                    } catch {
                      scoreValues = [];
                    }
                    // Filter out NaN values
                    scoreValues = scoreValues.filter((v) => !isNaN(v));

                    return (
                      <div
                        key={sc.id}
                        className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-white font-medium">{sc.template_name}</h3>
                          {sc.is_custom && (
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">Custom</span>
                          )}
                        </div>
                        {scoreValues.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {scoreValues.map((val, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300"
                              >
                                {val === 0 ? 'Miss' : val}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">No score values defined.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}