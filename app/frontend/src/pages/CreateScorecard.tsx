import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClipboardList, Check, Plus, X } from 'lucide-react';

interface ScoreTemplate {
  name: string;
  values: number[];
  description: string;
}

const PRESET_TEMPLATES: ScoreTemplate[] = [
  {
    name: 'Standard 10/8/5/Miss',
    values: [10, 8, 5, 0],
    description: 'Traditional 3D archery scoring: 10 (vital), 8 (body), 5 (wound), 0 (miss)',
  },
  {
    name: 'Extended 12/10/8/5/Miss',
    values: [12, 10, 8, 5, 0],
    description: 'Extended scoring: 12 (center vital), 10 (vital), 8 (body), 5 (wound), 0 (miss)',
  },
];

export default function CreateScorecard() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tournamentId = searchParams.get('tournament_id');
  const client = getClient();

  const [saving, setSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<'standard' | 'extended' | 'custom' | null>(null);
  const [customName, setCustomName] = useState('');
  const [customValues, setCustomValues] = useState<number[]>([10, 8, 5, 0]);
  const [newValue, setNewValue] = useState('');

  if (!user) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <ClipboardList className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Sign In Required</h2>
          <p className="text-slate-400 mb-6">You need to sign in to create a scorecard template.</p>
          <Button onClick={login} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            Sign In
          </Button>
        </div>
      </Layout>
    );
  }

  if (!tournamentId) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <ClipboardList className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">No Tournament Selected</h2>
          <p className="text-slate-400 mb-6">Please create a tournament first.</p>
          <Button onClick={() => navigate('/create-tournament')} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            Create Tournament
          </Button>
        </div>
      </Layout>
    );
  }

  const addCustomValue = () => {
    const val = parseInt(newValue);
    if (!isNaN(val) && !customValues.includes(val)) {
      setCustomValues((prev) => [...prev, val].sort((a, b) => b - a));
      setNewValue('');
    }
  };

  const removeCustomValue = (val: number) => {
    setCustomValues((prev) => prev.filter((v) => v !== val));
  };

  const getSelectedData = (): { name: string; values: number[]; isCustom: boolean } | null => {
    if (selectedTemplate === 'standard') {
      return { name: PRESET_TEMPLATES[0].name, values: PRESET_TEMPLATES[0].values, isCustom: false };
    }
    if (selectedTemplate === 'extended') {
      return { name: PRESET_TEMPLATES[1].name, values: PRESET_TEMPLATES[1].values, isCustom: false };
    }
    if (selectedTemplate === 'custom') {
      if (!customName.trim() || customValues.length === 0) return null;
      return { name: customName.trim(), values: customValues, isCustom: true };
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = getSelectedData();
    if (!data) return;

    setSaving(true);
    try {
      await client.callApi('/api/v1/tournament/create-scorecard', {
        method: 'POST',
        body: JSON.stringify({
          tournament_id: parseInt(tournamentId),
          template_name: data.name,
          score_values: data.values,
          is_custom: data.isCustom,
        }),
      });
      navigate(`/dashboard/${tournamentId}`);
    } catch (err) {
      console.error('Failed to create scorecard template:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-emerald-400" />
          Create Scorecard
        </h1>
        <p className="text-slate-400 mb-8">
          Choose a scoring template for your tournament. This determines the score values archers can enter.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Preset Templates */}
          <div>
            <Label className="text-slate-300 mb-3 block text-lg font-semibold">Preset Templates</Label>
            <div className="space-y-3">
              {PRESET_TEMPLATES.map((template, idx) => {
                const key = idx === 0 ? 'standard' : 'extended';
                const isSelected = selectedTemplate === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedTemplate(key as 'standard' | 'extended')}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/30'
                        : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-semibold">{template.name}</span>
                      {isSelected && <Check className="h-5 w-5 text-emerald-400" />}
                    </div>
                    <p className="text-sm text-slate-400">{template.description}</p>
                    <div className="flex gap-2 mt-2">
                      {template.values.map((val) => (
                        <span
                          key={val}
                          className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-700 text-slate-200"
                        >
                          {val === 0 ? 'Miss' : val}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Template */}
          <div>
            <Label className="text-slate-300 mb-3 block text-lg font-semibold">Custom Template</Label>
            <button
              type="button"
              onClick={() => setSelectedTemplate('custom')}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selectedTemplate === 'custom'
                  ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                  : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-white font-semibold">Custom Scoring</span>
                {selectedTemplate === 'custom' && <Check className="h-5 w-5 text-amber-400" />}
              </div>
              <p className="text-sm text-slate-400">Define your own score values for a unique scoring system</p>
            </button>

            {selectedTemplate === 'custom' && (
              <div className="mt-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 space-y-4">
                <div>
                  <Label className="text-slate-400 text-sm mb-1.5 block">Template Name</Label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. My Custom Scoring"
                    className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                    required={selectedTemplate === 'custom'}
                  />
                </div>

                <div>
                  <Label className="text-slate-400 text-sm mb-1.5 block">Score Values</Label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {customValues.map((val) => (
                      <span
                        key={val}
                        className="px-3 py-1.5 rounded-lg text-sm font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1.5"
                      >
                        {val === 0 ? 'Miss (0)' : val}
                        <button
                          type="button"
                          onClick={() => removeCustomValue(val)}
                          className="hover:text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="Add score value..."
                      className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomValue();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={addCustomValue}
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Add all possible score values. Include 0 for a miss.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={saving || !getSelectedData()}
            className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Scorecard Template'}
          </Button>

          {/* Skip option */}
          <button
            type="button"
            onClick={() => navigate(`/dashboard/${tournamentId}`)}
            className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            Skip for now — I'll set this up later
          </button>
        </form>
      </div>
    </Layout>
  );
}