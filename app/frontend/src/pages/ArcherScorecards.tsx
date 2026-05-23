import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import {
  ClipboardList,
  Calendar,
  MapPin,
  ChevronDown,
  ChevronUp,
  Target,
  ArrowLeft,
  Eye,
  Play,
  Clock,
  Search,
  ArrowUpDown,
  Users,
  Trophy,
} from 'lucide-react';

interface TournamentInfo {
  id: number;
  name: string;
  date: string;
  end_date?: string;
  location?: string;
}

interface RegistrationInfo {
  id: number;
  division: string;
  first_name?: string;
  last_name?: string;
  group_name?: string;
}

interface ScoreSummary {
  total_score: number;
  targets_scored: number;
  total_targets?: number;
}

interface MyTournamentEntry {
  tournament: TournamentInfo;
  registration: RegistrationInfo;
  score_summary: ScoreSummary;
}

type TournamentStatus = 'active' | 'upcoming' | 'completed';

function getTournamentStatus(entry: MyTournamentEntry): TournamentStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(entry.tournament.date);
  startDate.setHours(0, 0, 0, 0);

  const endDate = entry.tournament.end_date
    ? new Date(entry.tournament.end_date)
    : new Date(entry.tournament.date);
  endDate.setHours(23, 59, 59, 999);

  if (today >= startDate && today <= endDate) return 'active';
  if (today < startDate) return 'upcoming';
  return 'completed';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

type SortOption = 'recent' | 'score' | 'name';

export default function ArcherScorecards() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [myTournaments, setMyTournaments] = useState<MyTournamentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [completedSearch, setCompletedSearch] = useState('');
  const [completedSort, setCompletedSort] = useState<SortOption>('recent');
  const [completedShowCount, setCompletedShowCount] = useState(5);
  const client = getClient();

  useEffect(() => {
    const fetchMyTournaments = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await client.apiCall.invoke({
          url: '/api/v1/tournament/my-tournaments',
          method: 'GET',
          data: {},
          options: {
            headers: { Authorization: `Bearer ${token}` },
          },
        });
        setMyTournaments(res?.data?.items || res?.data || []);
      } catch {
        setMyTournaments([]);
      } finally {
        setLoading(false);
      }
    };
    fetchMyTournaments();
  }, [token]);

  const categorized = useMemo(() => {
    const active: MyTournamentEntry[] = [];
    const upcoming: MyTournamentEntry[] = [];
    const completed: MyTournamentEntry[] = [];

    myTournaments.forEach((entry) => {
      const status = getTournamentStatus(entry);
      if (status === 'active') active.push(entry);
      else if (status === 'upcoming') upcoming.push(entry);
      else completed.push(entry);
    });

    // Sort upcoming by date ascending
    upcoming.sort((a, b) => new Date(a.tournament.date).getTime() - new Date(b.tournament.date).getTime());
    // Sort completed by date descending (most recent first)
    completed.sort((a, b) => new Date(b.tournament.date).getTime() - new Date(a.tournament.date).getTime());

    return { active, upcoming, completed };
  }, [myTournaments]);

  const filteredCompleted = useMemo(() => {
    let items = [...categorized.completed];

    // Filter by search
    if (completedSearch.trim()) {
      const query = completedSearch.toLowerCase();
      items = items.filter(
        (e) =>
          e.tournament.name.toLowerCase().includes(query) ||
          e.tournament.location?.toLowerCase().includes(query)
      );
    }

    // Sort
    switch (completedSort) {
      case 'score':
        items.sort((a, b) => b.score_summary.total_score - a.score_summary.total_score);
        break;
      case 'name':
        items.sort((a, b) => a.tournament.name.localeCompare(b.tournament.name));
        break;
      case 'recent':
      default:
        items.sort((a, b) => new Date(b.tournament.date).getTime() - new Date(a.tournament.date).getTime());
        break;
    }

    return items;
  }, [categorized.completed, completedSearch, completedSort]);

  const visibleCompleted = filteredCompleted.slice(0, completedShowCount);
  const hasMoreCompleted = filteredCompleted.length > completedShowCount;

  // Find first active tournament for floating button
  const firstActive = categorized.active[0] || null;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8 pb-24">
        <Link
          to="/archer"
          className="inline-flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-amber-400" />
          My Scorecards
        </h1>
        <p className="text-slate-400 mb-8">Track your progress across all tournaments.</p>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 animate-pulse h-28"
              />
            ))}
          </div>
        ) : myTournaments.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-slate-700/30 bg-slate-800/30">
            <Target className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg mb-2">No scorecards yet.</p>
            <p className="text-slate-500 text-sm">Register for a tournament to start scoring!</p>
            <Link to="/archer">
              <button className="mt-4 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors">
                Browse Tournaments
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* ===== ACTIVE TOURNAMENTS ===== */}
            {categorized.active.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <h2 className="text-lg font-semibold text-white">Active Tournaments</h2>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                    {categorized.active.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {categorized.active.map((entry) => (
                    <ActiveCard key={entry.tournament.id} entry={entry} navigate={navigate} />
                  ))}
                </div>
              </section>
            )}

            {/* ===== UPCOMING TOURNAMENTS ===== */}
            {categorized.upcoming.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-4 w-4 text-amber-400" />
                  <h2 className="text-lg font-semibold text-white">Upcoming</h2>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                    {categorized.upcoming.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {categorized.upcoming.map((entry) => (
                    <UpcomingCard key={entry.tournament.id} entry={entry} />
                  ))}
                </div>
              </section>
            )}

            {/* ===== COMPLETED TOURNAMENTS ===== */}
            {categorized.completed.length > 0 && (
              <section>
                <button
                  onClick={() => setCompletedExpanded(!completedExpanded)}
                  className="flex items-center gap-2 mb-4 group w-full text-left"
                >
                  <Trophy className="h-4 w-4 text-slate-400" />
                  <h2 className="text-lg font-semibold text-white">Completed</h2>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-600/40 text-slate-400">
                    {categorized.completed.length}
                  </span>
                  <div className="ml-auto">
                    {completedExpanded ? (
                      <ChevronUp className="h-5 w-5 text-slate-400 group-hover:text-white transition-colors" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400 group-hover:text-white transition-colors" />
                    )}
                  </div>
                </button>

                <div
                  className={`transition-all duration-300 overflow-hidden ${
                    completedExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  {/* Search & Sort */}
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search tournaments..."
                        value={completedSearch}
                        onChange={(e) => setCompletedSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-800/70 border border-slate-700/50 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                      />
                    </div>
                    <div className="relative">
                      <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                      <select
                        value={completedSort}
                        onChange={(e) => setCompletedSort(e.target.value as SortOption)}
                        className="pl-9 pr-8 py-2.5 rounded-lg bg-slate-800/70 border border-slate-700/50 text-white text-sm appearance-none focus:outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
                      >
                        <option value="recent">Most Recent</option>
                        <option value="score">Highest Score</option>
                        <option value="name">Tournament Name</option>
                      </select>
                    </div>
                  </div>

                  {/* Completed Cards */}
                  <div className="space-y-2">
                    {visibleCompleted.length === 0 ? (
                      <p className="text-slate-500 text-sm text-center py-6">
                        No matching tournaments found.
                      </p>
                    ) : (
                      visibleCompleted.map((entry) => (
                        <CompletedCard key={entry.tournament.id} entry={entry} />
                      ))
                    )}
                  </div>

                  {/* Load More */}
                  {hasMoreCompleted && (
                    <button
                      onClick={() => setCompletedShowCount((prev) => prev + 5)}
                      className="mt-4 w-full py-2.5 rounded-lg border border-slate-700/50 text-slate-400 text-sm font-medium hover:text-white hover:border-slate-600 transition-colors"
                    >
                      Load More ({filteredCompleted.length - completedShowCount} remaining)
                    </button>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Floating Resume Button */}
      {firstActive && (
        <button
          onClick={() =>
            navigate(
              `/scorecard?tournamentId=${firstActive.tournament.id}&archerId=${firstActive.registration.id}&showTargets=true`
            )
          }
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95"
        >
          <Play className="h-5 w-5 fill-current" />
          Resume Scoring
        </button>
      )}
    </Layout>
  );
}

/* ===== ACTIVE CARD ===== */
function ActiveCard({
  entry,
  navigate,
}: {
  entry: MyTournamentEntry;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const progress = entry.score_summary.total_targets
    ? Math.round((entry.score_summary.targets_scored / entry.score_summary.total_targets) * 100)
    : null;

  return (
    <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-slate-800/80 p-5 shadow-lg shadow-emerald-500/5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
            {entry.registration.group_name && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                <Users className="h-3 w-3" />
                {entry.registration.group_name}
              </span>
            )}
          </div>
          <h3 className="text-xl font-bold text-white mt-2">{entry.tournament.name}</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> {formatDate(entry.tournament.date)}
            </span>
            {entry.tournament.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-emerald-400/70" /> {entry.tournament.location}
              </span>
            )}
          </div>
        </div>
        <div className="text-right ml-4">
          <span className="text-3xl font-bold text-emerald-400">
            {entry.score_summary.total_score}
          </span>
          <p className="text-xs text-slate-400 mt-0.5">
            {entry.score_summary.targets_scored} targets scored
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {progress !== null && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-700/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <button
        onClick={() =>
          navigate(
            `/scorecard?tournamentId=${entry.tournament.id}&archerId=${entry.registration.id}&showTargets=true`
          )
        }
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-base transition-colors active:scale-[0.98]"
      >
        <Play className="h-5 w-5 fill-current" />
        Continue Scoring
      </button>
    </div>
  );
}

/* ===== UPCOMING CARD ===== */
function UpcomingCard({ entry }: { entry: MyTournamentEntry }) {
  const daysUntil = getDaysUntil(entry.tournament.date);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-slate-800/60 p-4 hover:bg-slate-800/80 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
          <Clock className="h-3 w-3" />
          UPCOMING
        </span>
        <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md">
          {daysUntil === 0 ? 'Tomorrow' : daysUntil === 1 ? '1 day' : `${daysUntil} days`}
        </span>
      </div>

      <h3 className="text-base font-semibold text-white mt-2">{entry.tournament.name}</h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-slate-400">
        <span className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" /> {formatDate(entry.tournament.date)}
        </span>
        {entry.tournament.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {entry.tournament.location}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-slate-500">
          {entry.registration.division} • Registered
        </span>
        <Link
          to={`/scorecard?tournamentId=${entry.tournament.id}&archerId=${entry.registration.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
          View Details
        </Link>
      </div>
    </div>
  );
}

/* ===== COMPLETED CARD ===== */
function CompletedCard({ entry }: { entry: MyTournamentEntry }) {
  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-800/40 p-4 hover:bg-slate-800/60 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-600/40 text-slate-400 uppercase tracking-wider">
              Completed
            </span>
            {entry.registration.group_name && (
              <span className="text-xs text-slate-500 truncate">
                {entry.registration.group_name}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-white truncate">{entry.tournament.name}</h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {formatDate(entry.tournament.date)}
            </span>
            {entry.tournament.location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3" /> {entry.tournament.location}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 ml-3">
          <div className="text-right">
            <span className="text-lg font-bold text-white">{entry.score_summary.total_score}</span>
            <p className="text-[10px] text-slate-500">{entry.score_summary.targets_scored} targets</p>
          </div>
          <Link
            to={`/scorecard?tournamentId=${entry.tournament.id}&archerId=${entry.registration.id}&showTargets=true`}
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="View Scorecard"
          >
            <Eye className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}