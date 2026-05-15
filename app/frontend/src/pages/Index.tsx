import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Trophy, ClipboardList, BarChart3, ArrowRight, Calendar, MapPin } from 'lucide-react';

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
  divisions?: string;
  num_targets?: number;
  courses?: string;
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
  const { user, login } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const client = getClient();

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

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO_URL} alt="Archery" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f172a]/60 via-[#0f172a]/80 to-[#0f172a]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 py-20 md:py-32 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-4 tracking-tight">
            BullsEye<span className="text-emerald-400"> Labs</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Digital archery tournament scoring. Replace paper scorecards with live scoring, real-time leaderboards, and instant results.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {user ? (
              <>
                <Link to="/create-tournament">
                  <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2 h-12 px-6">
                    <Trophy className="h-5 w-5" /> Create Tournament
                  </Button>
                </Link>
                <Link to="/scorecard">
                  <Button size="lg" variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 gap-2 h-12 px-6">
                    <ClipboardList className="h-5 w-5" /> My Scorecards
                  </Button>
                </Link>
              </>
            ) : (
              <Button size="lg" onClick={login} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2 h-12 px-6">
                Sign In to Get Started <ArrowRight className="h-5 w-5" />
              </Button>
            )}
            <Link to="/leaderboard">
              <Button size="lg" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700/50 gap-2 h-12 px-6">
                <BarChart3 className="h-5 w-5" /> Live Leaderboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Tournaments Section */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <Trophy className="h-6 w-6 text-emerald-400" />
          Tournaments
        </h2>
        {loadingTournaments ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 animate-pulse h-36" />
            ))}
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-slate-700/30 bg-slate-800/30">
            <Trophy className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-lg">No tournaments yet.</p>
            {user && (
              <Link to="/create-tournament">
                <Button className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white">
                  Create the First Tournament
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map((t) => {
              const courses = parseCourses(t.courses);
              return (
                <Link
                  key={t.id}
                  to={user ? `/dashboard/${t.id}` : '/leaderboard'}
                  className="group rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 hover:border-emerald-500/30 transition-all p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      {t.name}
                    </h3>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getStatusStyle(t.status)}`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> {t.date}
                    </span>
                    {courses.length > 0 && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {courses.length} course{courses.length > 1 ? 's' : ''}
                      </span>
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
              );
            })}
          </div>
        )}
      </section>
    </Layout>
  );
}