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

interface MulliganType {
  name: string;
  maxAllowed: number;
  restrictedTargets: number[];
}

interface MulliganConfig {
  enabled: boolean;
  types: MulliganType[];
}

interface TournamentInfo {
  id: number;
  name: string;
  date: string;
  num_targets: number;
  divisions: string;
  status: string;
  mulligans: string;
}

interface PurchasedMulligan {
  type: string;
  count: number;
}

export default function TournamentDashboard() {
  const { id } = useParams<{ id: string }>();
  const { user, login } = useAuth();
  const client = getClient();
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [archers, setArchers] = useState<Archer[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [archerForm, setArcherForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    division: '',
    role: 'archer',
  });
  const [purchasedMulligansEnabled, setPurchasedMulligansEnabled] = useState(false);
  const [purchasedMulligans, setPurchasedMulligans] = useState<Record<string, number>>({});
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

  const getMulliganConfig = (): MulliganConfig | null => {
    if (!tournament?.mulligans) return null;
    try {
      const config = JSON.parse(tournament.mulligans) as MulliganConfig;
      return config.enabled ? config : null;
    } catch {
      return null;
    }
  };

  const getTournamentDivisions = (): string[] => {
    if (!tournament?.divisions) return [];
    return tournament.divisions
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
  };

  const mulliganConfig = getMulliganConfig();
  const divisions = getTournamentDivisions();

  const addArcher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archerForm.first_name || !archerForm.last_name || !id) return;
    setAdding(true);
    try {
      const archerName = `${archerForm.first_name} ${archerForm.last_name}`;
      const mulliganData: PurchasedMulligan[] = purchasedMulligansEnabled
        ? Object.entries(purchasedMulligans)
            .filter(([, count]) => count > 0)
            .map(([type, count]) => ({ type, count }))
        : [];

      await client.apiCall.invoke({
        url: '/api/v1/tournament/register-archer',
        method: 'POST',
        data: {
          tournament_id: parseInt(id),
          archer_name: archerName,
          first_name: archerForm.first_name,
          last_name: archerForm.last_name,
          phone: archerForm.phone,
          division: archerForm.division,
          role: archerForm.role,
          purchased_mulligans: JSON.stringify(mulliganData),
        },
      });
      setArcherForm({ first_name: '', last_name: '', phone: '', division: '', role: 'archer' });
      setPurchasedMulligansEnabled(false);
      setPurchasedMulligans({});
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
              <form onSubmit={addArcher} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">First Name *</Label>
                    <Input
                      value={archerForm.first_name}
                      onChange={(e) => setArcherForm({ ...archerForm, first_name: e.target.value })}
                      placeholder="First name"
                      className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Last Name *</Label>
                    <Input
                      value={archerForm.last_name}
                      onChange={(e) => setArcherForm({ ...archerForm, last_name: e.target.value })}
                      placeholder="Last name"
                      className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Phone</Label>
                    <Input
                      value={archerForm.phone}
                      onChange={(e) => setArcherForm({ ...archerForm, phone: e.target.value })}
                      placeholder="Phone number"
                      className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Division</Label>
                    {divisions.length > 0 ? (
                      <select
                        value={archerForm.division}
                        onChange={(e) => setArcherForm({ ...archerForm, division: e.target.value })}
                        className="w-full h-10 px-3 rounded-md bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Select division</option>
                        {divisions.map((div) => (
                          <option key={div} value={div}>
                            {div}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={archerForm.division}
                        onChange={(e) => setArcherForm({ ...archerForm, division: e.target.value })}
                        placeholder="Division"
                        className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                      />
                    )}
                  </div>
                </div>

                {/* Purchased Mulligans */}
                {mulliganConfig && (
                  <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-slate-300 text-sm">Purchased Mulligans</Label>
                      <button
                        type="button"
                        onClick={() => setPurchasedMulligansEnabled(!purchasedMulligansEnabled)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          purchasedMulligansEnabled ? 'bg-amber-500' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            purchasedMulligansEnabled ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {purchasedMulligansEnabled && (
                      <div className="space-y-2 mt-3">
                        {mulliganConfig.types.map((mt) => (
                          <div key={mt.name} className="flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-300">{mt.name}</span>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={mt.maxAllowed}
                                value={purchasedMulligans[mt.name] || 0}
                                onChange={(e) =>
                                  setPurchasedMulligans((prev) => ({
                                    ...prev,
                                    [mt.name]: Math.min(
                                      parseInt(e.target.value) || 0,
                                      mt.maxAllowed
                                    ),
                                  }))
                                }
                                className="bg-slate-800 border-slate-700 text-white w-16 h-8 text-sm"
                              />
                              <span className="text-xs text-slate-500">max {mt.maxAllowed}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Button type="submit" disabled={adding} className="bg-emerald-500 hover:bg-emerald-600 text-white w-full sm:w-auto">
                  {adding ? 'Adding...' : 'Register Archer'}
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