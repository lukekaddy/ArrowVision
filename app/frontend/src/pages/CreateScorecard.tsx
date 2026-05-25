import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipboardList, Plus, X, Search, Image, Target, Upload, Trash2, Pencil } from 'lucide-react';

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
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const navigateToLogin = () => navigate('/landing');
  const [searchParams] = useSearchParams();
  const tournamentId = searchParams.get('tournament_id');
  const client = getClient();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<ScoreEntry[]>([...DEFAULT_ENTRIES]);
  const [includeMiss, setIncludeMiss] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit mode state
  const [editingId, setEditingId] = useState<number | null>(null);

  // Saved scorecards state
  const [savedScorecards, setSavedScorecards] = useState<SavedScorecard[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Ref to scroll to form when editing
  const formRef = useRef<HTMLDivElement>(null);

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
        ...(token ? { options: { headers: { Authorization: `Bearer ${token}` } } } : {}),
      });
      const items = res?.data?.items || res?.data || [];
      setSavedScorecards(Array.isArray(items) ? items : []);
    } catch {
      setSavedScorecards([]);
    } finally {
      setLoadingSaved(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setThumbnailUrl('');
    setThumbnailPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setEntries([...DEFAULT_ENTRIES]);
    setIncludeMiss(true);
  };

  const startEditing = (sc: SavedScorecard) => {
    const parsed = parseScorecardData(sc.template_name, sc.score_values);
    setEditingId(sc.id);
    setName(parsed.name);
    setDescription(parsed.description);
    setThumbnailUrl(parsed.thumbnail_url);
    setThumbnailPreview(parsed.thumbnail_url);

    // Separate out the Miss entry from the rest
    const missEntry = parsed.entries.find((e) => e.label === 'Miss' && e.points === 0);
    const nonMissEntries = parsed.entries.filter((e) => !(e.label === 'Miss' && e.points === 0));

    setIncludeMiss(!!missEntry);
    setEntries(nonMissEntries.length > 0 ? nonMissEntries : [...DEFAULT_ENTRIES]);

    // Scroll to form
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  if (!user) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <ClipboardList className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Sign In Required</h2>
          <p className="text-slate-400 mb-6">You need to sign in to create a scorecard.</p>
          <Button onClick={navigateToLogin} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            Sign In
          </Button>
        </div>
      </Layout>
    );
  }

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview immediately
    const localPreview = URL.createObjectURL(file);
    setThumbnailPreview(localPreview);
    setUploadingThumbnail(true);

    try {
      const objectKey = `thumbnails/${Date.now()}-${file.name}`;
      const bucketName = 'scorecard-thumbnails';

      // Get upload presigned URL
      const uploadRes = await client.storage.getUploadUrl({
        bucket_name: bucketName,
        object_key: objectKey,
      });
      const uploadUrl = uploadRes.data.upload_url;

      // Upload the file to the presigned URL
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      // Get download URL to use as the thumbnail URL
      const downloadRes = await client.storage.getDownloadUrl({
        bucket_name: bucketName,
        object_key: objectKey,
      });
      setThumbnailUrl(downloadRes.data.download_url);
    } catch (err) {
      console.error('Failed to upload thumbnail:', err);
      // Clear preview on error
      setThumbnailPreview('');
      setThumbnailUrl('');
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const removeThumbnail = () => {
    setThumbnailUrl('');
    setThumbnailPreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
      if (editingId) {
        // Update existing scorecard
        await client.apiCall.invoke({
          url: `/api/v1/tournament/update-scorecard/${editingId}`,
          method: 'PUT',
          data: {
            template_name: templateData,
            score_values: scoreValues,
            is_custom: true,
          },
          ...(token ? { options: { headers: { Authorization: `Bearer ${token}` } } } : {}),
        });
      } else {
        // Create new scorecard
        await client.apiCall.invoke({
          url: '/api/v1/tournament/create-scorecard',
          method: 'POST',
          data: {
            tournament_id: tournamentId ? parseInt(tournamentId) : undefined,
            template_name: templateData,
            score_values: scoreValues,
            is_custom: true,
          },
          ...(token ? { options: { headers: { Authorization: `Bearer ${token}` } } } : {}),
        });
      }

      if (tournamentId && !editingId) {
        navigate(`/admin?tournamentId=${tournamentId}`);
      } else {
        // Refresh saved list and reset form
        await fetchSavedScorecards();
        resetForm();
      }
    } catch (err) {
      console.error(`Failed to ${editingId ? 'update' : 'create'} scorecard:`, err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this scorecard?')) return;
    try {
      await client.apiCall.invoke({
        url: `/api/v1/tournament/delete-scorecard/${id}`,
        method: 'DELETE',
        data: {},
        ...(token ? { options: { headers: { Authorization: `Bearer ${token}` } } } : {}),
      });
      // If we were editing this one, reset the form
      if (editingId === id) {
        resetForm();
      }
      await fetchSavedScorecards();
    } catch (err) {
      console.error('Failed to delete scorecard:', err);
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

        {/* Section 1: Create / Edit Scorecard */}
        <div ref={formRef} className="rounded-2xl border border-emerald-500/30 bg-slate-800/40 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {editingId ? (
                <>
                  <Pencil className="h-5 w-5 text-amber-400" />
                  Edit Scorecard
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5 text-emerald-400" />
                  Create New Scorecard
                </>
              )}
            </h2>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetForm}
                className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel Edit
              </Button>
            )}
          </div>

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

            {/* Thumbnail Upload */}
            <div>
              <Label className="text-slate-300 text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                <Image className="h-4 w-4 text-slate-400" />
                Thumbnail Image
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnailUpload}
                className="hidden"
              />
              {thumbnailPreview || thumbnailUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900">
                  <img
                    src={thumbnailPreview || thumbnailUrl}
                    alt="Scorecard thumbnail preview"
                    className="w-full h-40 object-cover"
                  />
                  {uploadingThumbnail && (
                    <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                        <div className="h-4 w-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        Uploading...
                      </div>
                    </div>
                  )}
                  {!uploadingThumbnail && (
                    <button
                      type="button"
                      onClick={removeThumbnail}
                      className="absolute top-2 right-2 h-8 w-8 flex items-center justify-center rounded-full bg-slate-900/80 border border-slate-600 text-slate-300 hover:text-red-400 hover:border-red-500/50 transition-colors"
                      aria-label="Remove thumbnail"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/50 hover:border-emerald-500/50 hover:bg-slate-900 transition-colors flex flex-col items-center justify-center gap-2 group"
                >
                  <Upload className="h-8 w-8 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                  <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                    Click to upload thumbnail
                  </span>
                  <span className="text-xs text-slate-600">PNG, JPG, or WebP</span>
                </button>
              )}
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
              className={`w-full h-12 text-white text-lg font-semibold disabled:opacity-50 ${
                editingId
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-emerald-500 hover:bg-emerald-600'
              }`}
            >
              {saving
                ? editingId ? 'Updating...' : 'Saving...'
                : editingId ? 'Update Scorecard' : 'Save Scorecard'}
            </Button>

            {/* Cancel Edit button (additional, below submit for mobile) */}
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancel editing and create a new scorecard instead
              </button>
            )}

            {/* Skip option (only if coming from tournament creation) */}
            {tournamentId && !editingId && (
              <button
                type="button"
                onClick={() => navigate(`/admin?tournamentId=${tournamentId}`)}
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
                const isBeingEdited = editingId === sc.id;
                return (
                  <div
                    key={sc.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isBeingEdited
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'border-slate-700/50 bg-slate-900/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-white font-semibold text-sm leading-tight">{parsed.name}</h3>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {sc.is_custom && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                            Custom
                          </span>
                        )}
                      </div>
                    </div>
                    {parsed.description && (
                      <p className="text-xs text-slate-400 mb-3 line-clamp-2">{parsed.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mb-3">
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
                      <div className="mb-3 rounded-lg overflow-hidden border border-slate-700/50">
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
                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => startEditing(sc)}
                        disabled={isBeingEdited}
                        className={`flex-1 h-8 text-xs ${
                          isBeingEdited
                            ? 'border-amber-500/50 text-amber-400 opacity-70'
                            : 'border-slate-600 text-slate-300 hover:bg-slate-700/50 hover:text-emerald-400 hover:border-emerald-500/50'
                        }`}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        {isBeingEdited ? 'Editing...' : 'Edit'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(sc.id)}
                        className="h-8 text-xs border-slate-600 text-slate-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
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