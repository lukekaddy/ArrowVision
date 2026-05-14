import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardList, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';

interface Tournament {
  id: number;
  name: string;
  num_targets: number;
  status: string;
}

interface Archer {
  id: number;
  archer_name: string;
  group_number: number | null;
}

export default function Scorecard() {
  const { user, login } = useAuth();
  const client = getClient();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [archers, setArchers] = useState<Archer[]>([]);
  const [currentTarget, setCurrentTarget] = useState(1);
  const [selectedArcher, setSelectedArcher] = useState<Archer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);

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

  const selectTournament = async (id: string) => {
    const t = tournaments.find((t) => t.id === parseInt(id));
    if (!t) return;
    setSelectedTournament(t);
    setCurrentTarget(1);
    setSelectedArcher(null);
    setLastScore(null);
    try {
      const res = await client.apiCall.invoke({ url: `/api/v1/tournament/archers/${id}`, method: 'GET', data: {} });
      setArchers(res?.data || []);
    } catch {
      setArchers([]);
    }
  };

  const submitScore = async (scoreValue: number) => {
    if (!selectedTournament || !selectedArcher) return;
    setSubmitting(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/tournament/submit-score',
        method: 'POST',
        data: {
          tournament_id: selectedTournament.id,
          archer_id: selectedArcher.id,
          target_number: currentTarget,
          score_value: scoreValue,
        },
      });
      setLastScore(scoreValue);
    } catch (err) {
      console.error('Error submitting score:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <ClipboardList className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Sign In Required</h2>
          <Button onClick={login} className="bg-emerald-500 hover:bg-emerald-600 text-white">Sign In</Button>
        </div>
      </Layout>
    );
  }

  const SCORE_BUTTONS = [
    { value: 10, label: '10', color: 'bg-amber-500 hover:bg-amber-600', textColor: 'text-white' },
    { value: 8, label: '8', color: 'bg-red-500 hover:bg-red-600', textColor: 'text-white' },
    { value: 5, label: '5', color: 'bg-blue-500 hover:bg-blue-600', textColor: 'text-white' },
    { value: 0, label: 'Miss', color: 'bg-slate-600 hover:bg-slate-700', textColor: 'text-white' },
  ];

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-emerald-400" /> Scorecard
        </h1>

        {/* Tournament Select */}
        <div className="mb-6">
          <Select onValueChange={selectTournament}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-12">
              <SelectValue placeholder="Select Tournament" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {tournaments.map((t) => (
                <SelectItem key={t.id} value={t.id.toString()} className="text-white">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedTournament && (
          <>
            {/* Archer Select */}
            <div className="mb-6">
              <Select onValueChange={(v) => { setSelectedArcher(archers.find((a) => a.id === parseInt(v)) || null); setLastScore(null); }}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-12">
                  <SelectValue placeholder="Select Archer" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {archers.map((a) => (
                    <SelectItem key={a.id} value={a.id.toString()} className="text-white">{a.archer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedArcher && (
              <>
                {/* Target Navigation */}
                <div className="flex items-center justify-between mb-6 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                  <Button
                    variant="ghost"
                    onClick={() => { setCurrentTarget(Math.max(1, currentTarget - 1)); setLastScore(null); }}
                    disabled={currentTarget <= 1}
                    className="text-slate-300 hover:text-white"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <div className="text-center">
                    <p className="text-slate-400 text-sm">Target</p>
                    <p className="text-3xl font-bold text-white">{currentTarget}</p>
                    <p className="text-slate-500 text-xs">of {selectedTournament.num_targets}</p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => { setCurrentTarget(Math.min(selectedTournament.num_targets, currentTarget + 1)); setLastScore(null); }}
                    disabled={currentTarget >= selectedTournament.num_targets}
                    className="text-slate-300 hover:text-white"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </div>

                {/* Archer Info */}
                <div className="text-center mb-6">
                  <p className="text-lg text-white font-semibold">{selectedArcher.archer_name}</p>
                </div>

                {/* Score Buttons */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {SCORE_BUTTONS.map((btn) => (
                    <button
                      key={btn.value}
                      onClick={() => submitScore(btn.value)}
                      disabled={submitting}
                      className={`${btn.color} ${btn.textColor} rounded-2xl h-24 text-3xl font-bold transition-all active:scale-95 disabled:opacity-50`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                {/* Last Score Feedback */}
                {lastScore !== null && (
                  <div className="text-center py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-emerald-400 font-semibold">
                      Score {lastScore === 0 ? 'Miss' : lastScore} recorded for Target {currentTarget}
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}