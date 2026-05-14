import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trophy, UserPlus, Play, Square, Download, Edit2, Check } from 'lucide-react';

interface Archer {
  id: number;
  archer_name: string;
  division: string;
  group_number: number | null;
  target_number: number | null;
  role: string;
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
  num_targets: number;
  divisions: string;
  status: string;
}

export default function TournamentDashboard() {
  const { id } = useParams<{ id: string }>();
  const { user, login } = useAuth();
  const client = getClient();
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [archers, setArchers] = useState<Archer[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [archerForm, setArcherForm] = useState({ archer_name: '', division: '', role: 'archer' });
  const [adding, setAdding] = useState(false);
  const [editingScore, setEditingScore] = useState<number | null>(null);
  const [editValue, setEditValue] = useState(0);

  const fetchData = async () => {
    if (!id) return;
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

  const addArcher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archerForm.archer_name || !id) return;
    setAdding(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/tournament/register-archer',
        method: 'POST',
        data: { tournament_id: parseInt(id), ...archerForm },
      });
      setArcherForm({ archer_name: '', division: '', role: 'archer' });
      fetchData();
    } catch (err) {
      console.error('Error adding archer:', err);
    } finally {
      setAdding(false);
    }
  };

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
          <Button onClick={login} className="bg-emerald-500 hover:bg-emerald-600 text-white">Sign In</Button>
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
          <p className="text-slate-400 text-center py-20">Tournament not found.</p>
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

            {/* Add Archer */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 mb-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-emerald-400" /> Register Archer
              </h2>
              <form onSubmit={addArcher} className="flex flex-col sm:flex-row gap-3">
                <Input
                  value={archerForm.archer_name}
                  onChange={(e) => setArcherForm({ ...archerForm, archer_name: e.target.value })}
                  placeholder="Archer name"
                  className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 flex-1"
                  required
                />
                <Input
                  value={archerForm.division}
                  onChange={(e) => setArcherForm({ ...archerForm, division: e.target.value })}
                  placeholder="Division"
                  className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 sm:w-40"
                />
                <Button type="submit" disabled={adding} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                  {adding ? 'Adding...' : 'Add'}
                </Button>
              </form>
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
                      </tr>
                    </thead>
                    <tbody>
                      {archers.map((a) => (
                        <tr key={a.id} className="border-b border-slate-700/30 text-slate-300">
                          <td className="py-2 px-3 font-medium text-white">{a.archer_name}</td>
                          <td className="py-2 px-3">{a.division || '-'}</td>
                          <td className="py-2 px-3">{a.group_number ?? '-'}</td>
                          <td className="py-2 px-3">{a.target_number ?? '-'}</td>
                          <td className="py-2 px-3">{a.role}</td>
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