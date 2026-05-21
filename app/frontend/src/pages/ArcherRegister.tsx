import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';

interface TournamentDetail {
  id: number;
  name: string;
  date: string;
  location?: string;
  divisions?: string;
  mulligans?: string;
}

interface MulliganConfig {
  enabled: boolean;
  types?: { name: string; max: number }[];
}

export default function ArcherRegister() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const client = getClient();

  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [division, setDivision] = useState('');
  const [purchasedMulligans, setPurchasedMulligans] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchTournament = async () => {
      try {
        const res = await client.apiCall.invoke({
          url: '/api/v1/tournament/public-tournaments',
          method: 'GET',
          data: {},
        });
        const all = res?.data?.items || res?.data || [];
        const found = all.find((t: TournamentDetail) => t.id === Number(id));
        if (found) {
          setTournament(found);
          const divs = found.divisions?.split(',').map((d: string) => d.trim()) || [];
          if (divs.length > 0) setDivision(divs[0]);
        }
      } catch {
        setError('Failed to load tournament details.');
      } finally {
        setLoading(false);
      }
    };
    fetchTournament();
  }, [id]);

  const divisions = tournament?.divisions?.split(',').map((d) => d.trim()) || [];

  let mulliganConfig: MulliganConfig = { enabled: false };
  try {
    if (tournament?.mulligans) {
      mulliganConfig = JSON.parse(tournament.mulligans);
    }
  } catch {
    // ignore parse errors
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tournament || !user) return;

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        tournament_id: tournament.id,
        archer_name: `${firstName} ${lastName}`.trim(),
        first_name: firstName,
        last_name: lastName,
        phone,
        division,
      };

      if (mulliganConfig.enabled && Object.keys(purchasedMulligans).length > 0) {
        body.purchased_mulligans = JSON.stringify(purchasedMulligans);
      }

      await client.apiCall.invoke({
        url: '/api/v1/tournament/register-archer',
        method: 'POST',
        data: body,
        options: {
          headers: { Authorization: `Bearer ${token}` },
        },
      });
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Loader2 className="h-8 w-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-slate-400 mt-4">Loading tournament details...</p>
        </div>
      </Layout>
    );
  }

  if (!tournament) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-slate-400 text-lg">Tournament not found.</p>
          <Link to="/archer">
            <Button className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white">
              Back to Home
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  if (success) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <CheckCircle className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Registration Successful!</h2>
          <p className="text-slate-300 mb-2">
            You&apos;re registered for <span className="text-emerald-400 font-semibold">{tournament.name}</span>
          </p>
          <p className="text-slate-400 text-sm mb-6">
            Division: {division} • {tournament.date}
          </p>
          <Link to="/archer">
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Home
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link to="/archer" className="inline-flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Register for Tournament</h1>
          <h2 className="text-lg text-emerald-400 font-semibold mb-2">{tournament.name}</h2>
          <div className="flex flex-wrap gap-4 text-sm text-slate-400">
            <span>📅 {tournament.date}</span>
            {tournament.location && <span>📍 {tournament.location}</span>}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">First Name *</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full h-12 px-4 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Last Name *</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full h-12 px-4 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-12 px-4 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
              placeholder="(555) 123-4567"
            />
          </div>

          {divisions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Division *</label>
              <select
                required
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                className="w-full h-12 px-4 rounded-lg border border-slate-600 bg-slate-800 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors"
              >
                {divisions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {mulliganConfig.enabled && mulliganConfig.types && mulliganConfig.types.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <h3 className="text-sm font-semibold text-amber-400 mb-3">Purchase Mulligans (Optional)</h3>
              <div className="space-y-3">
                {mulliganConfig.types.map((mt) => (
                  <div key={mt.name} className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">{mt.name} (max {mt.max})</span>
                    <input
                      type="number"
                      min={0}
                      max={mt.max}
                      value={purchasedMulligans[mt.name] || 0}
                      onChange={(e) =>
                        setPurchasedMulligans((prev) => ({
                          ...prev,
                          [mt.name]: Math.min(Number(e.target.value), mt.max),
                        }))
                      }
                      className="w-20 h-10 px-3 rounded-lg border border-slate-600 bg-slate-800 text-white text-center focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting || !firstName || !lastName}
            className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Registering...
              </span>
            ) : (
              'Register Now'
            )}
          </Button>
        </form>
      </div>
    </Layout>
  );
}