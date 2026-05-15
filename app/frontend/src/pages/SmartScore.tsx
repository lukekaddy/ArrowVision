import { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Crosshair, CheckCircle, ArrowLeft, Play, Pause, Edit3, Lock } from 'lucide-react';

const ARROW_VIDEO_URL = 'https://mgx-backend-cdn.metadl.com/generate/videos/1230028/2026-05-14/oru6djqaafsq/arrow-hitting-target.mp4';

export default function SmartScore() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const client = getClient();
  const videoRef = useRef<HTMLVideoElement>(null);

  const tournamentId = searchParams.get('tournamentId');
  const courseNumber = searchParams.get('courseNumber');
  const archerId = searchParams.get('archerId');
  const archerName = searchParams.get('archerName');
  const targetNumber = searchParams.get('targetNumber');
  const maxTargets = searchParams.get('maxTargets');

  const [isPlaying, setIsPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [lockedScore] = useState(10);

  const hasContext = tournamentId && archerId && targetNumber;

  const toggleVideo = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const replayVideo = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play();
    setIsPlaying(true);
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
      await client.apiCall.invoke({
        url: '/api/v1/tournament/submit-score',
        method: 'POST',
        data: payload,
      });
      setSubmittedScore(scoreValue);
      setSubmitted(true);
    } catch (err) {
      console.error('Error submitting score:', err);
    } finally {
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

  if (submitted) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <CheckCircle className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Score Recorded!</h2>
          <p className="text-slate-400 mb-2">
            {archerName} · Target {targetNumber} of {maxTargets}
          </p>
          <p className="text-3xl font-bold text-emerald-400 mb-6">
            {submittedScore === 0 ? 'Miss' : submittedScore}
          </p>
          <Button onClick={() => navigate('/scorecard')} className="bg-emerald-500 hover:bg-emerald-600 text-white h-14 text-lg gap-2">
            <ArrowLeft className="h-5 w-5" /> Back to Scorecard
          </Button>
        </div>
      </Layout>
    );
  }

  const OVERRIDE_SCORES = [
    { value: 10, label: '10', color: 'bg-amber-500 hover:bg-amber-600' },
    { value: 8, label: '8', color: 'bg-red-500 hover:bg-red-600' },
    { value: 5, label: '5', color: 'bg-blue-500 hover:bg-blue-600' },
    { value: 0, label: 'Miss', color: 'bg-slate-600 hover:bg-slate-700' },
  ];

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" onClick={() => navigate('/scorecard')} className="text-slate-300 hover:text-white p-2">
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
          <div className="relative rounded-2xl overflow-hidden border-2 border-slate-700/50 bg-black">
            <video
              ref={videoRef}
              src={ARROW_VIDEO_URL}
              className="w-full aspect-video object-cover"
              playsInline
              onEnded={() => setIsPlaying(false)}
              poster="/placeholder-target.jpg"
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