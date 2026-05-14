import { useState, useRef } from 'react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Camera, Sparkles, Check } from 'lucide-react';

export default function SmartScore() {
  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [afterImage, setAfterImage] = useState<string | null>(null);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

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

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const SCORE_OPTIONS = [
    { value: 10, label: '10', color: 'bg-amber-500 hover:bg-amber-600' },
    { value: 8, label: '8', color: 'bg-red-500 hover:bg-red-600' },
    { value: 5, label: '5', color: 'bg-blue-500 hover:bg-blue-600' },
    { value: 0, label: 'Miss', color: 'bg-slate-600 hover:bg-slate-700' },
  ];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-amber-400" /> Smart Score
          </h1>
          <span className="text-xs px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
            AI-Assisted · Coming Soon
          </span>
        </div>

        <p className="text-slate-400 mb-8">
          Capture images of the target before and after shooting to assist with scoring. AI analysis coming soon!
        </p>

        {/* Capture Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <input ref={beforeRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile('before', e)} />
            <Button
              onClick={() => handleCapture('before')}
              className="w-full h-14 bg-slate-700 hover:bg-slate-600 text-white gap-2"
            >
              <Camera className="h-5 w-5" /> Capture Before
            </Button>
          </div>
          <div>
            <input ref={afterRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile('after', e)} />
            <Button
              onClick={() => handleCapture('after')}
              className="w-full h-14 bg-slate-700 hover:bg-slate-600 text-white gap-2"
            >
              <Camera className="h-5 w-5" /> Capture After
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
          <div className="aspect-square rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden flex items-center justify-center relative">
            {afterImage ? (
              <>
                <img src={afterImage} alt="After" className="w-full h-full object-cover" />
                {/* Simulated highlight overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 rounded-full border-4 border-emerald-400/60 animate-pulse" />
                </div>
              </>
            ) : (
              <div className="text-center text-slate-500">
                <Camera className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">After</p>
              </div>
            )}
          </div>
        </div>

        {/* Score Confirm */}
        <div className="mb-6">
          <p className="text-slate-400 text-sm mb-3">Confirm score manually:</p>
          <div className="grid grid-cols-4 gap-3">
            {SCORE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedScore(opt.value)}
                className={`${opt.color} text-white rounded-xl h-16 text-xl font-bold transition-all active:scale-95 ${
                  selectedScore === opt.value ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0f172a]' : ''
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={selectedScore === null}
          className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-semibold gap-2"
        >
          {saved ? <><Check className="h-5 w-5" /> Saved!</> : 'Save Score'}
        </Button>
      </div>
    </Layout>
  );
}