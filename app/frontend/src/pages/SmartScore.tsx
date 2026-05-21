import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Crosshair, ArrowLeft, Play, Edit3, Lock, Loader2, VideoOff } from 'lucide-react';

export default function SmartScore() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const client = getClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const tokenRef = useRef<string | null>(token ?? null);

  // Keep tokenRef in sync so async closures always get the latest token
  useEffect(() => { tokenRef.current = token ?? null; }, [token]);

  const tournamentId = searchParams.get('tournamentId');
  const courseNumber = searchParams.get('courseNumber') || '1'; // Default to course 1 if not specified
  const archerId = searchParams.get('archerId');
  const archerName = searchParams.get('archerName');
  const targetNumber = searchParams.get('targetNumber');
  const maxTargets = searchParams.get('maxTargets');
  const scoreValuesParam = searchParams.get('scoreValues');

  // Parse scoreValues from URL param or fall back to default [10, 8, 5, 0]
  const scoreValues: number[] = (() => {
    if (scoreValuesParam) {
      try {
        const parsed = JSON.parse(scoreValuesParam);
        if (Array.isArray(parsed) && parsed.every((v: unknown) => typeof v === 'number')) {
          return parsed;
        }
      } catch {
        // fall through to default
      }
    }
    return [10, 8, 5, 0];
  })();

  const [isPlaying, setIsPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [lockedScore] = useState(scoreValues[0] ?? 10);
  const [replayVideoUrl, setReplayVideoUrl] = useState<string | null>(null);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const [videoPlaybackError, setVideoPlaybackError] = useState(false);

  const hasContext = tournamentId && archerId && targetNumber;

  // Create a stable key for the current target context to force re-renders
  const targetKey = `${tournamentId}-${archerId}-${courseNumber}-${targetNumber}`;

  // Counter to force re-fetch (incremented only when we don't have a URL yet)
  const [fetchCounter, setFetchCounter] = useState(0);
  const replayUrlRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    replayUrlRef.current = replayVideoUrl;
  }, [replayVideoUrl]);

  // Re-fetch replay when page gains focus ONLY if we don't already have a valid URL
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !replayUrlRef.current) {
        setFetchCounter(prev => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Fetch replay video from backend - reset state on every param change or re-fetch trigger
  useEffect(() => {
    // Reset all replay-related state when params change
    setReplayVideoUrl(null);
    setVideoPlaybackError(false);
    setIsPlaying(false);
    setLoadingReplay(false);

    if (!tournamentId || !archerId || !courseNumber || !targetNumber) return;

    let cancelled = false;

    const fetchReplay = async () => {
      setLoadingReplay(true);
      try {
        const tid = parseInt(tournamentId);
        const aid = parseInt(archerId);
        const cn = parseInt(courseNumber);
        const tn = parseInt(targetNumber);
        console.log('[SmartScore] Fetching replay:', { tid, aid, cn, tn, fetchCounter });
        const response = await client.apiCall.invoke({
          url: '/api/v1/replays/find',
          method: 'POST',
          data: {
            tournament_id: tid,
            archer_id: aid,
            course_number: cn,
            target_number: tn,
          },
        });
        console.log('[SmartScore] Replay find response:', JSON.stringify(response?.data));

        if (cancelled) return;

        const objectKey = response?.data?.object_key;
        if (objectKey) {
          console.log('[SmartScore] Found object_key:', objectKey);
          // Use the streaming proxy endpoint instead of presigned URL
          // Append cache-busting timestamp to avoid stale browser cache
          const streamUrl = `/api/v1/replays/stream?bucket_name=arrow-replays&object_key=${encodeURIComponent(objectKey)}&t=${Date.now()}`;
          console.log('[SmartScore] Stream URL:', streamUrl);

          // Preflight check: verify the stream URL returns valid video content
          // before setting it as the video src (avoids silent video element errors)
          try {
            console.log('[SmartScore] Preflight HEAD check on stream URL...');
            const preflight = await fetch(streamUrl, { method: 'HEAD' });
            console.log('[SmartScore] Preflight response:', {
              status: preflight.status,
              statusText: preflight.statusText,
              contentType: preflight.headers.get('content-type'),
              contentLength: preflight.headers.get('content-length'),
            });

            if (!preflight.ok) {
              console.error(`[SmartScore] Stream preflight failed: HTTP ${preflight.status} ${preflight.statusText}`);
              if (!cancelled) {
                setVideoPlaybackError(true);
              }
              return;
            }

            const ct = preflight.headers.get('content-type') || '';
            if (!ct.startsWith('video/') && !ct.startsWith('application/octet-stream')) {
              console.error(`[SmartScore] Stream returned non-video content-type: "${ct}"`);
              // Try a GET with range to inspect actual bytes
              try {
                const probe = await fetch(streamUrl, { headers: { Range: 'bytes=0-64' } });
                const probeText = await probe.text();
                console.error('[SmartScore] Stream probe body (first 64 bytes):', probeText.slice(0, 200));
              } catch (probeErr) {
                console.error('[SmartScore] Stream probe failed:', probeErr);
              }
              if (!cancelled) {
                setVideoPlaybackError(true);
              }
              return;
            }

            // Preflight passed — set the video URL
            if (!cancelled) {
              setReplayVideoUrl(streamUrl);
            }
          } catch (preflightErr) {
            console.error('[SmartScore] Preflight fetch error:', preflightErr);
            // If preflight fails (network error), still try setting the URL
            // The video element will handle the error via onError
            if (!cancelled) {
              setReplayVideoUrl(streamUrl);
            }
          }
        } else {
          console.log('[SmartScore] No object_key found in response');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[SmartScore] Error fetching replay:', err);
        }
      } finally {
        if (!cancelled) {
          setLoadingReplay(false);
        }
      }
    };

    fetchReplay();

    return () => {
      cancelled = true;
    };
  }, [tournamentId, archerId, courseNumber, targetNumber, fetchCounter]);

  const toggleVideo = () => {
    if (!videoRef.current) return;
    // Guard: do not attempt play if video has no valid source
    const hasSource = videoRef.current.currentSrc || videoRef.current.src;
    if (!hasSource) {
      console.warn('No valid video source available');
      return;
    }
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch((err) => {
        console.error('Video play failed:', err);
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }
  };

  const replayVideo = () => {
    if (!videoRef.current) return;
    // Guard: do not attempt play if video has no valid source
    const hasSource = videoRef.current.currentSrc || videoRef.current.src;
    if (!hasSource) {
      console.warn('No valid video source available');
      return;
    }
    videoRef.current.currentTime = 0;
    videoRef.current.play().catch((err) => {
      console.error('Video replay failed:', err);
      setIsPlaying(false);
    });
    setIsPlaying(true);
  };

  const saveScoreToLocalStorage = (scoreValue: number) => {
    if (!tournamentId || !archerId || !courseNumber || !targetNumber) return;
    const key = `scores_${tournamentId}_${archerId}_${courseNumber}`;
    let existing: Record<string, number> = {};
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        existing = JSON.parse(stored);
      }
    } catch {
      existing = {};
    }
    existing[targetNumber] = scoreValue;
    localStorage.setItem(key, JSON.stringify(existing));
  };

  const navigateBackToScorecard = () => {
    const params = new URLSearchParams();
    if (tournamentId) params.set('tournamentId', tournamentId);
    if (archerId) params.set('archerId', archerId);
    if (courseNumber) params.set('courseNumber', courseNumber);
    params.set('showTargets', 'true');
    navigate(`/scorecard?${params.toString()}`);
  };

  const submitScore = async (scoreValue: number) => {
    if (!tournamentId || !archerId || !targetNumber) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        tournament_id: parseInt(tournamentId),
        archer_id: parseInt(archerId),
        target_number: parseInt(targetNumber),
        score_value: scoreValue,
      };
      if (courseNumber) {
        payload.course_number = parseInt(courseNumber);
      }
      const currentToken = tokenRef.current;
      await client.apiCall.invoke({
        url: '/api/v1/tournament/submit-score',
        method: 'POST',
        data: payload,
        ...(currentToken ? { options: { headers: { Authorization: `Bearer ${currentToken}` } } } : {}),
      });
      saveScoreToLocalStorage(scoreValue);
      navigateBackToScorecard();
    } catch (err) {
      console.error('Error submitting score:', err);
      setSubmitting(false);
    }
  };

  if (!hasContext) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <Crosshair className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">No Target Selected</h2>
          <p className="text-slate-400 mb-6">Go to the Scorecard page to select a tournament, archer, and target first.</p>
          <Button onClick={() => navigate('/scorecard')} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            Go to Scorecard
          </Button>
        </div>
      </Layout>
    );
  }



  const SCORE_COLORS = [
    'bg-amber-500 hover:bg-amber-600',
    'bg-red-500 hover:bg-red-600',
    'bg-blue-500 hover:bg-blue-600',
    'bg-slate-600 hover:bg-slate-700',
    'bg-purple-500 hover:bg-purple-600',
    'bg-teal-500 hover:bg-teal-600',
  ];

  const OVERRIDE_SCORES = scoreValues.map((value, index) => ({
    value,
    label: value === 0 ? 'Miss' : String(value),
    color: SCORE_COLORS[index % SCORE_COLORS.length],
  }));

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" onClick={navigateBackToScorecard} className="text-slate-300 hover:text-white p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Crosshair className="h-6 w-6 text-emerald-400" /> Smart Score
            </h1>
          </div>
        </div>

        {/* Target Info */}
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 mb-6 text-center">
          <p className="text-emerald-400 text-sm font-medium mb-1">Course {courseNumber}</p>
          <p className="text-4xl font-bold text-white mb-1">Target {targetNumber}</p>
          <p className="text-slate-400 text-sm">of {maxTargets}</p>
          <p className="text-white font-semibold mt-3">{archerName}</p>
        </div>

        {/* Video Replay Section */}
        <div className="mb-6">
          <p className="text-slate-400 text-sm mb-3 text-center font-medium uppercase tracking-wider">Arrow Replay</p>
          {loadingReplay ? (
            <div className="flex items-center justify-center h-48 bg-slate-800/50 rounded-2xl border-2 border-slate-700/50">
              <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
            </div>
          ) : replayVideoUrl && replayVideoUrl.trim().length > 0 && !videoPlaybackError ? (
            <>
              <div className="relative rounded-2xl overflow-hidden border-2 border-slate-700/50 bg-black">
                <video
                  key={targetKey}
                  ref={videoRef}
                  src={replayVideoUrl}
                  className="w-full aspect-video object-cover"
                  playsInline
                  preload="metadata"
                  onEnded={() => setIsPlaying(false)}
                  onError={(e) => {
                    const videoEl = e.currentTarget;
                    const err = videoEl.error;
                    console.error('[SmartScore] Video playback error details:', {
                      code: err?.code,
                      message: err?.message,
                      MEDIA_ERR_ABORTED: err?.code === 1,
                      MEDIA_ERR_NETWORK: err?.code === 2,
                      MEDIA_ERR_DECODE: err?.code === 3,
                      MEDIA_ERR_SRC_NOT_SUPPORTED: err?.code === 4,
                      currentSrc: videoEl.currentSrc,
                      networkState: videoEl.networkState,
                      readyState: videoEl.readyState,
                    });
                    setIsPlaying(false);
                    setVideoPlaybackError(true);
                  }}
                />
                {/* Play/Pause Overlay */}
                <button
                  onClick={toggleVideo}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors"
                >
                  {!isPlaying && (
                    <div className="w-16 h-16 rounded-full bg-emerald-500/90 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                      <Play className="h-7 w-7 text-white ml-1" />
                    </div>
                  )}
                </button>
              </div>
              {/* Replay Button */}
              <Button
                onClick={replayVideo}
                variant="ghost"
                className="w-full mt-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-2"
              >
                <Play className="h-4 w-4" /> Replay Clip
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 bg-slate-800/50 rounded-2xl border-2 border-slate-700/50">
              <VideoOff className="h-10 w-10 text-slate-500 mb-3" />
              <p className="text-slate-400 text-sm font-medium">No replay available for this target</p>
              <p className="text-slate-500 text-xs mt-1">Record a replay using the Replay Camera</p>
            </div>
          )}
        </div>

        {/* Locked Score Display */}
        <div className="bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 border-2 border-emerald-500/40 rounded-2xl p-6 mb-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Lock className="h-4 w-4 text-emerald-400" />
            <p className="text-emerald-400 text-sm font-medium uppercase tracking-wider">Detected Score</p>
          </div>
          <p className="text-6xl font-bold text-white mb-1">{lockedScore}</p>
          <p className="text-slate-400 text-sm">Bullseye hit confirmed</p>
        </div>

        {/* Submit Locked Score */}
        {!showOverride && (
          <div className="space-y-3">
            <Button
              onClick={() => submitScore(lockedScore)}
              disabled={submitting}
              className="w-full h-16 bg-emerald-500 hover:bg-emerald-600 text-white text-xl font-bold rounded-2xl gap-2 shadow-lg shadow-emerald-500/20"
            >
              {submitting ? 'Submitting...' : `Submit Score: ${lockedScore}`}
            </Button>

            <Button
              onClick={() => setShowOverride(true)}
              variant="ghost"
              className="w-full text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 gap-2"
            >
              <Edit3 className="h-4 w-4" /> Manually Override Score
            </Button>
          </div>
        )}

        {/* Manual Override */}
        {showOverride && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-amber-400 text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                <Edit3 className="h-4 w-4" /> Manual Override
              </p>
              <Button
                onClick={() => setShowOverride(false)}
                variant="ghost"
                size="sm"
                className="text-slate-500 hover:text-white text-xs"
              >
                Cancel
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {OVERRIDE_SCORES.map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => submitScore(btn.value)}
                  disabled={submitting}
                  className={`${btn.color} text-white rounded-2xl h-20 text-2xl font-bold transition-all active:scale-95 disabled:opacity-50`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}