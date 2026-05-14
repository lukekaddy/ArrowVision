import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trophy, Plus, X, Check } from 'lucide-react';

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

interface CourseConfig {
  course: number;
  targets: number;
}

export default function TournamentCreate() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const client = getClient();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [customDivision, setCustomDivision] = useState('');
  const [courses, setCourses] = useState<CourseConfig[]>([{ course: 1, targets: 10 }]);

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
    setCourses((prev) => [...prev, { course: prev.length + 1, targets: 10 }]);
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

  const totalTargets = courses.reduce((sum, c) => sum + c.targets, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !date) return;
    setSaving(true);
    try {
      const res = await client.entities.tournaments.create({
        data: {
          name,
          date,
          num_targets: totalTargets,
          divisions: selectedDivisions.join(','),
          courses: JSON.stringify(courses),
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

          {/* Date */}
          <div>
            <Label className="text-slate-300 mb-1.5 block">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
              required
            />
            {date && (
              <p className="text-xs text-slate-500 mt-1">
                Status will be automatically determined: {
                  date === new Date().toISOString().split('T')[0]
                    ? '🟢 Active (today)'
                    : date > new Date().toISOString().split('T')[0]
                    ? '🔵 Upcoming'
                    : '⚪ Completed'
                }
              </p>
            )}
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
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomDivision(); } }}
              />
              <Button type="button" onClick={addCustomDivision} variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700/50">
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
                  <span className="text-sm font-medium text-emerald-400 w-20">
                    Course {course.course}
                  </span>
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={course.targets}
                      onChange={(e) => updateCourseTargets(idx, parseInt(e.target.value) || 1)}
                      className="bg-slate-900 border-slate-700 text-white w-24"
                    />
                    <span className="text-sm text-slate-500">targets</span>
                  </div>
                  {courses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCourse(idx)}
                      className="text-slate-500 hover:text-red-400 transition-colors"
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