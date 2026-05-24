import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowLeft, Loader2, Users, Search, UserPlus, Clock, XCircle, Lock, Copy, Hash } from 'lucide-react';

interface TournamentDetail {
  id: number;
  name: string;
  date: string;
  start_time?: string;
  location?: string;
  divisions?: string;
  mulligans?: string;
  max_group_size?: number;
}

interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
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

interface GroupMember {
  id: number;
  first_name: string;
  last_name: string;
  archer_name?: string;
}

interface GroupInfo {
  group: {
    id: number;
    tournament_id: number;
    group_name: string;
    group_number: number;
    shooting_order_mode: string;
    creator_id: string;
    visibility?: string;
    invite_code?: string;
  };
  members: GroupMember[];
}

type GroupOption = 'find' | 'join_code' | 'create';

export default function ArcherRegister() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user, token } = useAuth();
  const client = getClient();

  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [division, setDivision] = useState('');
  const [purchasedMulligans, setPurchasedMulligans] = useState<Record<string, number>>({});

  // Group state - initialize from URL ?tab param
  const initialTab = (['find', 'join_code', 'create'].includes(searchParams.get('tab') || '') 
    ? searchParams.get('tab') as GroupOption 
    : 'find');
  const [groupOption, setGroupOption] = useState<GroupOption>(initialTab);
  const [groupName, setGroupName] = useState('');
  const [groupVisibility, setGroupVisibility] = useState<'public' | 'private'>('public');
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [ungroupedArchers, setUngroupedArchers] = useState<UngroupedArcher[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingArchers, setLoadingArchers] = useState(false);
  const [groupCreated, setGroupCreated] = useState(false);

  // Find group state
  const [existingGroups, setExistingGroups] = useState<GroupInfo[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [joinedGroup, setJoinedGroup] = useState(false);

  // Join by code state
  const [inviteCode, setInviteCode] = useState('');
  const [joinByCodeSuccess, setJoinByCodeSuccess] = useState(false);

  // Registration countdown state
  const [countdown, setCountdown] = useState<CountdownTime | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tournament started (time-lock for groups)
  const [tournamentStarted, setTournamentStarted] = useState(false);

  const getRegistrationDeadline = useCallback((t: TournamentDetail): Date | null => {
    if (!t.date) return null;
    if (!t.start_time) return null;
    const dateTimeStr = `${t.date}T${t.start_time}:00`;
    const deadline = new Date(dateTimeStr);
    if (isNaN(deadline.getTime())) return null;
    return deadline;
  }, []);

  const calculateCountdown = useCallback((deadline: Date): CountdownTime => {
    const now = new Date();
    const diff = deadline.getTime() - now.getTime();
    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { days, hours, minutes, seconds, expired: false };
  }, []);

  // Start countdown when tournament is loaded
  useEffect(() => {
    if (!tournament) return;
    const deadline = getRegistrationDeadline(tournament);
    if (!deadline) {
      setCountdown(null);
      return;
    }
    setCountdown(calculateCountdown(deadline));
    countdownIntervalRef.current = setInterval(() => {
      const cd = calculateCountdown(deadline);
      setCountdown(cd);
      if (cd.expired && countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }, 1000);
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [tournament, getRegistrationDeadline, calculateCountdown]);

  const registrationClosed = countdown?.expired === true;

  // Check if tournament has started (for time-lock on groups)
  useEffect(() => {
    if (!tournament) return;
    const deadline = getRegistrationDeadline(tournament);
    if (deadline) {
      setTournamentStarted(new Date() >= deadline);
    }
  }, [tournament, getRegistrationDeadline]);

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

        // Check if user is already registered
        if (token) {
          try {
            const myRes = await client.apiCall.invoke({
              url: '/api/v1/tournament/my-tournaments',
              method: 'GET',
              data: {},
              options: {
                headers: { Authorization: `Bearer ${token}` },
              },
            });
            const myTournaments = myRes?.data || [];
            const isRegistered = myTournaments.some(
              (item: { tournament: { id: number } }) => item.tournament?.id === Number(id)
            );
            if (isRegistered) {
              setAlreadyRegistered(true);
            }
          } catch {
            // If check fails, allow registration attempt
          }
        }
      } catch {
        setError('Failed to load tournament details.');
      } finally {
        setLoading(false);
      }
    };
    fetchTournament();
  }, [id, token]);

  // Fetch public groups when "find" option is selected
  useEffect(() => {
    if (groupOption !== 'find' || !id) return;

    const fetchGroups = async () => {
      setLoadingGroups(true);
      try {
        const res = await client.apiCall.invoke({
          url: `/api/v1/groups/find/${id}`,
          method: 'GET',
          data: {},
        });
        const groups = res?.data?.items || res?.data || [];
        setExistingGroups(groups);
      } catch {
        setExistingGroups([]);
      } finally {
        setLoadingGroups(false);
      }
    };
    fetchGroups();
  }, [groupOption, id]);

  // Fetch ungrouped archers when "create" option is selected
  useEffect(() => {
    if (groupOption !== 'create' || !id || !token) return;

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
        setUngroupedArchers([]);
      } finally {
        setLoadingArchers(false);
      }
    };
    fetchUngrouped();
  }, [groupOption, id, token]);

  const divisions = tournament?.divisions?.split(',').map((d) => d.trim()) || [];
  const maxGroupSize = tournament?.max_group_size || 4;

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

  const filteredGroups = existingGroups.filter((g) => {
    if (!groupSearchQuery.trim()) return true;
    const query = groupSearchQuery.toLowerCase();
    const nameMatch = g.group.group_name?.toLowerCase().includes(query);
    const memberMatch = g.members.some(
      (m) => `${m.first_name} ${m.last_name}`.toLowerCase().includes(query)
    );
    return nameMatch || memberMatch;
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

      // Handle group actions after registration
      if (!tournamentStarted) {
        if (groupOption === 'find' && selectedGroupId !== null) {
          try {
            await client.apiCall.invoke({
              url: '/api/v1/groups/join',
              method: 'POST',
              data: {
                tournament_id: tournament.id,
                group_id: selectedGroupId,
              },
              options: {
                headers: { Authorization: `Bearer ${token}` },
              },
            });
            setJoinedGroup(true);
          } catch {
            // Join failed but registration succeeded
          }
        } else if (groupOption === 'join_code' && inviteCode.trim()) {
          try {
            await client.apiCall.invoke({
              url: '/api/v1/groups/join-by-code',
              method: 'POST',
              data: {
                tournament_id: tournament.id,
                invite_code: inviteCode.trim().toUpperCase(),
              },
              options: {
                headers: { Authorization: `Bearer ${token}` },
              },
            });
            setJoinByCodeSuccess(true);
          } catch {
            // Join by code failed but registration succeeded
          }
        } else if (groupOption === 'create' && groupName.trim()) {
          try {
            await client.apiCall.invoke({
              url: '/api/v1/groups/create',
              method: 'POST',
              data: {
                tournament_id: tournament.id,
                group_name: groupName.trim(),
                member_ids: selectedMembers,
                shooting_order_mode: 'round_robin',
                visibility: groupVisibility,
              },
              options: {
                headers: { Authorization: `Bearer ${token}` },
              },
            });
            setGroupCreated(true);
          } catch {
            // Group creation failed but registration succeeded
          }
        }
      }

      setSuccess(true);
    } catch (err: unknown) {
      let message = 'Registration failed. Please try again.';
      if (err instanceof Error) {
        message = err.message;
      }
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const resp = (err as { response?: { data?: { detail?: string } } }).response;
        if (resp?.data?.detail) {
          message = resp.data.detail;
        }
      }
      if (message.toLowerCase().includes('already registered')) {
        setAlreadyRegistered(true);
        return;
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGroupAction = async () => {
    if (!tournament || !token) return;
    setSubmitting(true);
    setError(null);

    try {
      if (groupOption === 'find' && selectedGroupId !== null) {
        await client.apiCall.invoke({
          url: '/api/v1/groups/join',
          method: 'POST',
          data: {
            tournament_id: tournament.id,
            group_id: selectedGroupId,
          },
          options: {
            headers: { Authorization: `Bearer ${token}` },
          },
        });
        setJoinedGroup(true);
        setSuccess(true);
      } else if (groupOption === 'join_code' && inviteCode.trim()) {
        await client.apiCall.invoke({
          url: '/api/v1/groups/join-by-code',
          method: 'POST',
          data: {
            tournament_id: tournament.id,
            invite_code: inviteCode.trim().toUpperCase(),
          },
          options: {
            headers: { Authorization: `Bearer ${token}` },
          },
        });
        setJoinByCodeSuccess(true);
        setSuccess(true);
      } else if (groupOption === 'create' && groupName.trim()) {
        await client.apiCall.invoke({
          url: '/api/v1/groups/create',
          method: 'POST',
          data: {
            tournament_id: tournament.id,
            group_name: groupName.trim(),
            member_ids: selectedMembers,
            shooting_order_mode: 'round_robin',
            visibility: groupVisibility,
          },
          options: {
            headers: { Authorization: `Bearer ${token}` },
          },
        });
        setGroupCreated(true);
        setSuccess(true);
      }
    } catch (err: unknown) {
      let message = 'Group action failed. Please try again.';
      if (err instanceof Error) {
        message = err.message;
      }
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const resp = (err as { response?: { data?: { detail?: string } } }).response;
        if (resp?.data?.detail) {
          message = resp.data.detail;
        }
      }
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
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 mb-4 inline-block">
              <p className="text-emerald-400 text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Group &quot;{groupName}&quot; created successfully!
              </p>
            </div>
          )}
          {joinedGroup && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 mb-4 inline-block">
              <p className="text-emerald-400 text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Successfully joined group!
              </p>
            </div>
          )}
          {joinByCodeSuccess && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 mb-4 inline-block">
              <p className="text-emerald-400 text-sm flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Joined group via invite code!
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
            {tournament.start_time && <span>🕐 {tournament.start_time}</span>}
            {tournament.location && <span>📍 {tournament.location}</span>}
          </div>
        </div>

        {/* Registration Countdown / Closed Banner */}
        {countdown && !registrationClosed && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-amber-400" />
              <span className="text-sm font-semibold text-amber-400">Registration closes in:</span>
            </div>
            <div className="flex items-center gap-3">
              {countdown.days > 0 && (
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-bold text-white">{countdown.days}</span>
                  <span className="text-xs text-slate-400">days</span>
                </div>
              )}
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-white">{String(countdown.hours).padStart(2, '0')}</span>
                <span className="text-xs text-slate-400">hours</span>
              </div>
              <span className="text-xl text-slate-500 font-bold">:</span>
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-white">{String(countdown.minutes).padStart(2, '0')}</span>
                <span className="text-xs text-slate-400">min</span>
              </div>
              <span className="text-xl text-slate-500 font-bold">:</span>
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-white">{String(countdown.seconds).padStart(2, '0')}</span>
                <span className="text-xs text-slate-400">sec</span>
              </div>
            </div>
          </div>
        )}

        {registrationClosed && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 mb-6 text-center">
            <XCircle className="h-10 w-10 text-red-400 mx-auto mb-2" />
            <h3 className="text-lg font-bold text-red-400 mb-1">Registration Closed</h3>
            <p className="text-sm text-slate-400">
              The registration deadline for this tournament has passed. The tournament has already started.
            </p>
            <Link to="/archer">
              <Button className="mt-4 bg-slate-700 hover:bg-slate-600 text-white gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to Home
              </Button>
            </Link>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {alreadyRegistered && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 mb-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-emerald-400 font-semibold text-sm">You&apos;re already registered for this tournament</p>
                <p className="text-slate-400 text-xs mt-0.5">You can still manage your shooting group below.</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`space-y-5 ${registrationClosed && !alreadyRegistered ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* Basic Info Section */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${alreadyRegistered ? 'opacity-60' : ''}`}>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">First Name *</label>
              <input
                type="text"
                required={!alreadyRegistered}
                disabled={alreadyRegistered}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full h-12 px-4 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors disabled:cursor-not-allowed"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Last Name *</label>
              <input
                type="text"
                required={!alreadyRegistered}
                disabled={alreadyRegistered}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full h-12 px-4 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors disabled:cursor-not-allowed"
                placeholder="Doe"
              />
            </div>
          </div>

          <div className={alreadyRegistered ? 'opacity-60' : ''}>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
            <input
              type="tel"
              disabled={alreadyRegistered}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-12 px-4 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors disabled:cursor-not-allowed"
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

          {/* Group Selection Section */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">Shooting Group</h3>
            </div>

            {/* Time-lock banner */}
            {tournamentStarted && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 mb-4 flex items-center gap-2">
                <Lock className="h-4 w-4 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm font-medium">Groups are locked — tournament has started</p>
              </div>
            )}

            {/* 3 Tab Options */}
            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 ${tournamentStarted ? 'opacity-50 pointer-events-none' : ''}`}>
              <button
                type="button"
                onClick={() => {
                  setGroupOption('find');
                  setSelectedMembers([]);
                  setInviteCode('');
                }}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  groupOption === 'find'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                }`}
              >
                <Search className={`h-6 w-6 ${groupOption === 'find' ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className={`text-sm font-medium ${groupOption === 'find' ? 'text-emerald-400' : 'text-slate-300'}`}>
                  Find Group
                </span>
                <span className="text-xs text-slate-500 text-center">Browse public groups</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGroupOption('join_code');
                  setSelectedGroupId(null);
                  setSelectedMembers([]);
                }}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  groupOption === 'join_code'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                }`}
              >
                <Hash className={`h-6 w-6 ${groupOption === 'join_code' ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className={`text-sm font-medium ${groupOption === 'join_code' ? 'text-emerald-400' : 'text-slate-300'}`}>
                  Join by Code
                </span>
                <span className="text-xs text-slate-500 text-center">Enter invite code</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGroupOption('create');
                  setSelectedGroupId(null);
                  setInviteCode('');
                }}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  groupOption === 'create'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                }`}
              >
                <UserPlus className={`h-6 w-6 ${groupOption === 'create' ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className={`text-sm font-medium ${groupOption === 'create' ? 'text-emerald-400' : 'text-slate-300'}`}>
                  Create Group
                </span>
                <span className="text-xs text-slate-500 text-center">Start a new group</span>
              </button>
            </div>

            {/* Find Group Sub-flow */}
            {groupOption === 'find' && !tournamentStarted && (
              <div className="space-y-3 pt-3 border-t border-slate-700/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors text-sm"
                    placeholder="Search groups by name or member..."
                  />
                </div>

                {loadingGroups ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
                    <span className="text-slate-400 text-sm ml-2">Loading groups...</span>
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <p className="text-slate-500 text-sm py-4 text-center">
                    {existingGroups.length === 0
                      ? 'No public groups available for this tournament yet.'
                      : 'No groups match your search.'}
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {filteredGroups.map((g) => (
                      <button
                        key={g.group.id}
                        type="button"
                        onClick={() => setSelectedGroupId(g.group.id)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                          selectedGroupId === g.group.id
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-white">
                            {g.group.group_name}
                          </span>
                          <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">
                            {g.members.length}/{maxGroupSize}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {g.members.length} member{g.members.length !== 1 ? 's' : ''}
                          </span>
                          <span className="capitalize">{g.group.shooting_order_mode.replace('_', ' ')}</span>
                        </div>
                        {g.members.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {g.members.slice(0, 4).map((m) => (
                              <span key={m.id} className="text-xs bg-slate-700/50 text-slate-300 px-1.5 py-0.5 rounded">
                                {m.first_name} {m.last_name}
                              </span>
                            ))}
                            {g.members.length > 4 && (
                              <span className="text-xs text-slate-500">+{g.members.length - 4} more</span>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedGroupId && (
                  <p className="text-emerald-400 text-xs flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Group selected — will join after registration
                  </p>
                )}
              </div>
            )}

            {/* Join by Code Sub-flow */}
            {groupOption === 'join_code' && !tournamentStarted && (
              <div className="space-y-3 pt-3 border-t border-slate-700/50">
                <p className="text-sm text-slate-400">
                  Enter the 6-character invite code shared by your group leader.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 6))}
                    maxLength={6}
                    className="flex-1 h-12 px-4 rounded-lg border border-slate-600 bg-slate-800 text-white text-center text-lg font-mono tracking-widest placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors uppercase"
                    placeholder="ABC123"
                  />
                </div>
                {inviteCode.length === 6 && (
                  <p className="text-emerald-400 text-xs flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Code entered — will join group after registration
                  </p>
                )}
                {inviteCode.length > 0 && inviteCode.length < 6 && (
                  <p className="text-slate-500 text-xs">
                    {6 - inviteCode.length} more character{6 - inviteCode.length !== 1 ? 's' : ''} needed
                  </p>
                )}
              </div>
            )}

            {/* Create New Group Sub-flow */}
            {groupOption === 'create' && !tournamentStarted && (
              <div className="space-y-3 pt-3 border-t border-slate-700/50">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Group Name *</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors text-sm"
                    placeholder="e.g., Team Alpha"
                    required={groupOption === 'create'}
                  />
                </div>

                {/* Visibility Toggle */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Group Visibility</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setGroupVisibility('public')}
                      className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                        groupVisibility === 'public'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupVisibility('private')}
                      className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                        groupVisibility === 'private'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      Private
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {groupVisibility === 'public'
                      ? 'Anyone can find and join this group'
                      : 'Only accessible via invite code'}
                  </p>
                </div>

                {/* Member Selection */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Invite Members (optional) {selectedMembers.length > 0 && (
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

          {!alreadyRegistered && (
            <Button
              type="submit"
              disabled={submitting || !firstName || !lastName || registrationClosed}
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Registering...
                </span>
              ) : registrationClosed ? (
                'Registration Closed'
              ) : (
                'Register Now'
              )}
            </Button>
          )}

          {alreadyRegistered && !tournamentStarted && (
            <Button
              type="button"
              disabled={submitting || (groupOption === 'find' && !selectedGroupId) || (groupOption === 'join_code' && inviteCode.length < 6) || (groupOption === 'create' && !groupName.trim())}
              onClick={handleGroupAction}
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                </span>
              ) : groupOption === 'find' ? (
                'Join Selected Group'
              ) : groupOption === 'join_code' ? (
                'Join Group by Code'
              ) : (
                'Create Group'
              )}
            </Button>
          )}
        </form>
      </div>
    </Layout>
  );
}