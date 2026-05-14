import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trophy } from 'lucide-react';

export default function TournamentCreate() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const client = getClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    date: '',
    num_targets: 10,
    divisions: '',
    status: 'active',
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.date) return;
    setSaving(true);
    try {
      const res = await client.entities.tournaments.create({
        data: {
          name: form.name,
          date: form.date,
          num_targets: form.num_targets,
          divisions: form.divisions,
          status: form.status,
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
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label className="text-slate-300 mb-1.5 block">Tournament Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Spring Championship 2026"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              required
            />
          </div>
          <div>
            <Label className="text-slate-300 mb-1.5 block">Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white"
              required
            />
          </div>
          <div>
            <Label className="text-slate-300 mb-1.5 block">Number of Targets</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={form.num_targets}
              onChange={(e) => setForm({ ...form, num_targets: parseInt(e.target.value) || 10 })}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
          <div>
            <Label className="text-slate-300 mb-1.5 block">Divisions (comma-separated)</Label>
            <Input
              value={form.divisions}
              onChange={(e) => setForm({ ...form, divisions: e.target.value })}
              placeholder="e.g. Recurve, Compound, Barebow"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
          <div>
            <Label className="text-slate-300 mb-1.5 block">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="active" className="text-white">Active</SelectItem>
                <SelectItem value="upcoming" className="text-white">Upcoming</SelectItem>
                <SelectItem value="completed" className="text-white">Completed</SelectItem>
              </SelectContent>
            </Select>
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