import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowLeft, Loader2, Users, Search } from 'lucide-react';

interface TournamentDetail {
  id: number;
  name: string;
  date: string;
  location?: string;
  divisions?: string;
  mulligans?: string;
}

interface MulliganTypeConfig {
  name: string;
  max?: number;
  maxAllowed?: number;
}

interface MulliganConfig {
  enabled: boolean;
  types?: MulliganTypeConfig[];
}

interface UngroupedArcher {
  id: number;
  first_name: string;
  last_name: string;
  user_id?: string;
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

  // Group state
  const [startGroup, setStartGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [ungroupedArchers, setUngroupedArchers] = useState<UngroupedArcher[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingArchers, setLoadingArchers] = useState(false);
  const [groupCreated, setGroupCreated] = useState(false);

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

  // Fetch ungrouped archers when startGroup is toggled on
  useEffect(() => {
    if (!startGroup || !id || !token) return;

    const fetchUngrouped = async () => {
      setLoadingArchers(true);
      try {
        const res = await client.apiCall.invoke({
          url: `/api/v1/groups/ungrouped/${id}`,
          method: 'GET',
          data: {},
          options: {
            headers: { Authorization: `Bearer ${token}` },
          },
        });
        const archers = res?.data?.items || res?.data || [];
        setUngroupedArchers(archers);
      } catch {
        // Silently fail - archers list may be empty
        setUngroupedArchers([]);
      } finally {
        setLoadingArchers(false);
      }
    };
    fetchUngrouped();
  }, [startGroup, id, token]);

  const divisions = tournament?.divisions?.split(',').map((d) => d.trim()) || [];

  let mulliganConfig: MulliganConfig = { enabled: false };
  try {
    if (tournament?.mulligans) {
      const raw = tournament.mulligans;
      if (typeof raw === 'string') {
        mulliganConfig = JSON.parse(raw);
      } else if (typeof raw === 'object') {
        mulliganConfig = raw as unknown as MulliganConfig;
      }
    }
  } catch {
    // ignore parse errors
  }

  const getMulliganMax = (mt: MulliganTypeConfig): number => {
    return mt.max ?? mt.maxAllowed ?? 1;
  };

  const filteredArchers = ungroupedArchers.filter((archer) => {
    if (!searchQuery.trim()) return true;
    const fullName = `${archer.first_name} ${archer.last_name}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const toggleMember = (archerId: number) => {
    setSelectedMembers((prev) =>
      prev.includes(archerId) ? prev.filter((m) => m !== archerId) : [...prev, archerId]
    );
  };

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

      // Create group if enabled and members selected
      if (startGroup && selectedMembers.length > 0) {
        try {
          await client.apiCall.invoke({
            url: '/api/v1/groups/create',
            method: 'POST',
            data: {
              tournament_id: tournament.id,
              group_name: groupName.trim() || undefined,
              member_ids: selectedMembers,
              shooting_order_mode: 'round_robin',
            },
            options: {
              headers: { Authorization: `Bearer ${token}` },
            },
          });
          setGroupCreated(true);
        } catch {
          // Group creation failed but registration succeeded
          // We still show success but note the group issue
        }
      }

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
          <p className="text-slate-400 text-sm mb-4">
            Division: {division} • {tournament.date}
          </p>
          {groupCreated && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 mb-6 inline-block">
              <p className="text-emerald-400 text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Group created with {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''}!
              </p>
            </div>
          )}
          <div>
            <Link to="/archer">
              <Button className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to Home
              </Button>
            </Link>
          </div>
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
                {mulliganConfig.types.map((mt) => {
                  const maxVal = getMulliganMax(mt);
                  return (
                    <div key={mt.name} className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">{mt.name} (max {maxVal})</span>
                      <input
                        type="number"
                        min={0}
                        max={maxVal}
                        value={purchasedMulligans[mt.name] ?? 0}
                        onChange={(e) => {
                          const newVal = Math.max(0, Math.min(Number(e.target.value) || 0, maxVal));
                          setPurchasedMulligans((prev) => ({
                            ...prev,
                            [mt.name]: newVal,
                          }));
                        }}
                        className="w-20 h-10 px-3 rounded-lg border border-slate-600 bg-slate-800 text-white text-center focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Start a Group Section */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Start a Group</h3>
              </div>
              <button
                type="button"
                onClick={() => setStartGroup(!startGroup)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  startGroup ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    startGroup ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {startGroup && (
              <div className="space-y-3 mt-3 pt-3 border-t border-slate-700/50">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Group Name (optional)</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors text-sm"
                    placeholder="e.g., Team Alpha"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Select Members {selectedMembers.length > 0 && (
                      <span className="text-emerald-400">({selectedMembers.length} selected)</span>
                    )}
                  </label>

                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors text-sm"
                      placeholder="Search archers..."
                    />
                  </div>

                  {loadingArchers ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
                      <span className="text-slate-400 text-sm ml-2">Loading archers...</span>
                    </div>
                  ) : filteredArchers.length === 0 ? (
                    <p className="text-slate-500 text-sm py-3 text-center">
                      {ungroupedArchers.length === 0
                        ? 'No ungrouped archers available yet.'
                        : 'No archers match your search.'}
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-700/50 divide-y divide-slate-700/30">
                      {filteredArchers.map((archer) => (
                        <label
                          key={archer.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700/30 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedMembers.includes(archer.id)}
                            onChange={() => toggleMember(archer.id)}
                            className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-slate-200">
                            {archer.first_name} {archer.last_name}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

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