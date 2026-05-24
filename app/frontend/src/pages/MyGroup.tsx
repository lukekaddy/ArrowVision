import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Users, LogOut, RefreshCw, Loader2, AlertCircle, ChevronDown, ChevronUp, MapPin, Calendar, Copy, Check, Lock, Trash2 } from 'lucide-react';

interface GroupMember {
  id: number;
  first_name: string;
  last_name: string;
  user_id?: string;
}

interface GroupInfo {
  id: number;
  group_name?: string;
  group_number?: number;
  shooting_order_mode?: string;
  creator_id?: string;
  tournament_id: number;
  invite_code?: string;
  visibility?: string;
}

interface TournamentInfo {
  id: number;
  name: string;
  date?: string | null;
  start_time?: string | null;
  location?: string | null;
}

interface MyGroupEntry {
  group: GroupInfo;
  members: GroupMember[];
  tournament: TournamentInfo;
}

interface ShootingOrderEntry {
  archer_id: number;
  first_name: string;
  last_name: string;
  order: number;
}

export default function MyGroup() {
  const { user, token } = useAuth();
  const client = getClient();

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<MyGroupEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);

  // Per-group state for shooting order
  const [targetNumbers, setTargetNumbers] = useState<Record<number, number>>({});
  const [shootingOrders, setShootingOrders] = useState<Record<number, ShootingOrderEntry[]>>({});
  const [loadingOrders, setLoadingOrders] = useState<Record<number, boolean>>({});

  // Leave group state
  const [leavingGroupId, setLeavingGroupId] = useState<number | null>(null);

  // Dissolve group state
  const [dissolvingGroupId, setDissolvingGroupId] = useState<number | null>(null);
  const [confirmDissolveId, setConfirmDissolveId] = useState<number | null>(null);

  // Shooting order mode
  const [changingModeId, setChangingModeId] = useState<number | null>(null);
  const [selectedModes, setSelectedModes] = useState<Record<number, string>>({});

  // Copy invite code
  const [copiedGroupId, setCopiedGroupId] = useState<number | null>(null);

  useEffect(() => {
    fetchAllGroups();
  }, [token]);

  const fetchAllGroups = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/groups/my-groups',
        method: 'GET',
        data: {},
        options: {
          headers: { Authorization: `Bearer ${token}` },
        },
      });

      const rawData = res?.data?.items || res?.data || [];
      const groupEntries: MyGroupEntry[] = Array.isArray(rawData) ? rawData : [];
      setGroups(groupEntries);

      // Initialize selected modes (normalize round_robin to sequential)
      const modes: Record<number, string> = {};
      groupEntries.forEach((entry) => {
        const raw = entry.group.shooting_order_mode || 'sequential';
        modes[entry.group.id] = raw === 'round_robin' ? 'sequential' : raw;
      });
      setSelectedModes(modes);

      // Auto-expand first group if only one
      if (groupEntries.length === 1) {
        setExpandedGroupId(groupEntries[0].group.id);
      }
    } catch {
      setError('Failed to load your groups.');
    } finally {
      setLoading(false);
    }
  };

  const fetchShootingOrder = async (groupId: number) => {
    if (!token) return;
    const target = targetNumbers[groupId] || 1;
    setLoadingOrders((prev) => ({ ...prev, [groupId]: true }));
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/groups/${groupId}/shooting-order?target_number=${target}`,
        method: 'GET',
        data: {},
        options: {
          headers: { Authorization: `Bearer ${token}` },
        },
      });
      const data = res?.data?.items || res?.data || {};
      const orderList = Array.isArray(data) ? data : (data.order || []);
      setShootingOrders((prev) => ({
        ...prev,
        [groupId]: orderList.map((entry: { position?: number; order?: number; archer_id: number; first_name: string; last_name: string; archer_name?: string }) => ({
          archer_id: entry.archer_id,
          first_name: entry.first_name || entry.archer_name || '',
          last_name: entry.last_name || '',
          order: entry.position ?? entry.order ?? 0,
        })),
      }));
    } catch {
      setShootingOrders((prev) => ({ ...prev, [groupId]: [] }));
    } finally {
      setLoadingOrders((prev) => ({ ...prev, [groupId]: false }));
    }
  };

  useEffect(() => {
    if (expandedGroupId !== null) {
      fetchShootingOrder(expandedGroupId);
    }
  }, [expandedGroupId, targetNumbers]);

  const handleLeaveGroup = async (tournamentId: number, groupId: number) => {
    if (!token) return;
    setLeavingGroupId(groupId);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/groups/leave',
        method: 'POST',
        data: { tournament_id: tournamentId },
        options: {
          headers: { Authorization: `Bearer ${token}` },
        },
      });
      setGroups((prev) => prev.filter((g) => g.group.id !== groupId));
      if (expandedGroupId === groupId) {
        setExpandedGroupId(null);
      }
    } catch {
      setError('Failed to leave group. Please try again.');
    } finally {
      setLeavingGroupId(null);
    }
  };

  const handleDissolveGroup = async (groupId: number) => {
    if (!token) return;
    setDissolvingGroupId(groupId);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/groups/dissolve',
        method: 'POST',
        data: { group_id: groupId },
        options: {
          headers: { Authorization: `Bearer ${token}` },
        },
      });
      setGroups((prev) => prev.filter((g) => g.group.id !== groupId));
      if (expandedGroupId === groupId) {
        setExpandedGroupId(null);
      }
      setConfirmDissolveId(null);
    } catch {
      setError('Failed to dissolve group. Please try again.');
    } finally {
      setDissolvingGroupId(null);
    }
  };

  const handleChangeMode = async (groupId: number) => {
    if (!token || !selectedModes[groupId]) return;
    setChangingModeId(groupId);
    try {
      await client.apiCall.invoke({
        url: `/api/v1/groups/${groupId}/shooting-order-mode`,
        method: 'PUT',
        data: { shooting_order_mode: selectedModes[groupId] },
        options: {
          headers: { Authorization: `Bearer ${token}` },
        },
      });
      setGroups((prev) =>
        prev.map((g) =>
          g.group.id === groupId
            ? { ...g, group: { ...g.group, shooting_order_mode: selectedModes[groupId] } }
            : g
        )
      );
      fetchShootingOrder(groupId);
    } catch {
      setError('Failed to update shooting order mode.');
    } finally {
      setChangingModeId(null);
    }
  };

  const handleCopyInviteCode = async (groupId: number, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedGroupId(groupId);
      setTimeout(() => setCopiedGroupId(null), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedGroupId(groupId);
      setTimeout(() => setCopiedGroupId(null), 2000);
    }
  };

  const isTournamentStarted = (tournament: TournamentInfo): boolean => {
    if (!tournament.date || !tournament.start_time) return false;
    const dateTimeStr = `${tournament.date}T${tournament.start_time}:00`;
    const deadline = new Date(dateTimeStr);
    if (isNaN(deadline.getTime())) return false;
    return new Date() >= deadline;
  };

  const toggleExpand = (groupId: number) => {
    setExpandedGroupId((prev) => (prev === groupId ? null : groupId));
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Loader2 className="h-8 w-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-slate-400 mt-4">Loading your groups...</p>
        </div>
      </Layout>
    );
  }

  if (groups.length === 0) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Users className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">No Groups Found</h2>
          <p className="text-slate-400 text-sm">
            You&apos;re not currently in any groups. Register for a tournament and start or join a group.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <Users className="h-6 w-6 text-emerald-400" />
          My Groups
        </h1>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-6 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {groups.map((entry) => {
            const { group, members, tournament } = entry;
            const isExpanded = expandedGroupId === group.id;
            const isCreator = String(group.creator_id) === String(user?.id);
            const isLeaving = leavingGroupId === group.id;
            const isLocked = isTournamentStarted(tournament);

            return (
              <div
                key={group.id}
                className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden"
              >
                {/* Group Header - always visible, clickable to expand */}
                <button
                  type="button"
                  onClick={() => toggleExpand(group.id)}
                  className="w-full p-5 flex items-start justify-between text-left hover:bg-slate-700/20 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-white truncate">
                        {group.group_name || `Group ${group.group_number || group.id}`}
                      </h2>
                      {isLocked && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
                          <Lock className="h-3 w-3" />
                          Locked
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-emerald-400 font-medium mt-0.5 truncate">
                      {tournament.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
                      {tournament.date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {tournament.date}
                        </span>
                      )}
                      {tournament.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {tournament.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {members.length} members
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {group.group_number && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                        #{group.group_number}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-slate-700/50 px-5 pb-5">
                    {/* Invite Code Section */}
                    {group.invite_code && (
                      <div className="mt-4 mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-1">Invite Code</p>
                            <p className="text-2xl font-mono font-bold text-white tracking-widest">
                              {group.invite_code}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyInviteCode(group.id, group.invite_code!)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm font-medium transition-colors"
                          >
                            {copiedGroupId === group.id ? (
                              <>
                                <Check className="h-4 w-4" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          Share this code with others so they can join your group
                        </p>
                      </div>
                    )}

                    {/* Group Meta */}
                    <div className="flex flex-wrap gap-3 text-sm mb-5">
                      <span className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300">
                        Mode: <span className="text-white font-medium">{(group.shooting_order_mode === 'round_robin' ? 'Sequential' : group.shooting_order_mode === 'random' ? 'Random' : 'Sequential')}</span>
                      </span>
                      <span className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300">
                        Members: <span className="text-white font-medium">{members.length}</span>
                      </span>
                      {group.visibility && (
                        <span className={`px-3 py-1.5 rounded-lg ${
                          group.visibility === 'public'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {group.visibility === 'public' ? 'Public' : 'Private'}
                        </span>
                      )}
                    </div>

                    {/* Members List */}
                    <div className="rounded-lg border border-slate-700/30 bg-slate-900/30 p-4 mb-5">
                      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Members</h3>
                      <div className="divide-y divide-slate-700/30">
                        {members.map((member, idx) => (
                          <div key={member.id} className="flex items-center gap-3 py-2.5">
                            <span className="h-7 w-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xs font-bold text-emerald-400">
                              {idx + 1}
                            </span>
                            <span className="text-sm text-white">
                              {member.first_name} {member.last_name}
                            </span>
                            {String(member.user_id) === String(group.creator_id) && (
                              <span className="text-xs text-amber-400 ml-auto">Creator</span>
                            )}
                            {String(member.user_id) === String(user?.id) && String(member.user_id) !== String(group.creator_id) && (
                              <span className="text-xs text-emerald-400 ml-auto">You</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Shooting Order */}
                    <div className="rounded-lg border border-slate-700/30 bg-slate-900/30 p-4 mb-5">
                      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Shooting Order</h3>
                      <div className="flex items-center gap-3 mb-4">
                        <label className="text-sm text-slate-400">Target #</label>
                        <input
                          type="number"
                          min={1}
                          value={targetNumbers[group.id] || 1}
                          onChange={(e) =>
                            setTargetNumbers((prev) => ({
                              ...prev,
                              [group.id]: Math.max(1, Number(e.target.value) || 1),
                            }))
                          }
                          className="w-20 h-9 px-3 rounded-lg border border-slate-600 bg-slate-800 text-white text-center text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchShootingOrder(group.id)}
                          className="text-slate-400 hover:text-white"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>

                      {loadingOrders[group.id] ? (
                        <div className="flex items-center gap-2 py-3">
                          <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
                          <span className="text-slate-400 text-sm">Loading order...</span>
                        </div>
                      ) : (shootingOrders[group.id] || []).length > 0 ? (
                        <div className="space-y-2">
                          {(shootingOrders[group.id] || []).map((entry) => (
                            <div key={entry.archer_id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-700/30">
                              <span className="h-6 w-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400">
                                {entry.order}
                              </span>
                              <span className="text-sm text-white">{entry.first_name} {entry.last_name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 text-sm">No shooting order available for this target.</p>
                      )}
                    </div>

                    {/* Actions - hidden when locked */}
                    {!isLocked && (
                      <>
                        {/* Change Shooting Order Mode (Creator only) */}
                        {isCreator && (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 mb-5">
                            <h3 className="text-sm font-semibold text-amber-400 mb-3">Change Shooting Order Mode</h3>
                            <div className="flex items-center gap-3">
                              <select
                                value={selectedModes[group.id] || 'sequential'}
                                onChange={(e) =>
                                  setSelectedModes((prev) => ({ ...prev, [group.id]: e.target.value }))
                                }
                                className="flex-1 h-10 px-3 rounded-lg border border-slate-600 bg-slate-800 text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                              >
                                <option value="sequential">Sequential</option>
                                <option value="random">Random</option>
                              </select>
                              <Button
                                type="button"
                                onClick={() => handleChangeMode(group.id)}
                                disabled={changingModeId === group.id || selectedModes[group.id] === group.shooting_order_mode}
                                className="bg-amber-500 hover:bg-amber-600 text-white text-sm disabled:opacity-50"
                              >
                                {changingModeId === group.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update'}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="pt-4 border-t border-slate-700/50 flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleLeaveGroup(group.tournament_id, group.id)}
                            disabled={isLeaving}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            {isLeaving ? (
                              <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Leaving...
                              </span>
                            ) : (
                              <span className="flex items-center gap-2">
                                <LogOut className="h-4 w-4" /> Leave Group
                              </span>
                            )}
                          </Button>

                          {/* Dissolve Group (Creator only) */}
                          {isCreator && (
                            <>
                              {confirmDissolveId === group.id ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-red-400">Are you sure?</span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleDissolveGroup(group.id)}
                                    disabled={dissolvingGroupId === group.id}
                                    className="bg-red-500 hover:bg-red-600 text-white text-xs"
                                  >
                                    {dissolvingGroupId === group.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      'Yes, Dissolve'
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmDissolveId(null)}
                                    className="text-slate-400 hover:text-white text-xs"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => setConfirmDissolveId(group.id)}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                >
                                  <span className="flex items-center gap-2">
                                    <Trash2 className="h-4 w-4" /> Dissolve Group
                                  </span>
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </>
                    )}

                    {/* Locked state message */}
                    {isLocked && (
                      <div className="pt-4 border-t border-slate-700/50">
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
                          <Lock className="h-4 w-4 text-red-400 flex-shrink-0" />
                          <p className="text-sm text-red-400">
                            Group actions are locked — tournament has started
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}