import { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Camera, Crosshair, CheckCircle, ArrowLeft } from 'lucide-react';

export default function SmartScore() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const client = getClient();

  const tournamentId = searchParams.get('tournamentId');
  const courseNumber = searchParams.get('courseNumber');
  const archerId = searchParams.get('archerId');
  const archerName = searchParams.get('archerName');
  const targetNumber = searchParams.get('targetNumber');
  const maxTargets = searchParams.get('maxTargets');

  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [afterImage, setAfterImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

  const hasContext = tournamentId && archerId && targetNumber;

  const handleCapture = (type: 'before' | 'after') => {
    if (type === 'before') beforeRef.current?.click();
    else afterRef.current?.click();
  };

  const handleFile = (type: 'before' | 'after', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (type === 'before') setBeforeImage(reader.result as string);
      else setAfterImage(reader.result as string);
    };
    reader.readAsDataURL(file);
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

  const SCORE_BUTTONS = [
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

        {/* Camera Capture */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <input ref={beforeRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile('before', e)} />
            <Button
              onClick={() => handleCapture('before')}
              className="w-full h-14 bg-slate-700 hover:bg-slate-600 text-white gap-2"
            >
              <Camera className="h-5 w-5" /> Before
            </Button>
          </div>
          <div>
            <input ref={afterRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile('after', e)} />
            <Button
              onClick={() => handleCapture('after')}
              className="w-full h-14 bg-slate-700 hover:bg-slate-600 text-white gap-2"
            >
              <Camera className="h-5 w-5" /> After
            </Button>
          </div>
        </div>

        {/* Image Display */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="aspect-square rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden flex items-center justify-center">
            {beforeImage ? (
              <img src={beforeImage} alt="Before" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-slate-500">
                <Camera className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">Before</p>
              </div>
            )}
          </div>
          <div className="aspect-square rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden flex items-center justify-center">
            {afterImage ? (
              <img src={afterImage} alt="After" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-slate-500">
                <Camera className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">After</p>
              </div>
            )}
          </div>
        </div>

        {/* Score Buttons */}
        <p className="text-slate-400 text-sm mb-3 text-center">Record Score</p>
        <div className="grid grid-cols-2 gap-4">
          {SCORE_BUTTONS.map((btn) => (
            <button
              key={btn.value}
              onClick={() => submitScore(btn.value)}
              disabled={submitting}
              className={`${btn.color} text-white rounded-2xl h-24 text-3xl font-bold transition-all active:scale-95 disabled:opacity-50`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </Layout>
  );
}