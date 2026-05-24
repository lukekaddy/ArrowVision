import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trophy, Plus, X, Check, MapPin, Eye, ExternalLink, Upload, Trash2, Map, CalendarDays, Clock, Users } from 'lucide-react';
import { getTournamentStatus } from '@/lib/dateUtils';

const DIVISION_OPTIONS = [
  'Recurve',
  'Compound',
  'Barebow',
  'Longbow',
  'Traditional',
  'Crossbow',
  'Instinctive',
  'Olympic Recurve',
];

const MULLIGAN_TYPE_OPTIONS = ['Mulligans', 'Doe Tags', 'Custom'];

interface CourseConfig {
  course: number;
  name: string;
  targets: number;
}

interface MulliganType {
  name: string;
  maxAllowed: number;
  restrictedTargets: number[];
}

interface MulliganConfig {
  enabled: boolean;
  types: MulliganType[];
}

interface SavedScorecard {
  id: number;
  template_name: string;
  score_values: number[];
  is_custom: boolean;
}

export default function TournamentCreate() {
  const { user, login, token } = useAuth();
  const navigate = useNavigate();
  const client = getClient();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  // Course Map upload
  const [courseMapUrl, setCourseMapUrl] = useState('');
  const [courseMapPreview, setCourseMapPreview] = useState('');
  const [uploadingCourseMap, setUploadingCourseMap] = useState(false);
  const courseMapInputRef = useRef<HTMLInputElement>(null);
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [customDivision, setCustomDivision] = useState('');
  const [courses, setCourses] = useState<CourseConfig[]>([{ course: 1, name: '', targets: 10 }]);

  // Scorecard selection
  const [savedScorecards, setSavedScorecards] = useState<SavedScorecard[]>([]);
  const [selectedScorecardId, setSelectedScorecardId] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);

  // Max Group Size
  const [maxGroupSize, setMaxGroupSize] = useState(4);

  // Mulligan state
  const [mulligansEnabled, setMulligansEnabled] = useState(false);
  const [selectedMulliganTypes, setSelectedMulliganTypes] = useState<string[]>([]);
  const [customMulliganName, setCustomMulliganName] = useState('');
  const [mulliganMaxAllowed, setMulliganMaxAllowed] = useState<Record<string, number>>({});
  const [mulliganRestricted, setMulliganRestricted] = useState<Record<string, boolean>>({});
  const [mulliganRestrictedTargets, setMulliganRestrictedTargets] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user && token) {
      fetchScorecards();
    }
  }, [user, token]);

  const fetchScorecards = async () => {
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
    }
  };

  const selectedScorecard = savedScorecards.find((sc) => sc.id.toString() === selectedScorecardId);

  if (!user) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <Trophy className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Sign In Required</h2>
          <p className="text-slate-400 mb-6">You need to sign in to create a tournament.</p>
          <Button onClick={login} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            Sign In
          </Button>
        </div>
      </Layout>
    );
  }

  const toggleDivision = (div: string) => {
    setSelectedDivisions((prev) =>
      prev.includes(div) ? prev.filter((d) => d !== div) : [...prev, div]
    );
  };

  const addCustomDivision = () => {
    const trimmed = customDivision.trim();
    if (trimmed && !selectedDivisions.includes(trimmed)) {
      setSelectedDivisions((prev) => [...prev, trimmed]);
      setCustomDivision('');
    }
  };

  const addCourse = () => {
    setCourses((prev) => [...prev, { course: prev.length + 1, name: '', targets: 10 }]);
  };

  const removeCourse = (index: number) => {
    if (courses.length <= 1) return;
    setCourses((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((c, i) => ({ ...c, course: i + 1 }));
    });
  };

  const updateCourseTargets = (index: number, targets: number) => {
    setCourses((prev) => prev.map((c, i) => (i === index ? { ...c, targets } : c)));
  };

  const updateCourseName = (index: number, courseName: string) => {
    setCourses((prev) => prev.map((c, i) => (i === index ? { ...c, name: courseName } : c)));
  };

  const totalTargets = courses.reduce((sum, c) => sum + c.targets, 0);

  // Mulligan helpers
  const toggleMulliganType = (type: string) => {
    setSelectedMulliganTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  };

  const getMulliganTypeName = (type: string) => {
    if (type === 'Custom') return customMulliganName.trim() || 'Custom';
    return type;
  };

  const buildMulliganConfig = (): MulliganConfig => {
    if (!mulligansEnabled) {
      return { enabled: false, types: [] };
    }
    const types: MulliganType[] = selectedMulliganTypes.map((type) => {
      const typeName = getMulliganTypeName(type);
      const maxAllowed = mulliganMaxAllowed[type] || 1;
      const restricted = mulliganRestricted[type] || false;
      const restrictedTargets = restricted
        ? (mulliganRestrictedTargets[type] || '')
            .split(',')
            .map((s) => parseInt(s.trim()))
            .filter((n) => !isNaN(n))
        : [];
      return { name: typeName, maxAllowed, restrictedTargets };
    });
    return { enabled: true, types };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !date) return;
    setSaving(true);
    try {
      const mulliganConfig = buildMulliganConfig();
      // Encode multi-day as "startDate|endDate" in the date field
      const dateValue = isMultiDay && endDate && endDate !== date
        ? `${date}|${endDate}`
        : date;
      const res = await client.entities.tournaments.create({
        data: {
          name,
          date: dateValue,
          start_time: startTime || undefined,
          location: location || undefined,
          num_targets: totalTargets,
          divisions: selectedDivisions.join(','),
          courses: JSON.stringify(courses),
          mulligans: JSON.stringify(mulliganConfig),
          scoring_template_id: selectedScorecardId ? parseInt(selectedScorecardId) : undefined,
          course_map_url: courseMapUrl || undefined,
          max_group_size: maxGroupSize,
          status: 'auto',
        },
      });
      const id = res?.data?.id;
      if (id) {
        navigate(`/dashboard/${id}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error('Failed to create tournament:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
          <Trophy className="h-8 w-8 text-emerald-400" />
          Create Tournament
        </h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <Label className="text-slate-300 mb-1.5 block">Tournament Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring Championship 2026"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              required
            />
          </div>

          {/* Location */}
          <div>
            <Label className="text-slate-300 mb-1.5 block flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-emerald-400" />
              Location
            </Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Pine Valley Archery Range, Oregon"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          {/* Date */}
          <div>
            <Label className="text-slate-300 mb-1.5 block">
              {isMultiDay ? 'Start Date' : 'Date'}
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (!isMultiDay) setEndDate(e.target.value);
              }}
              className="bg-slate-800 border-slate-700 text-white"
              required
            />

            {/* Multi-day toggle */}
            <div className="flex items-center justify-between mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-slate-300">Multi-day tournament</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !isMultiDay;
                  setIsMultiDay(next);
                  if (!next) setEndDate(date);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isMultiDay ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isMultiDay ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* End Date (only shown for multi-day) */}
            {isMultiDay && (
              <div className="mt-3">
                <Label className="text-slate-300 mb-1.5 block">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={date}
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
              </div>
            )}

            {date && (
              <p className="text-xs text-slate-500 mt-2">
                Status will be automatically determined:{' '}
                {(() => {
                  const status = getTournamentStatus(date, isMultiDay ? endDate : date);
                  if (status === 'active') return '🟢 Active (today is within range)';
                  if (status === 'upcoming') return '🔵 Upcoming';
                  return '⚪ Completed';
                })()}
              </p>
            )}
          </div>

          {/* Start Time */}
          <div>
            <Label className="text-slate-300 mb-1.5 block flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-emerald-400" />
              Start Time
            </Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <p className="text-xs text-slate-500 mt-1">
              Registration will close at this time on the tournament start date
            </p>
          </div>

          {/* Scorecard Selection */}
          <div>
            <Label className="text-slate-300 mb-2 block">Select Scorecard</Label>
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={selectedScorecardId} onValueChange={(val) => { setSelectedScorecardId(val); setShowPreview(false); }}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-12">
                      <SelectValue placeholder="Select a scorecard..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {savedScorecards.map((sc) => {
                        let displayName = sc.template_name;
                        try {
                          const parsed = JSON.parse(sc.template_name);
                          displayName = parsed.name || sc.template_name;
                        } catch {
                          // use template_name as-is
                        }
                        return (
                          <SelectItem key={sc.id} value={sc.id.toString()} className="text-white">
                            {displayName}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {selectedScorecardId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPreview(!showPreview)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700/50 h-12 px-3"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Preview */}
              {showPreview && selectedScorecard && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-emerald-500/30">
                  <p className="text-sm text-slate-400 mb-2">Score Values:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedScorecard.score_values.map((val) => (
                      <span
                        key={val}
                        className="px-3 py-1.5 rounded-lg text-sm font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      >
                        {val === 0 ? 'Miss' : val}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Create New Scorecard link */}
              <button
                type="button"
                onClick={() => navigate('/create-scorecard')}
                className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Create New Scorecard Template
              </button>
            </div>
            {savedScorecards.length === 0 && (
              <p className="text-xs text-slate-500 mt-2">
                No scorecards found. Create one first or the default scoring will be used.
              </p>
            )}
          </div>

          {/* Course Map Upload */}
          <div>
            <Label className="text-slate-300 mb-1.5 block flex items-center gap-1.5">
              <Map className="h-4 w-4 text-emerald-400" />
              Course Map
            </Label>
            <input
              ref={courseMapInputRef}
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const localPreview = URL.createObjectURL(file);
                setCourseMapPreview(localPreview);
                setUploadingCourseMap(true);
                try {
                  const objectKey = `maps/${Date.now()}-${file.name}`;
                  const bucketName = 'course-maps';
                  const uploadRes = await client.storage.getUploadUrl({
                    bucket_name: bucketName,
                    object_key: objectKey,
                  });
                  const uploadUrl = uploadRes.data.upload_url;
                  await fetch(uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Type': file.type },
                  });
                  const downloadRes = await client.storage.getDownloadUrl({
                    bucket_name: bucketName,
                    object_key: objectKey,
                  });
                  setCourseMapUrl(downloadRes.data.download_url);
                } catch (err) {
                  console.error('Failed to upload course map:', err);
                  setCourseMapPreview('');
                  setCourseMapUrl('');
                } finally {
                  setUploadingCourseMap(false);
                }
              }}
              className="hidden"
            />
            {courseMapPreview || courseMapUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900">
                <img
                  src={courseMapPreview || courseMapUrl}
                  alt="Course map preview"
                  className="w-full h-40 object-cover"
                />
                {uploadingCourseMap && (
                  <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                      <div className="h-4 w-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </div>
                  </div>
                )}
                {!uploadingCourseMap && (
                  <button
                    type="button"
                    onClick={() => {
                      setCourseMapUrl('');
                      setCourseMapPreview('');
                      if (courseMapInputRef.current) courseMapInputRef.current.value = '';
                    }}
                    className="absolute top-2 right-2 h-8 w-8 flex items-center justify-center rounded-full bg-slate-900/80 border border-slate-600 text-slate-300 hover:text-red-400 hover:border-red-500/50 transition-colors"
                    aria-label="Remove course map"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => courseMapInputRef.current?.click()}
                className="w-full h-32 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/50 hover:border-emerald-500/50 hover:bg-slate-900 transition-colors flex flex-col items-center justify-center gap-2 group"
              >
                <Upload className="h-8 w-8 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                  Click to upload course map
                </span>
                <span className="text-xs text-slate-600">PNG, JPG, or WebP</span>
              </button>
            )}
            <p className="text-xs text-slate-500 mt-1">Optional image showing the course layout and target locations</p>
          </div>

          {/* Divisions Multi-Pick */}
          <div>
            <Label className="text-slate-300 mb-2 block">Divisions</Label>
            <div className="flex flex-wrap gap-2 mb-3">
              {DIVISION_OPTIONS.map((div) => (
                <button
                  key={div}
                  type="button"
                  onClick={() => toggleDivision(div)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedDivisions.includes(div)
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {selectedDivisions.includes(div) && <Check className="h-3 w-3 inline mr-1" />}
                  {div}
                </button>
              ))}
            </div>
            {/* Custom division */}
            <div className="flex gap-2">
              <Input
                value={customDivision}
                onChange={(e) => setCustomDivision(e.target.value)}
                placeholder="Add custom division..."
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomDivision();
                  }
                }}
              />
              <Button
                type="button"
                onClick={addCustomDivision}
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
              >
                Add
              </Button>
            </div>
            {/* Selected custom divisions */}
            {selectedDivisions.filter((d) => !DIVISION_OPTIONS.includes(d)).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedDivisions
                  .filter((d) => !DIVISION_OPTIONS.includes(d))
                  .map((d) => (
                    <span
                      key={d}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1"
                    >
                      {d}
                      <button type="button" onClick={() => toggleDivision(d)} className="hover:text-white">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Courses */}
          <div>
            <Label className="text-slate-300 mb-2 block">
              Courses ({courses.length}) · {totalTargets} total targets
            </Label>
            <div className="space-y-3">
              {courses.map((course, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
                >
                  <span className="text-sm font-medium text-emerald-400 shrink-0">
                    #{course.course}
                  </span>
                  <Input
                    type="text"
                    value={course.name}
                    onChange={(e) => updateCourseName(idx, e.target.value)}
                    placeholder={`Course ${course.course}`}
                    className="bg-slate-900 border-slate-700 text-white flex-1 min-w-0"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={course.targets}
                      onChange={(e) => updateCourseTargets(idx, parseInt(e.target.value) || 1)}
                      className="bg-slate-900 border-slate-700 text-white w-20"
                    />
                    <span className="text-sm text-slate-500">targets</span>
                  </div>
                  {courses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCourse(idx)}
                      className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              onClick={addCourse}
              variant="outline"
              className="mt-3 border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 gap-1 w-full"
            >
              <Plus className="h-4 w-4" /> Add Course
            </Button>
          </div>

          {/* Max Group Size */}
          <div>
            <Label className="text-slate-300 mb-1.5 block flex items-center gap-1.5">
              <Users className="h-4 w-4 text-emerald-400" />
              Max Group Size
            </Label>
            <Input
              type="number"
              min={2}
              max={10}
              value={maxGroupSize}
              onChange={(e) => setMaxGroupSize(Math.max(2, Math.min(10, parseInt(e.target.value) || 4)))}
              className="bg-slate-800 border-slate-700 text-white w-24"
            />
            <p className="text-xs text-slate-500 mt-1">
              Maximum number of archers per shooting group (2-10)
            </p>
          </div>

          {/* Mulligans */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-slate-300">Tournament Allows Mulligans</Label>
              <button
                type="button"
                onClick={() => setMulligansEnabled(!mulligansEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  mulligansEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    mulligansEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {mulligansEnabled && (
              <div className="space-y-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <p className="text-sm text-slate-400">Select mulligan types available in this tournament:</p>
                <div className="flex flex-wrap gap-2">
                  {MULLIGAN_TYPE_OPTIONS.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleMulliganType(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        selectedMulliganTypes.includes(type)
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {selectedMulliganTypes.includes(type) && (
                        <Check className="h-3 w-3 inline mr-1" />
                      )}
                      {type}
                    </button>
                  ))}
                </div>

                {/* Custom name input */}
                {selectedMulliganTypes.includes('Custom') && (
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Custom Mulligan Name</Label>
                    <Input
                      value={customMulliganName}
                      onChange={(e) => setCustomMulliganName(e.target.value)}
                      placeholder="e.g. Bonus Shot"
                      className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                    />
                  </div>
                )}

                {/* Config for each selected type */}
                {selectedMulliganTypes.map((type) => (
                  <div
                    key={type}
                    className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30 space-y-3"
                  >
                    <p className="text-sm font-medium text-white">
                      {getMulliganTypeName(type)}
                    </p>
                    <div className="flex items-center gap-3">
                      <Label className="text-slate-400 text-xs shrink-0">Max Allowed</Label>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={mulliganMaxAllowed[type] || 1}
                        onChange={(e) =>
                          setMulliganMaxAllowed((prev) => ({
                            ...prev,
                            [type]: parseInt(e.target.value) || 1,
                          }))
                        }
                        className="bg-slate-800 border-slate-700 text-white w-20"
                        required
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-400 text-xs">Restricted to Certain Targets</Label>
                      <button
                        type="button"
                        onClick={() =>
                          setMulliganRestricted((prev) => ({
                            ...prev,
                            [type]: !prev[type],
                          }))
                        }
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          mulliganRestricted[type] ? 'bg-amber-500' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            mulliganRestricted[type] ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {mulliganRestricted[type] && (
                      <div>
                        <Input
                          value={mulliganRestrictedTargets[type] || ''}
                          onChange={(e) =>
                            setMulliganRestrictedTargets((prev) => ({
                              ...prev,
                              [type]: e.target.value,
                            }))
                          }
                          placeholder="e.g. 5, 10, 15"
                          className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Comma-separated target numbers where this mulligan can be used
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-semibold"
          >
            {saving ? 'Creating...' : 'Create Tournament'}
          </Button>
        </form>
      </div>
    </Layout>
  );
}