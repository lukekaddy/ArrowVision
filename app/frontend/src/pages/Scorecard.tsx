import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ClipboardList, Target, ChevronLeft, ChevronRight, CheckCircle,
  Play, X, ArrowLeft, Users, Crosshair, Loader2
} from 'lucide-react';

interface CourseConfig {
  course: number;
  name?: string;
  targets: number;
}

interface Tournament {
  id: number;
  name: string;
  num_targets: number;
  status: string;
  courses?: string;
}

interface Archer {
  id: number;
  archer_name: string;
  first_name?: string;
  last_name?: string;
  group_number: number | null;
  user_id?: string;
}

interface ScoringTemplate {
  template_name: string;
  score_values: number[];
}

interface GroupMember {
  id: number;
  archer_name: string;
  first_name?: string;
  last_name?: string;
  user_id?: string;
}

interface GroupInfo {
  id: number;
  group_name?: string;
  group_number?: number;
  shooting_order_mode?: string;
  tournament_id: number;
}

interface MyGroupEntry {
  group: GroupInfo;
  members: GroupMember[];
  tournament: { id: number; name: string; date?: string | null; location?: string | null };
}

interface ShootingOrderEntry {
  position: number;
  archer_id: number;
  archer_name: string;
  first_name?: string;
  last_name?: string;
}

type ReplayModalState = 'idle' | 'loading' | 'ready' | 'error';

export default function Scorecard() {
  const { user, token, login } = useAuth();
  const client = getClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [coursesConfig, setCoursesConfig] = useState<CourseConfig[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseConfig | null>(null);
  const [archers, setArchers] = useState<Archer[]>([]);
  const [selectedArcher, setSelectedArcher] = useState<Archer | null>(null);
  const [scoringTemplate, setScoringTemplate] = useState<ScoringTemplate | null>(null);

  // Bowling alley mode state
  const [bowlingMode, setBowlingMode] = useState(false);
  const [groupEntry, setGroupEntry] = useState<MyGroupEntry | null>(null);
  const [shootingOrder, setShootingOrder] = useState<ShootingOrderEntry[]>([]);
  const [currentTarget, setCurrentTarget] = useState(1);
  const [allScores, setAllScores] = useState<Record<number, Record<number, number>>>({});
  const [visibleTargetStart, setVisibleTargetStart] = useState(1);
  const [loadingGroup, setLoadingGroup] = useState(false);

  // Replay modal
  const [replayMap, setReplayMap] = useState<Record<number, string>>({});
  const [replayModalUrl, setReplayModalUrl] = useState<string | null>(null);
  const [replayModalTarget, setReplayModalTarget] = useState<number | null>(null);
  const [replayModalState, setReplayModalState] = useState<ReplayModalState>('idle');
  const [replayError, setReplayError] = useState<string | null>(null);

  const restoredFromParams = useRef(false);
  const [directModeLoading, setDirectModeLoading] = useState(false);

  // Number of target columns visible at once on the scoreboard
  const VISIBLE_TARGETS = 5;

  const directMode = useMemo(() => {
    const paramTournamentId = searchParams.get('tournamentId');
    const paramArcherId = searchParams.get('archerId');
    const paramShowTargets = searchParams.get('showTargets');
    return !!(paramTournamentId && paramArcherId && paramShowTargets === 'true');
  }, [searchParams]);

  const maxTargets = selectedCourse?.targets || selectedTournament?.num_targets || 10;

  // Storage key for current target persistence
  const getCurrentTargetKey = useCallback(() => {
    if (!selectedTournament) return null;
    const courseNum = selectedCourse?.course || 1;
    return `bowling_current_target_${selectedTournament.id}_${courseNum}`;
  }, [selectedTournament, selectedCourse]);

  // Load all scores for group members from localStorage
  const loadAllScores = useCallback(() => {
    if (!selectedTournament || !groupEntry) {
      setAllScores({});
      return;
    }
    const courseNum = selectedCourse?.course || 1;
    const scoreMap: Record<number, Record<number, number>> = {};

    for (const member of groupEntry.members) {
      const key = `scores_${selectedTournament.id}_${member.id}_${courseNum}`;
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          scoreMap[member.id] = JSON.parse(stored);
        } else {
          scoreMap[member.id] = {};
        }
      } catch {
        scoreMap[member.id] = {};
      }
    }
    setAllScores(scoreMap);
  }, [selectedTournament, selectedCourse, groupEntry]);

  // Load current target from localStorage
  const loadCurrentTarget = useCallback(() => {
    const key = getCurrentTargetKey();
    if (!key) return;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const val = parseInt(stored);
        if (!isNaN(val) && val >= 1 && val <= maxTargets) {
          setCurrentTarget(val);
          // Center the visible window around the current target
          const start = Math.max(1, val - Math.floor(VISIBLE_TARGETS / 2));
          setVisibleTargetStart(Math.min(start, Math.max(1, maxTargets - VISIBLE_TARGETS + 1)));
          return;
        }
      }
    } catch { /* ignore */ }
    setCurrentTarget(1);
    setVisibleTargetStart(1);
  }, [getCurrentTargetKey, maxTargets]);

  // Save current target to localStorage
  const saveCurrentTarget = useCallback((target: number) => {
    const key = getCurrentTargetKey();
    if (key) {
      localStorage.setItem(key, target.toString());
    }
  }, [getCurrentTargetKey]);

  // Fetch shooting order for current target
  const fetchShootingOrder = useCallback(async (groupId: number, targetNum: number) => {
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/groups/${groupId}/shooting-order?target_number=${targetNum}`,
        method: 'GET',
        data: {},
        ...(token ? { options: { headers: { Authorization: `Bearer ${token}` } } } : {}),
      });
      const data = res?.data || {};
      const orderList = Array.isArray(data) ? data : (data.order || []);
      setShootingOrder(orderList.map((entry: ShootingOrderEntry & { order?: number }) => ({
        position: entry.position ?? entry.order ?? 0,
        archer_id: entry.archer_id,
        archer_name: entry.archer_name || `${entry.first_name || ''} ${entry.last_name || ''}`.trim(),
        first_name: entry.first_name,
        last_name: entry.last_name,
      })));
    } catch {
      setShootingOrder([]);
    }
  }, [client, token]);

  // Fetch group info for current user and tournament
  const fetchGroupForTournament = useCallback(async (tournamentId: number) => {
    if (!token) return null;
    setLoadingGroup(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/groups/my-groups',
        method: 'GET',
        data: {},
        options: { headers: { Authorization: `Bearer ${token}` } },
      });
      const rawData = res?.data?.items || res?.data || [];
      const groupEntries: MyGroupEntry[] = Array.isArray(rawData) ? rawData : [];
      const match = groupEntries.find(e => e.tournament.id === tournamentId || e.group.tournament_id === tournamentId);
      if (match) {
        setGroupEntry(match);
        return match;
      }
      setGroupEntry(null);
      return null;
    } catch {
      setGroupEntry(null);
      return null;
    } finally {
      setLoadingGroup(false);
    }
  }, [client, token]);

  // Check replays for current archer
  const checkReplays = useCallback(async () => {
    if (!selectedTournament || !selectedArcher) {
      setReplayMap({});
      return;
    }
    const courseNum = selectedCourse?.course || 1;
    const targets = maxTargets;
    const map: Record<number, string> = {};

    for (let t = 1; t <= targets; t++) {
      try {
        const res = await client.apiCall.invoke({
          url: '/api/v1/replays/find',
          method: 'POST',
          data: {
            tournament_id: selectedTournament.id,
            archer_id: selectedArcher.id,
            course_number: courseNum,
            target_number: t,
          },
        });
        if (res?.data?.object_key) {
          map[t] = res.data.object_key;
        }
      } catch { /* ignore */ }
    }
    setReplayMap(map);
  }, [selectedTournament, selectedArcher, selectedCourse, maxTargets, client]);

  const openReplayModal = async (targetNum: number) => {
    const objectKey = replayMap[targetNum];
    if (!objectKey) return;
    setReplayModalTarget(targetNum);
    setReplayModalState('loading');
    setReplayError(null);
    setReplayModalUrl(null);
    try {
      const streamUrl = `/api/v1/replays/stream?bucket_name=arrow-replays&object_key=${encodeURIComponent(objectKey)}&t=${Date.now()}`;
      setReplayModalUrl(streamUrl);
      setReplayModalState('ready');
    } catch {
      setReplayModalState('error');
      setReplayError('Failed to load replay video.');
    }
  };

  // Load scores when group changes
  useEffect(() => {
    if (bowlingMode) {
      loadAllScores();
    }
  }, [bowlingMode, loadAllScores]);

  // Reload scores on focus
  useEffect(() => {
    const handleFocus = () => {
      if (bowlingMode) {
        loadAllScores();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [bowlingMode, loadAllScores]);

  // Fetch shooting order when current target changes
  useEffect(() => {
    if (bowlingMode && groupEntry) {
      fetchShootingOrder(groupEntry.group.id, currentTarget);
    }
  }, [bowlingMode, groupEntry, currentTarget, fetchShootingOrder]);

  // Load current target from storage when entering bowling mode
  useEffect(() => {
    if (bowlingMode) {
      loadCurrentTarget();
    }
  }, [bowlingMode, loadCurrentTarget]);

  // Check replays in bowling mode
  useEffect(() => {
    if (bowlingMode && selectedArcher) {
      checkReplays();
    }
  }, [bowlingMode, selectedArcher, checkReplays]);

  // Initial data fetch
  useEffect(() => {
    const fetchTournaments = async () => {
      const paramTournamentId = searchParams.get('tournamentId');
      const paramArcherId = searchParams.get('archerId');
      const paramShowTargets = searchParams.get('showTargets');
      const isDirectEntry = !!(paramTournamentId && paramArcherId && paramShowTargets === 'true');

      if (isDirectEntry && !restoredFromParams.current) {
        restoredFromParams.current = true;
        setDirectModeLoading(true);

        try {
          const res = await client.apiCall.invoke({ url: '/api/v1/tournament/public-list', method: 'GET', data: {} });
          const items = res?.data?.items || [];
          setTournaments(items);

          const t = items.find((tour: Tournament) => tour.id === parseInt(paramTournamentId));
          if (t) {
            setSelectedTournament(t);
            let parsed: CourseConfig[] = [];
            if (t.courses) {
              try { parsed = JSON.parse(t.courses); } catch { parsed = []; }
            }
            setCoursesConfig(parsed);
            const paramCourseNumber = searchParams.get('courseNumber');
            if (paramCourseNumber) {
              const c = parsed.find((cc: CourseConfig) => cc.course === parseInt(paramCourseNumber));
              setSelectedCourse(c || (parsed.length === 1 ? parsed[0] : null));
            } else if (parsed.length === 1) {
              setSelectedCourse(parsed[0]);
            }

            // Fetch archers
            try {
              const archerRes = await client.apiCall.invoke({ url: `/api/v1/tournament/archers/${paramTournamentId}`, method: 'GET', data: {} });
              const archerList = archerRes?.data || [];
              setArchers(archerList);
              const a = archerList.find((ar: Archer) => ar.id === parseInt(paramArcherId));
              if (a) {
                setSelectedArcher(a);
              }
            } catch { setArchers([]); }

            // Fetch scoring template
            try {
              const templateRes = await client.apiCall.invoke({ url: `/api/v1/tournament/scorecard-template/${paramTournamentId}`, method: 'GET', data: {} });
              if (templateRes?.data) setScoringTemplate(templateRes.data);
            } catch { /* ignore */ }

            // Fetch group and enter bowling mode
            const group = await fetchGroupForTournament(parseInt(paramTournamentId));
            if (group) {
              setBowlingMode(true);
            } else {
              setBowlingMode(true); // Still show bowling mode even without group (solo mode)
            }
          }
          setSearchParams({}, { replace: true });
        } catch { setTournaments([]); }
        finally { setDirectModeLoading(false); }
      } else if (!restoredFromParams.current) {
        try {
          const res = await client.apiCall.invoke({ url: '/api/v1/tournament/public-list', method: 'GET', data: {} });
          setTournaments(res?.data?.items || []);
        } catch { setTournaments([]); }
      }
    };
    fetchTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTournament = async (id: string) => {
    const t = tournaments.find((t) => t.id === parseInt(id));
    if (!t) return;
    setSelectedTournament(t);
    setSelectedArcher(null);
    setSelectedCourse(null);
    setBowlingMode(false);
    setGroupEntry(null);

    let parsed: CourseConfig[] = [];
    if (t.courses) {
      try { parsed = JSON.parse(t.courses); } catch { parsed = []; }
    }
    setCoursesConfig(parsed);
    if (parsed.length === 1) setSelectedCourse(parsed[0]);

    try {
      const res = await client.apiCall.invoke({ url: `/api/v1/tournament/archers/${id}`, method: 'GET', data: {} });
      setArchers(res?.data || []);
    } catch { setArchers([]); }

    try {
      const templateRes = await client.apiCall.invoke({ url: `/api/v1/tournament/scorecard-template/${id}`, method: 'GET', data: {} });
      if (templateRes?.data) setScoringTemplate(templateRes.data);
      else setScoringTemplate(null);
    } catch { setScoringTemplate(null); }
  };

  const selectCourse = (courseNum: string) => {
    const c = coursesConfig.find((c) => c.course === parseInt(courseNum));
    setSelectedCourse(c || null);
    setBowlingMode(false);
  };

  const enterBowlingMode = async () => {
    if (!selectedTournament || !selectedArcher) return;
    await fetchGroupForTournament(selectedTournament.id);
    setBowlingMode(true);
  };

  const handleTargetTap = (archerId: number, targetNum: number) => {
    if (!selectedTournament) return;
    // Only allow the logged-in user to score their own targets
    const currentUserArcher = archers.find(a => a.user_id === String(user?.id));
    if (!currentUserArcher || currentUserArcher.id !== archerId) return;

    const params = new URLSearchParams({
      tournamentId: selectedTournament.id.toString(),
      courseNumber: (selectedCourse?.course || 1).toString(),
      archerId: archerId.toString(),
      archerName: currentUserArcher.archer_name,
      targetNumber: targetNum.toString(),
      maxTargets: maxTargets.toString(),
    });
    if (scoringTemplate?.score_values) {
      params.set('scoreValues', JSON.stringify(scoringTemplate.score_values));
    }
    navigate(`/smart-score?${params.toString()}`);
  };

  const advanceTarget = () => {
    if (currentTarget < maxTargets) {
      const next = currentTarget + 1;
      setCurrentTarget(next);
      saveCurrentTarget(next);
      // Auto-scroll visible window
      if (next > visibleTargetStart + VISIBLE_TARGETS - 1) {
        setVisibleTargetStart(Math.min(next - VISIBLE_TARGETS + 1, maxTargets - VISIBLE_TARGETS + 1));
      }
    }
  };

  const prevTarget = () => {
    if (currentTarget > 1) {
      const prev = currentTarget - 1;
      setCurrentTarget(prev);
      saveCurrentTarget(prev);
      if (prev < visibleTargetStart) {
        setVisibleTargetStart(Math.max(1, prev));
      }
    }
  };

  const scrollTargetsLeft = () => {
    setVisibleTargetStart(Math.max(1, visibleTargetStart - 1));
  };

  const scrollTargetsRight = () => {
    setVisibleTargetStart(Math.min(maxTargets - VISIBLE_TARGETS + 1, visibleTargetStart + 1));
  };

  // Determine current user's archer record
  const currentUserArcher = archers.find(a => a.user_id === String(user?.id));

  // Get display name for an archer
  const getDisplayName = (member: GroupMember) => {
    if (member.first_name && member.last_name) {
      return `${member.first_name} ${member.last_name.charAt(0)}.`;
    }
    return member.archer_name || 'Unknown';
  };

  // Get total score for an archer
  const getTotalScore = (archerId: number) => {
    const scores = allScores[archerId] || {};
    return Object.values(scores).reduce((sum, val) => sum + val, 0);
  };

  // Get targets scored count
  const getTargetsScored = (archerId: number) => {
    const scores = allScores[archerId] || {};
    return Object.keys(scores).length;
  };

  // Determine active shooter and next shooter from shooting order
  const activeShooter = shootingOrder.length > 0 ? shootingOrder[0] : null;
  const nextShooter = shootingOrder.length > 1 ? shootingOrder[1] : null;

  // Visible target numbers for the scoreboard grid
  const visibleTargets = Array.from(
    { length: Math.min(VISIBLE_TARGETS, maxTargets) },
    (_, i) => visibleTargetStart + i
  ).filter(t => t <= maxTargets);

  if (!user) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <ClipboardList className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Sign In Required</h2>
          <Button onClick={() => login('', '')} className="bg-emerald-500 hover:bg-emerald-600 text-white">Sign In</Button>
        </div>
      </Layout>
    );
  }

  // Bowling Alley Scoreboard Mode
  if (bowlingMode && selectedTournament) {
    const members = groupEntry?.members || (selectedArcher ? [selectedArcher as GroupMember] : []);

    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-4">
          {/* Scoreboard Header */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-t-2xl border border-slate-700/60 border-b-0 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (restoredFromParams.current) navigate('/archer');
                    else setBowlingMode(false);
                  }}
                  className="text-slate-400 hover:text-white p-1.5"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-white leading-tight">
                    {selectedTournament.name}
                  </h1>
                  <p className="text-xs text-emerald-400 font-medium">
                    {selectedCourse?.name || `Course ${selectedCourse?.course || 1}`}
                    {scoringTemplate && <span className="text-slate-500 ml-2">· {scoringTemplate.template_name}</span>}
                  </p>
                </div>
              </div>
              {groupEntry && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                  <Users className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-400">
                    {groupEntry.group.group_name || `Group ${groupEntry.group.group_number}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Current Target Indicator */}
          <div className="bg-gradient-to-r from-emerald-900/40 via-emerald-800/30 to-emerald-900/40 border-x border-slate-700/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <button
                onClick={prevTarget}
                disabled={currentTarget <= 1}
                className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-600/50 flex items-center justify-center text-slate-300 hover:text-white hover:border-emerald-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="text-center">
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-400/80 font-semibold mb-0.5">Current Target</p>
                <div className="flex items-center gap-2">
                  <Target className="h-6 w-6 text-emerald-400" />
                  <span className="text-4xl sm:text-5xl font-black text-white tabular-nums">
                    {currentTarget}
                  </span>
                  <span className="text-lg text-slate-500 font-medium">/ {maxTargets}</span>
                </div>
              </div>

              <button
                onClick={advanceTarget}
                disabled={currentTarget >= maxTargets}
                className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/30 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Shooting Status */}
            {shootingOrder.length > 0 && (
              <div className="flex items-center justify-center gap-4 mt-3">
                {activeShooter && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 animate-pulse">
                    <Crosshair className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                      Shooting: {activeShooter.first_name || activeShooter.archer_name}
                    </span>
                  </div>
                )}
                {nextShooter && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                    <span className="text-xs font-medium text-amber-400/80">
                      Next: {nextShooter.first_name || nextShooter.archer_name}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scoreboard Grid */}
          <div className="bg-slate-900/95 border-x border-slate-700/60 overflow-hidden">
            {loadingGroup ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  {/* Header Row - Target Numbers */}
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="sticky left-0 z-10 bg-slate-900 px-3 py-2.5 text-left min-w-[120px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Archer</span>
                          <button
                            onClick={scrollTargetsLeft}
                            disabled={visibleTargetStart <= 1}
                            className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-white disabled:opacity-20 transition-colors"
                          >
                            <ChevronLeft className="h-3 w-3" />
                          </button>
                        </div>
                      </th>
                      {visibleTargets.map(targetNum => (
                        <th
                          key={targetNum}
                          className={`px-1 py-2.5 text-center min-w-[48px] transition-colors ${
                            targetNum === currentTarget
                              ? 'bg-emerald-500/15 border-x border-emerald-500/30'
                              : ''
                          }`}
                        >
                          <span className={`text-xs font-bold tabular-nums ${
                            targetNum === currentTarget ? 'text-emerald-400' : 'text-slate-400'
                          }`}>
                            {targetNum}
                          </span>
                        </th>
                      ))}
                      <th className="px-2 py-2.5 text-center min-w-[52px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Total</span>
                          <button
                            onClick={scrollTargetsRight}
                            disabled={visibleTargetStart >= maxTargets - VISIBLE_TARGETS + 1}
                            className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-white disabled:opacity-20 transition-colors"
                          >
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      </th>
                    </tr>
                  </thead>

                  {/* Archer Rows */}
                  <tbody>
                    {members.map((member, idx) => {
                      const isActive = activeShooter?.archer_id === member.id;
                      const isNext = nextShooter?.archer_id === member.id;
                      const isCurrentUser = String(member.user_id) === String(user?.id);
                      const memberScores = allScores[member.id] || {};
                      const total = getTotalScore(member.id);

                      return (
                        <tr
                          key={member.id}
                          className={`border-b border-slate-800/50 transition-all ${
                            isActive
                              ? 'bg-emerald-500/10 shadow-[inset_0_0_20px_rgba(16,185,129,0.1)]'
                              : isNext
                              ? 'bg-amber-500/5'
                              : idx % 2 === 0
                              ? 'bg-slate-900/50'
                              : 'bg-slate-800/20'
                          }`}
                        >
                          {/* Archer Name Cell */}
                          <td className={`sticky left-0 z-10 px-3 py-3 ${
                            isActive ? 'bg-emerald-950/80' : isNext ? 'bg-amber-950/30' : 'bg-slate-900'
                          }`}>
                            <div className="flex items-center gap-2">
                              {/* Status indicator */}
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isActive
                                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse'
                                  : isNext
                                  ? 'bg-amber-400'
                                  : 'bg-slate-600'
                              }`} />
                              <div className="min-w-0">
                                <p className={`text-sm font-semibold truncate ${
                                  isActive ? 'text-emerald-300' : isCurrentUser ? 'text-white' : 'text-slate-300'
                                }`}>
                                  {getDisplayName(member)}
                                  {isCurrentUser && <span className="text-[10px] text-emerald-500 ml-1">(You)</span>}
                                </p>
                                {isActive && (
                                  <span className="text-[9px] uppercase tracking-widest text-emerald-400 font-bold">
                                    Shooting Now
                                  </span>
                                )}
                                {isNext && !isActive && (
                                  <span className="text-[9px] uppercase tracking-widest text-amber-400/80 font-medium">
                                    Up Next
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Score Cells */}
                          {visibleTargets.map(targetNum => {
                            const score = memberScores[targetNum];
                            const hasScore = score !== undefined;
                            const isCurrent = targetNum === currentTarget;
                            const canTap = isCurrentUser && !hasScore;

                            return (
                              <td
                                key={targetNum}
                                className={`px-1 py-2 text-center transition-colors ${
                                  isCurrent ? 'bg-emerald-500/10 border-x border-emerald-500/20' : ''
                                }`}
                              >
                                <button
                                  onClick={() => canTap ? handleTargetTap(member.id, targetNum) : undefined}
                                  disabled={!canTap}
                                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center mx-auto text-sm font-bold transition-all ${
                                    hasScore
                                      ? score === 0
                                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : canTap && isCurrent
                                      ? 'bg-emerald-500/10 border-2 border-dashed border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-400 cursor-pointer active:scale-95'
                                      : canTap
                                      ? 'bg-slate-800/50 border border-slate-700/50 text-slate-600 hover:border-emerald-500/30 hover:text-emerald-400 cursor-pointer'
                                      : 'bg-slate-800/30 border border-slate-800/50 text-slate-700'
                                  }`}
                                >
                                  {hasScore ? (
                                    score === 0 ? 'M' : score
                                  ) : (
                                    canTap && isCurrent ? <Crosshair className="h-4 w-4" /> : '·'
                                  )}
                                </button>
                              </td>
                            );
                          })}

                          {/* Total Score Cell */}
                          <td className="px-2 py-2 text-center">
                            <div className={`inline-flex flex-col items-center px-2 py-1 rounded-lg ${
                              total > 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-800/30'
                            }`}>
                              <span className={`text-lg font-black tabular-nums ${
                                total > 0 ? 'text-amber-400' : 'text-slate-600'
                              }`}>
                                {total}
                              </span>
                              <span className="text-[9px] text-slate-500">
                                {getTargetsScored(member.id)}/{maxTargets}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bottom Stats Bar */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-b-2xl border border-slate-700/60 border-t-0 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Targets Left</p>
                  <p className="text-lg font-bold text-white tabular-nums">
                    {maxTargets - currentTarget + 1}
                  </p>
                </div>
                <div className="w-px h-8 bg-slate-700/50" />
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Your Score</p>
                  <p className="text-lg font-bold text-emerald-400 tabular-nums">
                    {currentUserArcher ? getTotalScore(currentUserArcher.id) : 0}
                  </p>
                </div>
              </div>

              {/* Advance Target Button */}
              <Button
                onClick={advanceTarget}
                disabled={currentTarget >= maxTargets}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-40"
              >
                Next Target
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Replay indicators for current user */}
            {currentUserArcher && replayMap[currentTarget] && (
              <div className="mt-3 pt-3 border-t border-slate-700/50">
                <button
                  onClick={() => openReplayModal(currentTarget)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors w-full justify-center"
                >
                  <Play className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-medium text-amber-400">View Target {currentTarget} Replay</span>
                </button>
              </div>
            )}
          </div>

          {/* No Group Message */}
          {!groupEntry && !loadingGroup && (
            <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 text-center">
              <Users className="h-8 w-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                You&apos;re scoring solo. Join a group to see all members on the scoreboard!
              </p>
              <Button
                onClick={() => navigate('/archer/group')}
                variant="ghost"
                className="mt-2 text-emerald-400 hover:text-emerald-300 text-sm"
              >
                View My Groups
              </Button>
            </div>
          )}
        </div>

        {/* Replay Modal */}
        {(replayModalState === 'loading' || replayModalState === 'ready' || replayModalState === 'error') && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <h3 className="text-white font-semibold">Target {replayModalTarget} Replay</h3>
                <button
                  onClick={() => { setReplayModalUrl(null); setReplayModalTarget(null); setReplayModalState('idle'); setReplayError(null); }}
                  className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
                >
                  <X className="h-4 w-4 text-slate-300" />
                </button>
              </div>
              <div className="p-4">
                {replayModalState === 'loading' && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-slate-400 text-sm">Loading replay...</p>
                  </div>
                )}
                {replayModalState === 'error' && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <X className="h-10 w-10 text-red-400 mb-4" />
                    <p className="text-red-400 text-sm text-center mb-4">{replayError || 'Failed to load replay.'}</p>
                    <Button
                      onClick={() => { if (replayModalTarget) openReplayModal(replayModalTarget); }}
                      variant="outline"
                      size="sm"
                      className="border-slate-600 text-slate-300 hover:text-white hover:border-emerald-500"
                    >
                      Retry
                    </Button>
                  </div>
                )}
                {replayModalState === 'ready' && replayModalUrl && (
                  <video
                    key={`replay-${replayModalTarget}-${replayModalUrl}`}
                    src={replayModalUrl}
                    controls
                    autoPlay
                    playsInline
                    preload="auto"
                    className="w-full rounded-lg"
                    onError={() => {
                      setReplayModalState('error');
                      setReplayError('Video playback failed. The clip may still be processing.');
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </Layout>
    );
  }

  // Filter Selection Mode (before entering bowling mode)
  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-emerald-400" /> Scorecard
        </h1>

        {/* Direct mode loading */}
        {(directMode || directModeLoading) && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-400 text-sm">Loading scorecard...</p>
          </div>
        )}

        {/* Filter UI */}
        {!directMode && !directModeLoading && (
          <>
            {/* Tournament Select */}
            <div className="mb-4">
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
                {/* Course Select */}
                {coursesConfig.length > 1 && (
                  <div className="mb-4">
                    <Select onValueChange={selectCourse}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-12">
                        <SelectValue placeholder="Select Course" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {coursesConfig.map((c) => (
                          <SelectItem key={c.course} value={c.course.toString()} className="text-white">
                            {c.name || `Course ${c.course}`} ({c.targets} targets)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Archer Select */}
                <div className="mb-6">
                  <Select onValueChange={(v) => { setSelectedArcher(archers.find((a) => a.id === parseInt(v)) || null); }}>
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

                {/* Enter Scoreboard Button */}
                {selectedArcher && (coursesConfig.length <= 1 || selectedCourse) && (
                  <button
                    onClick={enterBowlingMode}
                    className="w-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-2 border-emerald-500/50 rounded-2xl p-8 text-center transition-all hover:border-emerald-400 hover:from-emerald-500/30 hover:to-emerald-600/20 active:scale-[0.98] group"
                  >
                    <div className="relative">
                      <Target className="h-14 w-14 text-emerald-400 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                      <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-white" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-white mb-2">Open Live Scoreboard</p>
                    <p className="text-slate-400 text-sm mb-1">
                      {selectedArcher.archer_name} · {selectedCourse?.name || `Course ${selectedCourse?.course || 1}`}
                    </p>
                    <p className="text-emerald-400/80 text-xs">Bowling alley style · Group scoring</p>
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}