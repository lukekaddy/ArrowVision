import { useEffect, useState, useRef, useCallback } from 'react';
import Layout from '@/components/Layout';
import { getClient } from '@/lib/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, RefreshCw, Trophy, Medal } from 'lucide-react';

interface CourseConfig {
  course: number;
  name?: string;
  targets: number;
}

interface Tournament {
  id: number;
  name: string;
  divisions?: string;
  courses?: string;
}

interface LeaderboardEntry {
  rank: number;
  archer_name: string;
  division: string;
  total_score: number;
  targets_completed: number;
}

export default function Leaderboard() {
  const client = getClient();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [division, setDivision] = useState<string>('');
  const [divisions, setDivisions] = useState<string[]>([]);
  const [courseNumber, setCourseNumber] = useState<string>('');
  const [coursesConfig, setCoursesConfig] = useState<CourseConfig[]>([]);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const fetchLeaderboard = useCallback(async (tournamentId: string, div?: string, course?: string) => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (div) params.division = div;
      if (course) params.course_number = course;
      const res = await client.apiCall.invoke({
        url: `/api/v1/tournament/leaderboard/${tournamentId}`,
        method: 'GET',
        data: params,
      });
      setEntries(res?.data || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  const selectTournament = (id: string) => {
    setSelectedId(id);
    setDivision('');
    setCourseNumber('');
    const t = tournaments.find((t) => t.id === parseInt(id));
    setDivisions(t?.divisions ? t.divisions.split(',').map((d) => d.trim()).filter(Boolean) : []);

    // Parse courses
    let parsed: CourseConfig[] = [];
    if (t?.courses) {
      try { parsed = JSON.parse(t.courses); } catch { parsed = []; }
    }
    setCoursesConfig(parsed);
    fetchLeaderboard(id);
  };

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (selectedId) {
      intervalRef.current = setInterval(() => fetchLeaderboard(selectedId, division, courseNumber), 10000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [selectedId, division, courseNumber, fetchLeaderboard]);

  const handleDivisionChange = (d: string) => {
    const val = d === 'all' ? '' : d;
    setDivision(val);
    fetchLeaderboard(selectedId, val, courseNumber);
  };

  const handleCourseChange = (c: string) => {
    const val = c === 'all' ? '' : c;
    setCourseNumber(val);
    fetchLeaderboard(selectedId, division, val);
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-amber-400" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-slate-300" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-slate-500 font-mono w-5 text-center">{rank}</span>;
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-emerald-400" /> Live Leaderboard
        </h1>

        {/* Filters */}
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

          {divisions.length > 0 && (
            <Select value={division || 'all'} onValueChange={handleDivisionChange}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-12 sm:w-44">
                <SelectValue placeholder="All Divisions" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-white">All Divisions</SelectItem>
                {divisions.map((d) => (
                  <SelectItem key={d} value={d} className="text-white">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {coursesConfig.length > 1 && (
            <Select value={courseNumber || 'all'} onValueChange={handleCourseChange}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-12 sm:w-44">
                <SelectValue placeholder="All Courses" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-white">All Courses</SelectItem>
                {coursesConfig.map((c) => (
                  <SelectItem key={c.course} value={c.course.toString()} className="text-white">
                    {c.name || `Course ${c.course}`} ({c.targets} targets)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedId && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-400">
              {loading ? 'Refreshing...' : `${entries.length} archers`}
              {courseNumber && ` · Course ${courseNumber}`}
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Auto-refresh every 10s
            </div>
          </div>
        )}

        {entries.length > 0 ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700/50 bg-slate-800">
                  <th className="text-left py-3 px-4 w-16">Rank</th>
                  <th className="text-left py-3 px-4">Archer</th>
                  <th className="text-right py-3 px-4">Score</th>
                  <th className="text-right py-3 px-4 hidden sm:table-cell">Targets</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={`${e.archer_name}-${e.rank}`}
                    className={`border-b border-slate-700/30 ${e.rank <= 3 ? 'bg-slate-800/80' : ''}`}
                  >
                    <td className="py-3 px-4">{getRankIcon(e.rank)}</td>
                    <td className="py-3 px-4">
                      <span className="text-white font-medium">{e.archer_name}</span>
                      {e.division && <span className="text-xs text-slate-500 ml-2">{e.division}</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-lg font-bold text-emerald-400">{e.total_score}</span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400 hidden sm:table-cell">
                      {e.targets_completed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : selectedId && !loading ? (
          <div className="text-center py-16 rounded-xl border border-slate-700/30 bg-slate-800/30">
            <BarChart3 className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No scores recorded yet for this tournament.</p>
          </div>
        ) : !selectedId ? (
          <div className="text-center py-16 rounded-xl border border-slate-700/30 bg-slate-800/30">
            <BarChart3 className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">Select a tournament to view the leaderboard.</p>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}