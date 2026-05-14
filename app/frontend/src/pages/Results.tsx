import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Award, Download, Share2, Printer, Trophy, Medal } from 'lucide-react';

interface Tournament {
  id: number;
  name: string;
  date: string;
  status: string;
}

interface LeaderboardEntry {
  rank: number;
  archer_name: string;
  division: string;
  total_score: number;
  targets_completed: number;
}

export default function Results() {
  const { user } = useAuth();
  const client = getClient();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await client.apiCall.invoke({ url: '/api/v1/tournament/public-list', method: 'GET', data: {} });
        setTournaments(res?.data?.items || []);
      } catch {
        setTournaments([]);
      }
    };
    fetchTournaments();
  }, []);

  const selectTournament = async (id: string) => {
    setSelectedId(id);
    const t = tournaments.find((t) => t.id === parseInt(id));
    setSelectedTournament(t || null);
    setLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/tournament/leaderboard/${id}`,
        method: 'GET',
        data: {},
      });
      setEntries(res?.data || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const exportJSON = async () => {
    if (!selectedId || !user) return;
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/tournament/export-results/${selectedId}`,
        method: 'POST',
        data: {},
      });
      const blob = new Blob([JSON.stringify(res?.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `results-${selectedId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handlePrint = () => window.print();

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${selectedTournament?.name} Results`,
          text: `Check out the results for ${selectedTournament?.name}!`,
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
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
          <Award className="h-8 w-8 text-amber-400" /> Tournament Results
        </h1>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <Select onValueChange={selectTournament}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-12 flex-1">
              <SelectValue placeholder="Select Tournament" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {tournaments.map((t) => (
                <SelectItem key={t.id} value={t.id.toString()} className="text-white">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedId && (
            <div className="flex gap-2">
              <Button onClick={handleShare} variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700/50">
                <Share2 className="h-4 w-4" />
              </Button>
              <Button onClick={handlePrint} variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700/50">
                <Printer className="h-4 w-4" />
              </Button>
              {user && (
                <Button onClick={exportJSON} variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700/50 gap-1">
                  <Download className="h-4 w-4" /> JSON
                </Button>
              )}
            </div>
          )}
        </div>

        {selectedTournament && (
          <div className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <h2 className="text-xl font-bold text-white">{selectedTournament.name}</h2>
            <p className="text-slate-400 text-sm mt-1">
              {selectedTournament.date} · Status: {selectedTournament.status}
            </p>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : entries.length > 0 ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700/50 bg-slate-800">
                  <th className="text-left py-3 px-4 w-16">Rank</th>
                  <th className="text-left py-3 px-4">Archer</th>
                  <th className="text-right py-3 px-4">Total Score</th>
                  <th className="text-right py-3 px-4 hidden sm:table-cell">Targets</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={`${e.archer_name}-${e.rank}`} className={`border-b border-slate-700/30 ${e.rank <= 3 ? 'bg-slate-800/80' : ''}`}>
                    <td className="py-3 px-4">{getRankDisplay(e.rank)}</td>
                    <td className="py-3 px-4">
                      <span className="text-white font-medium">{e.archer_name}</span>
                      {e.division && <span className="text-xs text-slate-500 ml-2">{e.division}</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-lg font-bold text-emerald-400">{e.total_score}</span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400 hidden sm:table-cell">{e.targets_completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : selectedId ? (
          <div className="text-center py-16 rounded-xl border border-slate-700/30 bg-slate-800/30">
            <Award className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No results available for this tournament.</p>
          </div>
        ) : (
          <div className="text-center py-16 rounded-xl border border-slate-700/30 bg-slate-800/30">
            <Award className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">Select a tournament to view results.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}