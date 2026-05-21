import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { ClipboardList, Calendar, MapPin, ChevronDown, ChevronUp, Target, ArrowLeft } from 'lucide-react';

interface TournamentInfo {
  id: number;
  name: string;
  date: string;
  location?: string;
}

interface RegistrationInfo {
  division: string;
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

interface ScoreDetail {
  target_number: number;
  score: number;
  course_number?: number;
}

export default function ArcherScorecards() {
  const { token } = useAuth();
  const [myTournaments, setMyTournaments] = useState<MyTournamentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [scoreDetails, setScoreDetails] = useState<Record<number, ScoreDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<number, boolean>>({});
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

  const toggleExpand = async (tournamentId: number) => {
    if (expandedId === tournamentId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(tournamentId);

    if (!scoreDetails[tournamentId]) {
      setLoadingDetails((prev) => ({ ...prev, [tournamentId]: true }));
      try {
        const res = await client.apiCall.invoke({
          url: `/api/v1/tournament/leaderboard?tournament_id=${tournamentId}`,
          method: 'GET',
          data: {},
        });
        const allScores = res?.data?.items || res?.data || [];
        // Filter to current user's scores if possible
        setScoreDetails((prev) => ({ ...prev, [tournamentId]: allScores }));
      } catch {
        setScoreDetails((prev) => ({ ...prev, [tournamentId]: [] }));
      } finally {
        setLoadingDetails((prev) => ({ ...prev, [tournamentId]: false }));
      }
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link to="/archer" className="inline-flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-amber-400" />
          My Scorecards
        </h1>
        <p className="text-slate-400 mb-8">View your tournament scores and history.</p>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 animate-pulse h-28" />
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
          <div className="space-y-4">
            {myTournaments.map((entry) => {
              const isExpanded = expandedId === entry.tournament.id;
              const details = scoreDetails[entry.tournament.id];
              const isLoadingDetail = loadingDetails[entry.tournament.id];

              return (
                <div
                  key={entry.tournament.id}
                  className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden transition-all"
                >
                  <button
                    onClick={() => toggleExpand(entry.tournament.id)}
                    className="w-full text-left p-5 hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">{entry.tournament.name}</h3>
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                            {entry.registration.division}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" /> {entry.tournament.date}
                          </span>
                          {entry.tournament.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-emerald-400/70" /> {entry.tournament.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-2xl font-bold text-emerald-400">{entry.score_summary.total_score}</span>
                          <p className="text-xs text-slate-400">{entry.score_summary.targets_scored} targets</p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-700/50 p-5 bg-slate-900/30">
                      {isLoadingDetail ? (
                        <div className="flex items-center justify-center py-6">
                          <div className="h-5 w-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                          <span className="ml-2 text-slate-400 text-sm">Loading scores...</span>
                        </div>
                      ) : !details || details.length === 0 ? (
                        <p className="text-slate-500 text-sm text-center py-4">No detailed scores available.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                          {details.map((score: ScoreDetail, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/30"
                            >
                              <span className="text-xs text-slate-400">
                                {score.course_number ? `C${score.course_number}-` : ''}T{score.target_number}
                              </span>
                              <span className="text-sm font-bold text-white">{score.score}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}