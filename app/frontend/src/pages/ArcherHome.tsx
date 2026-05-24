import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import {
  Trophy,
  ClipboardList,
  BarChart3,
  Calendar,
  MapPin,
  Target,
  ArrowRight,
  Eye,
  Play,
  Users,
  Zap,
  Clock,
} from 'lucide-react';
import {
  getTournamentStatus,
  formatDate,
  getDaysUntil,
} from '@/lib/dateUtils';

interface TournamentInfo {
  id: number;
  name: string;
  date: string;
  end_date?: string;
  location?: string;
  divisions?: string;
  courses?: string;
}

interface RegistrationInfo {
  id: number;
  division: string;
  group_number?: number;
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

interface PublicTournament {
  id: number;
  name: string;
  date: string;
  location?: string;
  divisions?: string;
  courses?: string;
  status?: string;
}

export default function ArcherHome() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [myTournaments, setMyTournaments] = useState<MyTournamentEntry[]>([]);
  const [upcomingTournaments, setUpcomingTournaments] = useState<PublicTournament[]>([]);
  const [loadingMy, setLoadingMy] = useState(true);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const client = getClient();

  useEffect(() => {
    const fetchMyTournaments = async () => {
      if (!token) {
        setLoadingMy(false);
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
        setLoadingMy(false);
      }
    };
    fetchMyTournaments();
  }, [token]);

  useEffect(() => {
    const fetchUpcoming = async () => {
      try {
        const res = await client.apiCall.invoke({
          url: '/api/v1/tournament/public-tournaments',
          method: 'GET',
          data: {},
        });
        const all: PublicTournament[] = res?.data?.items || res?.data || [];
        const today = new Date().toISOString().split('T')[0];
        setUpcomingTournaments(all.filter((t) => t.date >= today));
      } catch {
        setUpcomingTournaments([]);
      } finally {
        setLoadingUpcoming(false);
      }
    };
    fetchUpcoming();
  }, []);

  const categorized = useMemo(() => {
    const active: MyTournamentEntry[] = [];
    const upcoming: MyTournamentEntry[] = [];
    const registered: MyTournamentEntry[] = [];

    myTournaments.forEach((entry) => {
      const status = getTournamentStatus(entry.tournament.date, entry.tournament.end_date);
      if (status === 'active') active.push(entry);
      else if (status === 'upcoming') upcoming.push(entry);
      else registered.push(entry);
    });

    upcoming.sort((a, b) => new Date(a.tournament.date).getTime() - new Date(b.tournament.date).getTime());

    return { active, upcoming, registered };
  }, [myTournaments]);

  const displayName = user?.first_name || user?.email?.split('@')[0] || 'Archer';

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-[#0f172a] to-[#0f172a]" />
        <div className="relative max-w-7xl mx-auto px-4 py-10 md:py-16">
          <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-2 tracking-tight">
            Welcome back, <span className="text-emerald-400">{displayName}</span>
          </h1>
          <p className="text-lg text-slate-300 mb-4">
            Track your tournaments, view scores, and stay on target.
          </p>
        </div>
      </section>

      {/* ===== ACTIVE SCORECARDS - FRONT AND CENTER ===== */}
      {!loadingMy && categorized.active.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 -mt-2 relative z-10 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Active Scorecards</h2>
            <span className="relative flex h-3 w-3 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div className="space-y-4">
            {categorized.active.map((entry) => (
              <ActiveScorecardCard key={entry.tournament.id} entry={entry} navigate={navigate} />
            ))}
          </div>
        </section>
      )}

      {/* Loading state for active section */}
      {loadingMy && (
        <section className="max-w-7xl mx-auto px-4 mb-8">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 animate-pulse h-40" />
        </section>
      )}

      {/* ===== UPCOMING REGISTERED TOURNAMENTS ===== */}
      {!loadingMy && categorized.upcoming.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Upcoming Registered</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
              {categorized.upcoming.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categorized.upcoming.map((entry) => (
              <UpcomingRegisteredCard key={entry.tournament.id} entry={entry} />
            ))}
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <section className="max-w-7xl mx-auto px-4 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/archer/my-scorecards"
            className="flex items-center gap-4 p-5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all group"
          >
            <div className="h-12 w-12 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold group-hover:text-amber-400 transition-colors">All Scorecards</h3>
              <p className="text-sm text-slate-400">View full scoring history</p>
            </div>
          </Link>
          <Link
            to="/leaderboard"
            className="flex items-center gap-4 p-5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-all group"
          >
            <div className="h-12 w-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold group-hover:text-blue-400 transition-colors">Live Leaderboard</h3>
              <p className="text-sm text-slate-400">View real-time rankings</p>
            </div>
          </Link>
        </div>
      </section>

      {/* My Tournaments (non-active) */}
      {!loadingMy && myTournaments.length > 0 && categorized.registered.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-8">
          <h2 className="text-2xl font-bold text-white mb-5 flex items-center gap-2">
            <Target className="h-6 w-6 text-emerald-400" />
            Completed Tournaments
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categorized.registered.map((entry) => (
              <div
                key={entry.tournament.id}
                className="rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 hover:border-emerald-500/30 transition-all p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white">{entry.tournament.name}</h3>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-600/40 text-slate-400">
                    Completed
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400 mb-3">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> {formatDate(entry.tournament.date)}
                  </span>
                  {entry.tournament.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-emerald-400/70" /> {entry.tournament.location}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-emerald-400">{entry.score_summary.total_score}</span>
                      <span className="text-sm text-slate-400">pts</span>
                    </div>
                    <div className="text-sm text-slate-400">
                      {entry.score_summary.targets_scored} targets scored
                    </div>
                  </div>
                  <Link
                    to={`/scorecard?tournamentId=${entry.tournament.id}&archerId=${entry.registration.id}&showTargets=true`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state for no tournaments */}
      {!loadingMy && myTournaments.length === 0 && (
        <section className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-12 rounded-xl border border-slate-700/30 bg-slate-800/30">
            <Target className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-lg">You haven&apos;t registered for any tournaments yet.</p>
            <p className="text-slate-500 text-sm mt-1">Browse upcoming tournaments below to get started.</p>
          </div>
        </section>
      )}

      {/* Upcoming Tournaments (public) */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-white mb-5 flex items-center gap-2">
          <Trophy className="h-6 w-6 text-blue-400" />
          Upcoming Tournaments
        </h2>
        {loadingUpcoming ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 animate-pulse h-36" />
            ))}
          </div>
        ) : upcomingTournaments.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-slate-700/30 bg-slate-800/30">
            <Trophy className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-lg">No upcoming tournaments available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingTournaments.map((t) => {
              const myEntry = myTournaments.find((m) => m.tournament.id === t.id);
              const isRegistered = !!myEntry;
              const groupName = myEntry?.registration?.group_name;

              return (
                <div
                  key={t.id}
                  className="group rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 hover:border-blue-500/30 transition-all p-5"
                >
                  <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                    {t.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400 mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> {t.date}
                    </span>
                    {t.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-blue-400/70" /> {t.location}
                      </span>
                    )}
                  </div>
                  {t.divisions && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {t.divisions.split(',').map((d) => (
                        <span key={d.trim()} className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
                          {d.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Group Status / Registration Action */}
                  {isRegistered ? (
                    <div className="mb-3">
                      {groupName ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <Users className="h-3 w-3" />
                          Group: {groupName}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/archer/register/${t.id}?tab=find`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-colors"
                          >
                            <Users className="h-3 w-3" />
                            Find Group
                          </Link>
                          <Link
                            to={`/archer/register/${t.id}?tab=create`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                          >
                            <Users className="h-3 w-3" />
                            Create Group
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {isRegistered ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-center text-xs font-medium py-2 rounded-lg bg-slate-700/50 text-slate-400 border border-slate-600/30">
                        ✓ Registered
                      </span>
                    </div>
                  ) : (
                    <Link to={`/archer/register/${t.id}`}>
                      <Button size="sm" className="w-full bg-blue-500 hover:bg-blue-600 text-white gap-2">
                        Register <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Floating Resume Button for quick access */}
      {!loadingMy && categorized.active.length > 0 && (
        <button
          onClick={() => {
            const first = categorized.active[0];
            navigate(
              `/scorecard?tournamentId=${first.tournament.id}&archerId=${first.registration.id}&showTargets=true`
            );
          }}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95 md:hidden"
        >
          <Play className="h-5 w-5 fill-current" />
          Resume Scoring
        </button>
      )}
    </Layout>
  );
}

/* ===== ACTIVE SCORECARD CARD ===== */
function ActiveScorecardCard({
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

/* ===== UPCOMING REGISTERED CARD ===== */
function UpcomingRegisteredCard({ entry }: { entry: MyTournamentEntry }) {
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

      {/* Group Status */}
      <div className="mt-3">
        {entry.registration.group_name ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Users className="h-3 w-3" />
            Group: {entry.registration.group_name}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to={`/archer/register/${entry.tournament.id}?tab=find`}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-colors"
            >
              <Users className="h-3 w-3" />
              Find Group
            </Link>
            <Link
              to={`/archer/register/${entry.tournament.id}?tab=create`}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
            >
              <Users className="h-3 w-3" />
              Create Group
            </Link>
          </div>
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