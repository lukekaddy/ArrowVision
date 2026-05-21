import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardList, Crosshair, Target, ChevronRight, CheckCircle, Play, X } from 'lucide-react';

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
  group_number: number | null;
}

interface ScoringTemplate {
  template_name: string;
  score_values: number[];
}

interface ReplayInfo {
  object_key: string;
}

type ReplayModalState = 'idle' | 'loading' | 'ready' | 'error';

export default function Scorecard() {
  const { user, login } = useAuth();
  const client = getClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [coursesConfig, setCoursesConfig] = useState<CourseConfig[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseConfig | null>(null);
  const [archers, setArchers] = useState<Archer[]>([]);
  const [selectedArcher, setSelectedArcher] = useState<Archer | null>(null);
  const [showTargets, setShowTargets] = useState(false);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [scoringTemplate, setScoringTemplate] = useState<ScoringTemplate | null>(null);
  const [replayMap, setReplayMap] = useState<Record<number, string>>({});
  const [replayModalUrl, setReplayModalUrl] = useState<string | null>(null);
  const [replayModalTarget, setReplayModalTarget] = useState<number | null>(null);
  const [replayModalState, setReplayModalState] = useState<ReplayModalState>('idle');
  const [replayError, setReplayError] = useState<string | null>(null);
  const restoredFromParams = useRef(false);

  const getStorageKey = useCallback(() => {
    if (!selectedTournament || !selectedArcher) return null;
    const courseNum = selectedCourse?.course || 1;
    return `scores_${selectedTournament.id}_${selectedArcher.id}_${courseNum}`;
  }, [selectedTournament, selectedArcher, selectedCourse]);

  const loadScores = useCallback(() => {
    const key = getStorageKey();
    if (!key) {
      setScores({});
      return;
    }
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setScores(JSON.parse(stored));
      } else {
        setScores({});
      }
    } catch {
      setScores({});
    }
  }, [getStorageKey]);

  const checkReplays = useCallback(async () => {
    if (!selectedTournament || !selectedArcher) {
      setReplayMap({});
      return;
    }
    const courseNum = selectedCourse?.course || 1;
    const targets = selectedCourse?.targets || selectedTournament.num_targets || 10;
    const map: Record<number, string> = {};

    console.log('[Scorecard] Checking replays for:', {
      tournament_id: selectedTournament.id,
      archer_id: selectedArcher.id,
      course_number: courseNum,
      targets,
    });

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
        console.log(`[Scorecard] Replay check target ${t}:`, JSON.stringify(res?.data));
        if (res?.data?.object_key) {
          map[t] = res.data.object_key;
        }
      } catch (err) {
        console.error(`[Scorecard] Replay check target ${t} error:`, err);
      }
    }
    console.log('[Scorecard] Final replay map:', map);
    setReplayMap(map);
  }, [selectedTournament, selectedArcher, selectedCourse, client]);

  const openReplayModal = async (targetNum: number) => {
    const objectKey = replayMap[targetNum];
    if (!objectKey) return;

    setReplayModalTarget(targetNum);
    setReplayModalState('loading');
    setReplayError(null);
    setReplayModalUrl(null);

    try {
      console.log('[Replay] Requesting download URL for object_key:', objectKey);
      const res = await client.storage.getDownloadUrl({
        bucket_name: 'arrow-replays',
        object_key: objectKey,
      });
      console.log('[Replay] getDownloadUrl response:', JSON.stringify(res));

      // Try multiple possible response structures
      let url: string | null = null;
      if (res?.data?.download_url) {
        url = res.data.download_url;
      } else if (res?.data?.url) {
        url = res.data.url;
      } else if (typeof res?.data === 'string' && res.data.startsWith('http')) {
        url = res.data;
      } else if (res?.download_url) {
        url = res.download_url;
      }

      console.log('[Replay] Resolved URL:', url);

      if (url) {
        setReplayModalUrl(url);
        setReplayModalState('ready');
      } else {
        // Fallback: try using download() which returns the downloadUrl
        console.log('[Replay] Trying fallback with client.storage.download...');
        try {
          const downloadRes = await client.storage.download({
            bucket_name: 'arrow-replays',
            object_key: objectKey,
          });
          console.log('[Replay] download() response:', JSON.stringify(downloadRes));
          const fallbackUrl = downloadRes?.data?.download_url || downloadRes?.data?.url || (typeof downloadRes?.data === 'string' ? downloadRes.data : null);
          if (fallbackUrl) {
            setReplayModalUrl(fallbackUrl);
            setReplayModalState('ready');
          } else {
            setReplayModalState('error');
            setReplayError('Could not retrieve replay video URL. The response format was unexpected.');
          }
        } catch (fallbackErr) {
          console.error('[Replay] Fallback download() also failed:', fallbackErr);
          setReplayModalState('error');
          setReplayError('Could not retrieve replay video URL.');
        }
      }
    } catch (err) {
      console.error('[Replay] getDownloadUrl error:', err);
      setReplayModalState('error');
      setReplayError('Failed to load replay video. Please try again.');
    }
  };

  // Load scores when filters change
  useEffect(() => {
    loadScores();
  }, [loadScores]);

  // Check for replays when filters change
  useEffect(() => {
    if (showTargets) {
      checkReplays();
    }
  }, [showTargets, checkReplays]);

  // Reload scores when window regains focus (returning from SmartScore)
  useEffect(() => {
    const handleFocus = () => {
      loadScores();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadScores]);

  const totalScore = Object.values(scores).reduce((sum, val) => sum + val, 0);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await client.apiCall.invoke({ url: '/api/v1/tournament/public-list', method: 'GET', data: {} });
        const items = res?.data?.items || [];
        setTournaments(items);

        // Restore state from URL params (when returning from SmartScore)
        const paramTournamentId = searchParams.get('tournamentId');
        const paramArcherId = searchParams.get('archerId');
        const paramCourseNumber = searchParams.get('courseNumber');
        const paramShowTargets = searchParams.get('showTargets');

        if (paramTournamentId && paramArcherId && paramShowTargets === 'true' && !restoredFromParams.current) {
          restoredFromParams.current = true;
          const t = items.find((tour: Tournament) => tour.id === parseInt(paramTournamentId));
          if (t) {
            setSelectedTournament(t);

            let parsed: CourseConfig[] = [];
            if (t.courses) {
              try { parsed = JSON.parse(t.courses); } catch { parsed = []; }
            }
            setCoursesConfig(parsed);

            if (paramCourseNumber) {
              const c = parsed.find((c: CourseConfig) => c.course === parseInt(paramCourseNumber));
              setSelectedCourse(c || (parsed.length === 1 ? parsed[0] : null));
            } else if (parsed.length === 1) {
              setSelectedCourse(parsed[0]);
            }

            // Fetch archers for this tournament and restore selection
            try {
              const archerRes = await client.apiCall.invoke({ url: `/api/v1/tournament/archers/${paramTournamentId}`, method: 'GET', data: {} });
              const archerList = archerRes?.data || [];
              setArchers(archerList);
              const a = archerList.find((ar: Archer) => ar.id === parseInt(paramArcherId));
              if (a) {
                setSelectedArcher(a);
                setShowTargets(true);
              }
            } catch {
              setArchers([]);
            }

            // Fetch scoring template for this tournament
            try {
              const templateRes = await client.apiCall.invoke({ url: `/api/v1/tournament/scorecard-template/${paramTournamentId}`, method: 'GET', data: {} });
              if (templateRes?.data) {
                setScoringTemplate(templateRes.data);
              }
            } catch {
              // Template not set, will use defaults
            }
          }
          // Clear the search params from URL to avoid stale state on refresh
          setSearchParams({}, { replace: true });
        }
      } catch {
        setTournaments([]);
      }
    };
    fetchTournaments();
  }, []);

  const fetchScoringTemplate = async (tournamentId: string) => {
    try {
      const res = await client.apiCall.invoke({ url: `/api/v1/tournament/scorecard-template/${tournamentId}`, method: 'GET', data: {} });
      if (res?.data) {
        setScoringTemplate(res.data);
      } else {
        setScoringTemplate(null);
      }
    } catch {
      setScoringTemplate(null);
    }
  };

  const selectTournament = async (id: string) => {
    const t = tournaments.find((t) => t.id === parseInt(id));
    if (!t) return;
    setSelectedTournament(t);
    setSelectedArcher(null);
    setSelectedCourse(null);
    setShowTargets(false);

    let parsed: CourseConfig[] = [];
    if (t.courses) {
      try { parsed = JSON.parse(t.courses); } catch { parsed = []; }
    }
    setCoursesConfig(parsed);
    if (parsed.length === 1) {
      setSelectedCourse(parsed[0]);
    }

    try {
      const res = await client.apiCall.invoke({ url: `/api/v1/tournament/archers/${id}`, method: 'GET', data: {} });
      setArchers(res?.data || []);
    } catch {
      setArchers([]);
    }

    // Fetch scoring template for this tournament
    await fetchScoringTemplate(id);
  };

  const selectCourse = (courseNum: string) => {
    const c = coursesConfig.find((c) => c.course === parseInt(courseNum));
    setSelectedCourse(c || null);
    setShowTargets(false);
  };

  const maxTargets = selectedCourse?.targets || selectedTournament?.num_targets || 10;
  const filtersComplete = selectedTournament && selectedArcher && (coursesConfig.length <= 1 || selectedCourse);

  const handleTargetTap = (targetNum: number) => {
    if (!selectedTournament || !selectedArcher) return;
    const params = new URLSearchParams({
      tournamentId: selectedTournament.id.toString(),
      courseNumber: (selectedCourse?.course || 1).toString(),
      archerId: selectedArcher.id.toString(),
      archerName: selectedArcher.archer_name,
      targetNumber: targetNum.toString(),
      maxTargets: maxTargets.toString(),
    });
    if (scoringTemplate?.score_values) {
      params.set('scoreValues', JSON.stringify(scoringTemplate.score_values));
    }
    navigate(`/smart-score?${params.toString()}`);
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

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-emerald-400" /> Scorecard
        </h1>

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
            {/* Course Select (if multiple courses) */}
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
              <Select onValueChange={(v) => { setSelectedArcher(archers.find((a) => a.id === parseInt(v)) || null); setShowTargets(false); }}>
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

            {/* Tap to View Score Details */}
            {filtersComplete && !showTargets && (
              <button
                onClick={() => setShowTargets(true)}
                className="w-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-2 border-emerald-500/50 rounded-2xl p-8 text-center transition-all hover:border-emerald-400 hover:from-emerald-500/30 hover:to-emerald-600/20 active:scale-[0.98] group"
              >
                <Target className="h-14 w-14 text-emerald-400 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <p className="text-2xl font-bold text-white mb-2">Tap to View Score Details</p>
                <p className="text-slate-400 text-sm mb-3">
                  {selectedArcher?.archer_name} · {selectedCourse?.name || `Course ${selectedCourse?.course || 1}`} · {maxTargets} targets
                </p>
                <p className="text-emerald-400 font-bold text-lg">Total Score: {totalScore}</p>
              </button>
            )}

            {/* Scrollable Target List */}
            {filtersComplete && showTargets && (
              <div>
                {/* Archer & Course Info Header */}
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4 text-center">
                  <p className="text-white font-semibold text-lg">{selectedArcher?.archer_name}</p>
                  <p className="text-emerald-400 text-sm">
                    {selectedCourse?.name || `Course ${selectedCourse?.course || 1}`} · {maxTargets} targets
                  </p>
                  {scoringTemplate && (
                    <p className="text-slate-400 text-xs mt-1">
                      Scoring: {scoringTemplate.template_name} ({scoringTemplate.score_values.map(v => v === 0 ? 'Miss' : v).join('/')})
                    </p>
                  )}
                  <p className="text-amber-400 font-bold text-lg mt-2">Total Score: {totalScore}</p>
                </div>

                {/* Target List */}
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {Array.from({ length: maxTargets }, (_, i) => i + 1).map((targetNum) => {
                    const targetScore = scores[targetNum];
                    const isScored = targetScore !== undefined;
                    const hasReplay = !!replayMap[targetNum];
                    return (
                      <div key={targetNum} className="flex items-center gap-2">
                        <button
                          onClick={() => handleTargetTap(targetNum)}
                          className="flex-1 flex items-center justify-between bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/50 hover:border-emerald-500/40 rounded-xl px-5 py-4 transition-all active:scale-[0.98] group"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isScored ? 'bg-emerald-500/20' : 'bg-slate-700/80 group-hover:bg-emerald-500/20'}`}>
                              {isScored ? (
                                <CheckCircle className="h-6 w-6 text-emerald-400" />
                              ) : (
                                <Crosshair className="h-5 w-5 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                              )}
                            </div>
                            <div className="text-left">
                              <p className="text-white font-semibold text-lg">
                                Target {targetNum}
                                {isScored && (
                                  <span className="text-emerald-400 ml-2">— {targetScore === 0 ? 'Miss' : targetScore}</span>
                                )}
                              </p>
                              <p className="text-slate-500 text-xs">
                                {isScored ? 'Tap to re-score' : 'Tap to score'}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                        </button>
                        {/* Replay icon */}
                        {hasReplay && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openReplayModal(targetNum); }}
                            className="w-11 h-11 flex-shrink-0 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center hover:bg-amber-500/30 transition-colors"
                            title="View replay"
                          >
                            <Play className="h-5 w-5 text-amber-400" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Back button */}
                <Button
                  onClick={() => setShowTargets(false)}
                  variant="ghost"
                  className="w-full mt-4 text-slate-400 hover:text-white"
                >
                  ← Back to filters
                </Button>
              </div>
            )}

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
                        src={replayModalUrl}
                        controls
                        autoPlay
                        playsInline
                        preload="auto"
                        crossOrigin="anonymous"
                        className="w-full rounded-lg"
                        onError={(e) => {
                          const videoEl = e.currentTarget;
                          const mediaError = videoEl.error;
                          console.error('[Replay] Video playback error:', mediaError?.code, mediaError?.message);
                          setReplayModalState('error');
                          setReplayError(`Video playback failed (code ${mediaError?.code || 'unknown'}). The clip may still be processing.`);
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}