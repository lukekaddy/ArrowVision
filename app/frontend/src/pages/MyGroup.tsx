import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Users, LogOut, RefreshCw, Loader2, AlertCircle } from 'lucide-react';

interface GroupMember {
  id: number;
  first_name: string;
  last_name: string;
  user_id?: string;
}

interface Group {
  id: number;
  group_name?: string;
  group_number?: number;
  shooting_order_mode?: string;
  members: GroupMember[];
  creator_id?: string;
  tournament_id: number;
}

interface MyTournament {
  id: number;
  tournament_id: number;
  tournament_name?: string;
  name?: string;
  group_number?: number;
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
  const [group, setGroup] = useState<Group | null>(null);
  const [tournament, setTournament] = useState<MyTournament | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leftGroup, setLeftGroup] = useState(false);

  // Shooting order
  const [targetNumber, setTargetNumber] = useState<number>(1);
  const [shootingOrder, setShootingOrder] = useState<ShootingOrderEntry[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(false);

  // Shooting order mode
  const [changingMode, setChangingMode] = useState(false);
  const [selectedMode, setSelectedMode] = useState('');

  const isCreator = group?.creator_id === user?.id;

  useEffect(() => {
    const fetchGroupData = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);

      try {
        // Fetch user's registered tournaments
        const res = await client.apiCall.invoke({
          url: '/api/v1/tournament/my-tournaments',
          method: 'GET',
          data: {},
          options: {
            headers: { Authorization: `Bearer ${token}` },
          },
        });

        const rawTournaments = res?.data?.items || res?.data || [];

        // Response structure is [{tournament: {...}, registration: {...}, score_summary: {...}}, ...]
        // Flatten to get tournament info with the tournament_id
        const tournaments: MyTournament[] = rawTournaments.map((item: { tournament?: Record<string, unknown>; registration?: Record<string, unknown> }) => ({
          id: (item.tournament as Record<string, unknown>)?.id as number,
          tournament_id: (item.registration as Record<string, unknown>)?.tournament_id as number || (item.tournament as Record<string, unknown>)?.id as number,
          tournament_name: (item.tournament as Record<string, unknown>)?.name as string,
          name: (item.tournament as Record<string, unknown>)?.name as string,
          group_number: (item.registration as Record<string, unknown>)?.group_number as number,
        }));

        // Find a tournament where user has a group
        let foundGroup: Group | null = null;
        let foundTournament: MyTournament | null = null;

        for (const t of tournaments) {
          const tournamentId = t.tournament_id || t.id;
          if (!tournamentId) continue;
          try {
            const groupRes = await client.apiCall.invoke({
              url: `/api/v1/groups/tournament/${tournamentId}`,
              method: 'GET',
              data: {},
              options: {
                headers: { Authorization: `Bearer ${token}` },
              },
            });

            const rawGroups = groupRes?.data?.items || groupRes?.data || [];

            // Response structure is [{group: {...}, members: [...]}, ...]
            // We need to flatten it so group metadata is at top level
            const groups: Group[] = rawGroups.map((item: { group?: Record<string, unknown>; members?: GroupMember[] }) => ({
              ...(item.group || {}),
              members: item.members || [],
              tournament_id: tournamentId,
            })) as Group[];

            // Find the group that contains the current user
            const userGroup = groups.find((g) =>
              g.members?.some((m) => m.user_id === user?.id)
            );

            if (userGroup) {
              foundGroup = { ...userGroup, tournament_id: tournamentId };
              foundTournament = t;
              break;
            }
          } catch {
            // Skip this tournament
          }
        }

        if (foundGroup) {
          setGroup(foundGroup);
          setTournament(foundTournament);
          setSelectedMode(foundGroup.shooting_order_mode || 'round_robin');
        }
      } catch {
        setError('Failed to load group information.');
      } finally {
        setLoading(false);
      }
    };

    fetchGroupData();
  }, [token, user?.id]);

  const fetchShootingOrder = async () => {
    if (!group || !group.id || !token) return;
    setLoadingOrder(true);
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/groups/${group.id}/shooting-order?target_number=${targetNumber}`,
        method: 'GET',
        data: {},
        options: {
          headers: { Authorization: `Bearer ${token}` },
        },
      });
      const data = res?.data?.items || res?.data || {};
      // Response structure: {shooting_order_mode, target_number, order: [{position, archer_id, ...}]}
      const orderList = Array.isArray(data) ? data : (data.order || []);
      setShootingOrder(orderList.map((entry: { position?: number; order?: number; archer_id: number; first_name: string; last_name: string; archer_name?: string }) => ({
        archer_id: entry.archer_id,
        first_name: entry.first_name || entry.archer_name || '',
        last_name: entry.last_name || '',
        order: entry.position ?? entry.order ?? 0,
      })));
    } catch {
      setShootingOrder([]);
    } finally {
      setLoadingOrder(false);
    }
  };

  useEffect(() => {
    if (group) {
      fetchShootingOrder();
    }
  }, [group, targetNumber]);

  const handleLeaveGroup = async () => {
    if (!group || !token || !tournament) return;
    setLeaving(true);
    try {
      const tournamentId = tournament.tournament_id || tournament.id;
      await client.apiCall.invoke({
        url: '/api/v1/groups/leave',
        method: 'POST',
        data: { tournament_id: tournamentId },
        options: {
          headers: { Authorization: `Bearer ${token}` },
        },
      });
      setLeftGroup(true);
      setGroup(null);
    } catch {
      setError('Failed to leave group. Please try again.');
    } finally {
      setLeaving(false);
    }
  };

  const handleChangeMode = async () => {
    if (!group || !token || !selectedMode) return;
    setChangingMode(true);
    try {
      await client.apiCall.invoke({
        url: `/api/v1/groups/${group.id}/shooting-order-mode`,
        method: 'PUT',
        data: { shooting_order_mode: selectedMode },
        options: {
          headers: { Authorization: `Bearer ${token}` },
        },
      });
      setGroup((prev) => (prev ? { ...prev, shooting_order_mode: selectedMode } : prev));
      // Refresh shooting order
      fetchShootingOrder();
    } catch {
      setError('Failed to update shooting order mode.');
    } finally {
      setChangingMode(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Loader2 className="h-8 w-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-slate-400 mt-4">Loading group info...</p>
        </div>
      </Layout>
    );
  }

  if (leftGroup) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <LogOut className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">You left the group</h2>
          <p className="text-slate-400 text-sm">You can join or start a new group from the registration page.</p>
        </div>
      </Layout>
    );
  }

  if (!group) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Users className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">No Group Found</h2>
          <p className="text-slate-400 text-sm">
            You&apos;re not currently in a group. Register for a tournament and start or join a group.
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
          My Group
        </h1>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-6 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Group Info Card */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {group.group_name || `Group ${group.group_number || group.id}`}
              </h2>
              {tournament && (
                <p className="text-sm text-slate-400 mt-0.5">
                  {tournament.tournament_name || tournament.name}
                </p>
              )}
            </div>
            {group.group_number && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                #{group.group_number}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300">
              Mode: <span className="text-white font-medium">{group.shooting_order_mode || 'round_robin'}</span>
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300">
              Members: <span className="text-white font-medium">{group.members?.length || 0}</span>
            </span>
          </div>
        </div>

        {/* Members List */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Members</h3>
          <div className="divide-y divide-slate-700/30">
            {group.members?.map((member, idx) => (
              <div key={member.id} className="flex items-center gap-3 py-2.5">
                <span className="h-7 w-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xs font-bold text-emerald-400">
                  {idx + 1}
                </span>
                <span className="text-sm text-white">
                  {member.first_name} {member.last_name}
                </span>
                {member.user_id === group.creator_id && (
                  <span className="text-xs text-amber-400 ml-auto">Creator</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Shooting Order */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Shooting Order</h3>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-slate-400">Target #</label>
            <input
              type="number"
              min={1}
              value={targetNumber}
              onChange={(e) => setTargetNumber(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 h-9 px-3 rounded-lg border border-slate-600 bg-slate-800 text-white text-center text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={fetchShootingOrder}
              className="text-slate-400 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {loadingOrder ? (
            <div className="flex items-center gap-2 py-3">
              <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
              <span className="text-slate-400 text-sm">Loading order...</span>
            </div>
          ) : shootingOrder.length > 0 ? (
            <div className="space-y-2">
              {shootingOrder.map((entry) => (
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

        {/* Change Shooting Order Mode (Creator only) */}
        {isCreator && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 mb-6">
            <h3 className="text-sm font-semibold text-amber-400 mb-3">Change Shooting Order Mode</h3>
            <div className="flex items-center gap-3">
              <select
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value)}
                className="flex-1 h-10 px-3 rounded-lg border border-slate-600 bg-slate-800 text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
              >
                <option value="round_robin">Round Robin</option>
                <option value="sequential">Sequential</option>
                <option value="random">Random</option>
              </select>
              <Button
                type="button"
                onClick={handleChangeMode}
                disabled={changingMode || selectedMode === group.shooting_order_mode}
                className="bg-amber-500 hover:bg-amber-600 text-white text-sm disabled:opacity-50"
              >
                {changingMode ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update'}
              </Button>
            </div>
          </div>
        )}

        {/* Leave Group */}
        <div className="pt-4 border-t border-slate-700/50">
          <Button
            type="button"
            variant="ghost"
            onClick={handleLeaveGroup}
            disabled={leaving}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            {leaving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Leaving...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <LogOut className="h-4 w-4" /> Leave Group
              </span>
            )}
          </Button>
        </div>
      </div>
    </Layout>
  );
}