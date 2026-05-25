import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Square, Download, Edit2, Check, MapPin, Trophy } from 'lucide-react';

interface Archer {
  id: number;
  archer_name: string;
  first_name: string;
  last_name: string;
  phone: string;
  division: string;
  group_number: number | null;
  target_number: number | null;
  role: string;
  purchased_mulligans: string;
}

interface Score {
  id: number;
  archer_id: number;
  target_number: number;
  score_value: number;
  confirmed: boolean;
}



interface TournamentInfo {
  id: number;
  name: string;
  date: string;
  location?: string;
  num_targets: number;
  divisions: string;
  status: string;
  mulligans: string;
}



export default function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('tournamentId');
  const { user } = useAuth();
  const client = getClient();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [archers, setArchers] = useState<Archer[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [tournaments, setTournaments] = useState<TournamentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingScore, setEditingScore] = useState<number | null>(null);
  const [editValue, setEditValue] = useState(0);
  const [editingArcherGroup, setEditingArcherGroup] = useState<number | null>(null);
  const [editGroupValue, setEditGroupValue] = useState('');

  const fetchTournaments = async () => {
    setLoading(true);
    setTournament(null);
    setArchers([]);
    setScores([]);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/tournament/public-list',
        method: 'GET',
        data: {},
      });
      setTournaments(res?.data?.items || res?.data || []);
    } catch (err) {
      console.error('Error loading tournaments:', err);
      setTournaments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    if (!id) {
      fetchTournaments();
      return;
    }

    setLoading(true);
    try {
      const tRes = await client.apiCall.invoke({ url: `/api/v1/tournament/public/${id}`, method: 'GET', data: {} });
      setTournament(tRes?.data || null);

      const aRes = await client.apiCall.invoke({ url: `/api/v1/tournament/archers/${id}`, method: 'GET', data: {} });
      setArchers(aRes?.data || []);

      const sRes = await client.apiCall.invoke({ url: `/api/v1/tournament/scores/${id}`, method: 'GET', data: {} });
      setScores(sRes?.data || []);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);



  const updateStatus = async (status: string) => {
    if (!tournament) return;
    try {
      await client.entities.tournaments.update({ id: tournament.id.toString(), data: { status } });
      setTournament({ ...tournament, status });
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const saveScoreEdit = async (scoreId: number) => {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/tournament/update-score/${scoreId}`,
        method: 'PUT',
        data: { score_value: editValue },
      });
      setEditingScore(null);
      fetchData();
    } catch (err) {
      console.error('Error updating score:', err);
    }
  };

  const exportResults = async () => {
    if (!id) return;
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/tournament/export-results/${id}`,
        method: 'POST',
        data: {},
      });
      const blob = new Blob([JSON.stringify(res?.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tournament-${id}-results.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting:', err);
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Sign In Required</h2>
          <Button onClick={() => navigate('/auth?role=admin')} className="bg-emerald-500 hover:bg-emerald-600 text-white">Sign In</Button>
        </div>
      </Layout>
    );
  }

  const getArcherName = (archerId: number) => archers.find((a) => a.id === archerId)?.archer_name || `Archer #${archerId}`;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-slate-800 rounded w-1/2" />
            <div className="h-40 bg-slate-800 rounded" />
          </div>
        ) : !tournament ? (
          <div className="space-y-8">
            <div className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-6">
              <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
              <p className="text-slate-400">
                Select a tournament to open the full tournament control center.
              </p>
            </div>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-emerald-400" />
                Manage Tournaments
              </h2>
              {tournaments.length === 0 ? (
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 text-center">
                  <p className="text-slate-400 mb-4">No tournaments found.</p>
                  <Link to="/create-tournament">
                    <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
                      Create Tournament
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tournaments.map((item) => (
                    <Link
                      key={item.id}
                      to={`/admin?tournamentId=${item.id}`}
                      className="block rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 hover:border-emerald-500/40 hover:bg-slate-800 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-white hover:text-emerald-400 transition-colors">
                            {item.name}
                          </h3>
                          <p className="text-sm text-slate-400 mt-1">
                            {item.date} {item.location ? `· ${item.location}` : ''}
                          </p>
                        </div>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                          {item.status || 'auto'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold text-white">{tournament.name}</h1>
                <p className="text-slate-400 mt-1">
                  {tournament.date} · {tournament.num_targets} targets ·{' '}
                  <span className={tournament.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}>
                    {tournament.status}
                  </span>
                </p>
                {tournament.location && (
                  <p className="text-slate-400 mt-1 flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-emerald-400/70" />
                    {tournament.location}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {tournament.status !== 'active' && (
                  <Button onClick={() => updateStatus('active')} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1">
                    <Play className="h-4 w-4" /> Start
                  </Button>
                )}
                {tournament.status === 'active' && (
                  <Button onClick={() => updateStatus('completed')} variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10 gap-1">
                    <Square className="h-4 w-4" /> End
                  </Button>
                )}
                <Button onClick={exportResults} variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700/50 gap-1">
                  <Download className="h-4 w-4" /> Export
                </Button>
              </div>
            </div>

            {/* Archers List */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 mb-6">
              <h2 className="text-lg font-semibold text-white mb-4">Registered Archers ({archers.length})</h2>
              {archers.length === 0 ? (
                <p className="text-slate-500">No archers registered yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700/50">
                        <th className="text-left py-2 px-3">Name</th>
                        <th className="text-left py-2 px-3">Division</th>
                        <th className="text-left py-2 px-3">Group</th>
                        <th className="text-left py-2 px-3">Target</th>
                        <th className="text-left py-2 px-3">Role</th>
                        <th className="text-left py-2 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archers.map((a) => (
                        <tr key={a.id} className="border-b border-slate-700/30 text-slate-300">
                          <td className="py-2 px-3 font-medium text-white">{a.archer_name}</td>
                          <td className="py-2 px-3">{a.division || '-'}</td>
                          <td className="py-2 px-3">
                            {editingArcherGroup === a.id ? (
                              <Input
                                type="number"
                                min={1}
                                value={editGroupValue}
                                onChange={(e) => setEditGroupValue(e.target.value)}
                                className="w-16 h-8 bg-slate-900 border-slate-600 text-white text-sm"
                                autoFocus
                              />
                            ) : (
                              <span>{a.group_number ?? '-'}</span>
                            )}
                          </td>
                          <td className="py-2 px-3">{a.target_number ?? '-'}</td>
                          <td className="py-2 px-3">{a.role}</td>
                          <td className="py-2 px-3">
                            {editingArcherGroup === a.id ? (
                              <Button
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await client.entities.tournament_archers.update({
                                      id: a.id.toString(),
                                      data: { group_number: editGroupValue ? parseInt(editGroupValue) : null },
                                    });
                                    setEditingArcherGroup(null);
                                    fetchData();
                                  } catch (err) {
                                    console.error('Error updating group:', err);
                                  }
                                }}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white h-7 px-2"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingArcherGroup(a.id);
                                  setEditGroupValue(a.group_number?.toString() || '');
                                }}
                                className="text-slate-400 hover:text-white h-7 px-2"
                                title="Edit group assignment"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Scores */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
              <h2 className="text-lg font-semibold text-white mb-4">Scores ({scores.length})</h2>
              {scores.length === 0 ? (
                <p className="text-slate-500">No scores recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700/50">
                        <th className="text-left py-2 px-3">Archer</th>
                        <th className="text-left py-2 px-3">Target</th>
                        <th className="text-left py-2 px-3">Score</th>
                        <th className="text-left py-2 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.map((s) => (
                        <tr key={s.id} className="border-b border-slate-700/30 text-slate-300">
                          <td className="py-2 px-3 text-white">{getArcherName(s.archer_id)}</td>
                          <td className="py-2 px-3">{s.target_number}</td>
                          <td className="py-2 px-3">
                            {editingScore === s.id ? (
                              <Input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
                                className="w-20 h-8 bg-slate-900 border-slate-600 text-white"
                              />
                            ) : (
                              <span className="font-bold text-emerald-400">{s.score_value}</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {editingScore === s.id ? (
                              <Button size="sm" onClick={() => saveScoreEdit(s.id)} className="bg-emerald-500 hover:bg-emerald-600 text-white h-8">
                                <Check className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setEditingScore(s.id); setEditValue(s.score_value); }}
                                className="text-slate-400 hover:text-white h-8"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}