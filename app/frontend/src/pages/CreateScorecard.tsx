import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipboardList, Plus, X, Search, Image, Target } from 'lucide-react';

interface ScoreEntry {
  label: string;
  points: number;
}

interface ScorecardData {
  name: string;
  description: string;
  thumbnail_url: string;
  entries: ScoreEntry[];
}

interface SavedScorecard {
  id: number;
  template_name: string;
  score_values: number[];
  is_custom: boolean;
  tournament_id?: number;
}

function parseScorecardData(templateName: string, scoreValues: number[]): ScorecardData {
  try {
    const data = JSON.parse(templateName);
    return {
      name: data.name || templateName,
      description: data.description || '',
      thumbnail_url: data.thumbnail_url || '',
      entries: data.entries || scoreValues.map((v: number) => ({ label: v === 0 ? 'Miss' : String(v), points: v })),
    };
  } catch {
    return {
      name: templateName,
      description: '',
      thumbnail_url: '',
      entries: scoreValues.map((v) => ({ label: v === 0 ? 'Miss' : String(v), points: v })),
    };
  }
}

const DEFAULT_ENTRIES: ScoreEntry[] = [
  { label: 'Vital', points: 10 },
  { label: 'Body', points: 8 },
  { label: 'Wound', points: 5 },
];

export default function CreateScorecard() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tournamentId = searchParams.get('tournament_id');
  const client = getClient();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [entries, setEntries] = useState<ScoreEntry[]>([...DEFAULT_ENTRIES]);
  const [includeMiss, setIncludeMiss] = useState(true);
  const [saving, setSaving] = useState(false);

  // Saved scorecards state
  const [savedScorecards, setSavedScorecards] = useState<SavedScorecard[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user) {
      fetchSavedScorecards();
    }
  }, [user]);

  const fetchSavedScorecards = async () => {
    setLoadingSaved(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/tournament/scoring-templates',
        method: 'GET',
        data: {},
      });
      const items = res?.data?.items || res?.data || [];
      setSavedScorecards(Array.isArray(items) ? items : []);
    } catch {
      setSavedScorecards([]);
    } finally {
      setLoadingSaved(false);
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <ClipboardList className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Sign In Required</h2>
          <p className="text-slate-400 mb-6">You need to sign in to create a scorecard.</p>
          <Button onClick={login} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            Sign In
          </Button>
        </div>
      </Layout>
    );
  }

  const addEntry = () => {
    setEntries((prev) => [...prev, { label: '', points: 0 }]);
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, field: 'label' | 'points', value: string | number) => {
    setEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const allEntries = [...entries];
    if (includeMiss) {
      allEntries.push({ label: 'Miss', points: 0 });
    }

    // Build the encoded template_name as JSON
    const templateData = JSON.stringify({
      name: name.trim(),
      description: description.trim(),
      thumbnail_url: thumbnailUrl.trim(),
      entries: allEntries,
    });

    // Build score_values as unique sorted descending array
    const pointSet = new Set(allEntries.map((e) => e.points));
    const scoreValues = Array.from(pointSet).sort((a, b) => b - a);

    setSaving(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/tournament/create-scorecard',
        method: 'POST',
        data: {
          tournament_id: tournamentId ? parseInt(tournamentId) : undefined,
          template_name: templateData,
          score_values: scoreValues,
          is_custom: true,
        },
      });
      if (tournamentId) {
        navigate(`/dashboard/${tournamentId}`);
      } else {
        // Refresh saved list and reset form
        await fetchSavedScorecards();
        setName('');
        setDescription('');
        setThumbnailUrl('');
        setEntries([...DEFAULT_ENTRIES]);
        setIncludeMiss(true);
      }
    } catch (err) {
      console.error('Failed to create scorecard:', err);
    } finally {
      setSaving(false);
    }
  };

  // Filter saved scorecards
  const filteredScorecards = savedScorecards.filter((sc) => {
    if (!searchQuery.trim()) return true;
    const parsed = parseScorecardData(sc.template_name, sc.score_values);
    return parsed.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const canSave = name.trim().length > 0 && (entries.length > 0 || includeMiss);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Target className="h-8 w-8 text-emerald-400" />
            Scorecards
          </h1>
          <p className="text-slate-400">
            Create custom scoring systems{tournamentId ? ' for your tournament' : ''} or browse existing ones.
          </p>
        </div>

        {/* Section 1: Create New Scorecard */}
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-800/40 p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Plus className="h-5 w-5 text-emerald-400" />
            Create New Scorecard
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <Label className="text-slate-300 text-sm font-medium mb-1.5 block">
                Scorecard Name <span className="text-red-400">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 3D Standard, IBO Scoring, Custom League"
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 h-11"
                required
              />
            </div>

            {/* Description */}
            <div>
              <Label className="text-slate-300 text-sm font-medium mb-1.5 block">
                Description
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe how scoring works for this scorecard (e.g., where each zone is on the target)"
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 min-h-[80px] resize-none"
              />
            </div>

            {/* Thumbnail URL */}
            <div>
              <Label className="text-slate-300 text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                <Image className="h-4 w-4 text-slate-400" />
                Thumbnail URL
              </Label>
              <Input
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://example.com/scoring-zones.jpg"
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 h-11"
              />
              <p className="text-xs text-slate-500 mt-1">Optional image showing scoring zones or target layout</p>
            </div>

            {/* Score Values Builder */}
            <div>
              <Label className="text-slate-300 text-sm font-medium mb-3 block">
                Score Values
              </Label>
              <p className="text-xs text-slate-500 mb-4">
                Define each scoring zone with a label and point value. Multiple zones can share the same point value.
              </p>

              <div className="space-y-3">
                {entries.map((entry, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input
                        value={entry.label}
                        onChange={(e) => updateEntry(index, 'label', e.target.value)}
                        placeholder="Label (e.g. Vital, Body)"
                        className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 h-11"
                      />
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={entry.points}
                        onChange={(e) => updateEntry(index, 'points', parseInt(e.target.value) || 0)}
                        placeholder="Pts"
                        className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 h-11 text-center"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEntry(index)}
                      className="h-11 w-11 flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
                      aria-label="Remove entry"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {/* Miss entry (read-only display when enabled) */}
                {includeMiss && (
                  <div className="flex items-center gap-2 opacity-70">
                    <div className="flex-1">
                      <Input
                        value="Miss"
                        disabled
                        className="bg-slate-900/50 border-slate-700/50 text-slate-400 h-11 cursor-not-allowed"
                      />
                    </div>
                    <div className="w-24">
                      <Input
                        value="0"
                        disabled
                        className="bg-slate-900/50 border-slate-700/50 text-slate-400 h-11 text-center cursor-not-allowed"
                      />
                    </div>
                    <div className="h-11 w-11 flex items-center justify-center">
                      {/* Spacer to align with other rows */}
                    </div>
                  </div>
                )}
              </div>

              {/* Add Score Value button */}
              <Button
                type="button"
                onClick={addEntry}
                variant="outline"
                className="mt-3 border-slate-600 text-slate-300 hover:bg-slate-700/50 h-11"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Score Value
              </Button>

              {/* Include Miss checkbox */}
              <div className="flex items-center gap-3 mt-4 p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
                <Checkbox
                  id="include-miss"
                  checked={includeMiss}
                  onCheckedChange={(checked) => setIncludeMiss(checked === true)}
                  className="border-slate-600 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                />
                <label htmlFor="include-miss" className="text-sm text-slate-300 cursor-pointer">
                  Include &quot;Miss&quot; (always 0 pts) — a miss is always 0 points, but 0 points isn&apos;t always a miss
                </label>
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={saving || !canSave}
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Scorecard'}
            </Button>

            {/* Skip option (only if coming from tournament creation) */}
            {tournamentId && (
              <button
                type="button"
                onClick={() => navigate(`/dashboard/${tournamentId}`)}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Skip for now — I&apos;ll set this up later
              </button>
            )}
          </form>
        </div>

        {/* Section 2: My Scorecards */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-slate-400" />
            My Scorecards
            {savedScorecards.length > 0 && (
              <span className="text-sm font-normal text-slate-500">({savedScorecards.length})</span>
            )}
          </h2>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search scorecards..."
              className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 h-11 pl-10"
            />
          </div>

          {/* Scorecard List */}
          {loadingSaved ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredScorecards.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-dashed border-slate-700/50 bg-slate-900/30">
              <ClipboardList className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">
                {searchQuery ? 'No scorecards match your search' : 'No scorecards created yet'}
              </p>
              <p className="text-slate-500 text-sm mt-1">
                {searchQuery ? 'Try a different search term' : 'Create your first scorecard above to get started'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredScorecards.map((sc) => {
                const parsed = parseScorecardData(sc.template_name, sc.score_values);
                return (
                  <div
                    key={sc.id}
                    className="p-4 rounded-xl border border-slate-700/50 bg-slate-900/50 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-white font-semibold text-sm leading-tight">{parsed.name}</h3>
                      {sc.is_custom && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium shrink-0 ml-2">
                          Custom
                        </span>
                      )}
                    </div>
                    {parsed.description && (
                      <p className="text-xs text-slate-400 mb-3 line-clamp-2">{parsed.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {parsed.entries.map((entry, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700/80 text-slate-300"
                        >
                          {entry.label}{entry.points > 0 || entry.label !== 'Miss' ? ` (${entry.points})` : ' (0)'}
                        </span>
                      ))}
                    </div>
                    {parsed.thumbnail_url && (
                      <div className="mt-3 rounded-lg overflow-hidden border border-slate-700/50">
                        <img
                          src={parsed.thumbnail_url}
                          alt={`${parsed.name} scoring zones`}
                          className="w-full h-20 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}