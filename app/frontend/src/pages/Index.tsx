import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Trophy, ClipboardList, BarChart3, Calendar, MapPin, Zap, Pencil, Trash2 } from 'lucide-react';

const HERO_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/1230028/2026-05-14/orhcm3yaagpa/hero-archery-sunset.png';

interface CourseConfig {
  course: number;
  targets: number;
}

interface Tournament {
  id: number;
  name: string;
  date: string;
  status: string;
  location?: string;
  divisions?: string;
  num_targets?: number;
  courses?: string;
}

function inferStatus(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  if (dateStr === today) return 'active';
  if (dateStr > today) return 'upcoming';
  return 'completed';
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/20 text-emerald-400';
    case 'upcoming':
      return 'bg-blue-500/20 text-blue-400';
    case 'completed':
      return 'bg-slate-500/20 text-slate-400';
    default:
      return 'bg-amber-500/20 text-amber-400';
  }
}

function parseCourses(coursesStr?: string): CourseConfig[] {
  if (!coursesStr) return [];
  try { return JSON.parse(coursesStr); } catch { return []; }
}

export default function Index() {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const client = getClient();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      navigate('/landing', { replace: true });
      return;
    }
    if (user) {
      if (user.role === 'user') {
        navigate('/archer', { replace: true });
      }
    }
  }, [user, isAuthenticated, loading, navigate]);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await client.apiCall.invoke({
          url: '/api/v1/tournament/public-list',
          method: 'GET',
          data: {},
        });
        setTournaments(res?.data?.items || []);
      } catch {
        setTournaments([]);
      } finally {
        setLoadingTournaments(false);
      }
    };
    fetchTournaments();
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const upcomingTournaments = tournaments.filter((t) => {
    const status = t.status === 'auto' ? inferStatus(t.date) : t.status;
    return status === 'upcoming' || status === 'active';
  });
  const activeTournaments = tournaments.filter((t) => {
    const status = t.status === 'auto' ? inferStatus(t.date) : t.status;
    return status === 'active';
  });
  const recentTournaments = tournaments
    .filter((t) => {
      const status = t.status === 'auto' ? inferStatus(t.date) : t.status;
      return status === 'completed';
    })
    .slice(0, 3);

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO_URL} alt="Archery" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f172a]/60 via-[#0f172a]/80 to-[#0f172a]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-28 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-4 tracking-tight">
            BullsEye<span className="text-emerald-400"> Labs</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Digital archery tournament scoring. Replace paper scorecards with live scoring, real-time leaderboards, and instant results.
          </p>

        </div>
      </section>

      {/* Quick Actions */}
      {user && (
        <section className="max-w-7xl mx-auto px-4 -mt-6 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              to="/create-tournament"
              className="flex items-center gap-4 p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all group"
            >
              <div className="h-12 w-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Trophy className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold group-hover:text-emerald-400 transition-colors">Create Tournament</h3>
                <p className="text-sm text-slate-400">Set up a new event</p>
              </div>
            </Link>
            <Link
              to="/create-scorecard"
              className="flex items-center gap-4 p-5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all group"
            >
              <div className="h-12 w-12 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold group-hover:text-amber-400 transition-colors">Create Scorecard</h3>
                <p className="text-sm text-slate-400">Design a scoring template</p>
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
      )}

      {/* Active Tournaments */}
      {activeTournaments.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-10">
          <h2 className="text-2xl font-bold text-white mb-5 flex items-center gap-2">
            <Zap className="h-6 w-6 text-emerald-400" />
            Active Now
            <span className="relative flex h-3 w-3 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTournaments.map((t) => {
              const courses = parseCourses(t.courses);
              return (
                <Link
                  key={t.id}
                  to={user ? `/dashboard/${t.id}` : '/leaderboard'}
                  className="group rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      {t.name}
                    </h3>
                    <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Live
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> {t.date}
                    </span>
                    {t.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-emerald-400/70" /> {t.location}
                      </span>
                    )}
                    {courses.length > 0 && (
                      <span>{courses.length} course{courses.length > 1 ? 's' : ''}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming Tournaments */}
      <section className="max-w-7xl mx-auto px-4 py-10">
        <h2 className="text-2xl font-bold text-white mb-5 flex items-center gap-2">
          <Trophy className="h-6 w-6 text-blue-400" />
          Upcoming Tournaments
        </h2>
        {loadingTournaments ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 animate-pulse h-36" />
            ))}
          </div>
        ) : upcomingTournaments.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-slate-700/30 bg-slate-800/30">
            <Trophy className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-lg">No upcoming tournaments.</p>
            {user && (
              <Link to="/create-tournament">
                <Button className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white">
                  Create a Tournament
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingTournaments.map((t) => {
              const courses = parseCourses(t.courses);
              const status = t.status === 'auto' ? inferStatus(t.date) : t.status;
              const isUpcoming = status === 'upcoming';
              return (
                <div
                  key={t.id}
                  className="group rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 hover:border-emerald-500/30 transition-all p-5 relative isolate"
                >
                  <Link
                    to={user ? `/dashboard/${t.id}` : '/leaderboard'}
                    className="block"
                  >
                    <div className={`flex items-start justify-between mb-3 ${isUpcoming && user ? 'pr-20' : ''}`}>
                      <h3 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors pr-2">
                        {t.name}
                      </h3>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap ${getStatusStyle(status)}`}>
                        {status === 'active' && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        )}
                        {status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" /> {t.date}
                      </span>
                      {t.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-emerald-400/70" /> {t.location}
                        </span>
                      )}
                      {courses.length > 0 && (
                        <span>{courses.length} course{courses.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                    {t.divisions && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {t.divisions.split(',').map((d) => (
                          <span key={d.trim()} className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
                            {d.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                  {isUpcoming && user && (
                    <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
                      <button
                        type="button"
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-700/80 border border-slate-600/50 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all"
                        title="Edit Tournament"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/edit-tournament/${t.id}`);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-700/80 border border-slate-600/50 text-slate-400 hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10 transition-all"
                        title="Delete Tournament"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (window.confirm(`Are you sure you want to delete "${t.name}"? This action cannot be undone.`)) {
                            client.apiCall.invoke({
                              url: `/api/v1/tournament/delete/${t.id}`,
                              method: 'DELETE',
                              data: {},
                            }).then(() => {
                              setTournaments((prev) => prev.filter((tour) => tour.id !== t.id));
                            }).catch(() => {
                              alert('Failed to delete tournament. Please try again.');
                            });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      {recentTournaments.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pb-12">
          <h2 className="text-2xl font-bold text-white mb-5 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-slate-400" />
            Recent Activity
          </h2>
          <div className="space-y-3">
            {recentTournaments.map((t) => (
              <Link
                key={t.id}
                to="/results"
                className="flex items-center justify-between p-4 rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600 transition-all"
              >
                <div>
                  <h3 className="text-white font-medium">{t.name}</h3>
                  <p className="text-sm text-slate-400 flex items-center gap-2 mt-0.5">
                    <Calendar className="h-3.5 w-3.5" /> {t.date}
                    {t.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {t.location}
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-500/20 text-slate-400">
                  Completed
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}