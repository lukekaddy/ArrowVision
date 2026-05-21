import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Trophy, ClipboardList, BarChart3, Calendar, MapPin, Target, ArrowRight } from 'lucide-react';

interface TournamentInfo {
  id: number;
  name: string;
  date: string;
  location?: string;
  divisions?: string;
  courses?: string;
}

interface RegistrationInfo {
  division: string;
  group_number?: number;
  first_name?: string;
  last_name?: string;
}

interface ScoreSummary {
  total_score: number;
  targets_scored: number;
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

  const displayName = user?.first_name || user?.email?.split('@')[0] || 'Archer';

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-[#0f172a] to-[#0f172a]" />
        <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-20">
          <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-2 tracking-tight">
            Welcome back, <span className="text-emerald-400">{displayName}</span>
          </h1>
          <p className="text-lg text-slate-300 mb-6">
            Track your tournaments, view scores, and stay on target.
          </p>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="max-w-7xl mx-auto px-4 -mt-4 relative z-10 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/archer/my-scorecards"
            className="flex items-center gap-4 p-5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all group"
          >
            <div className="h-12 w-12 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold group-hover:text-amber-400 transition-colors">My Scorecards</h3>
              <p className="text-sm text-slate-400">View your scoring history</p>
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

      {/* My Tournaments */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-white mb-5 flex items-center gap-2">
          <Target className="h-6 w-6 text-emerald-400" />
          My Tournaments
        </h2>
        {loadingMy ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 animate-pulse h-36" />
            ))}
          </div>
        ) : myTournaments.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-slate-700/30 bg-slate-800/30">
            <Target className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-lg">You haven&apos;t registered for any tournaments yet.</p>
            <p className="text-slate-500 text-sm mt-1">Browse upcoming tournaments below to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myTournaments.map((entry) => (
              <div
                key={entry.tournament.id}
                className="rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 hover:border-emerald-500/30 transition-all p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white">{entry.tournament.name}</h3>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                    {entry.registration.division}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400 mb-3">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> {entry.tournament.date}
                  </span>
                  {entry.tournament.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-emerald-400/70" /> {entry.tournament.location}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 pt-3 border-t border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-emerald-400">{entry.score_summary.total_score}</span>
                    <span className="text-sm text-slate-400">pts</span>
                  </div>
                  <div className="text-sm text-slate-400">
                    {entry.score_summary.targets_scored} targets scored
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Tournaments */}
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
            {upcomingTournaments.map((t) => (
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
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {t.divisions.split(',').map((d) => (
                      <span key={d.trim()} className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
                        {d.trim()}
                      </span>
                    ))}
                  </div>
                )}
                <Link to={`/archer/register/${t.id}`}>
                  <Button size="sm" className="w-full bg-blue-500 hover:bg-blue-600 text-white gap-2">
                    Register <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}