import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';

export default function AdminUploadReplay() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const client = getClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tournamentId, setTournamentId] = useState('');
  const [archerId, setArcherId] = useState('');
  const [courseNumber, setCourseNumber] = useState('');
  const [targetNumber, setTargetNumber] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-slate-400">Loading...</p>
        </div>
      </Layout>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Access Denied</h2>
          <p className="text-slate-400 mb-6">This page is only accessible to administrators.</p>
          <Button onClick={() => navigate('/')} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            Go Home
          </Button>
        </div>
      </Layout>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setStatus(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !tournamentId || !archerId || !courseNumber || !targetNumber) {
      setStatus({ type: 'error', message: 'Please fill in all fields and select a video file.' });
      return;
    }

    setUploading(true);
    setStatus(null);

    try {
      const objectKey = `replays/${tournamentId}/${archerId}/course${courseNumber}_target${targetNumber}.mp4`;

      // Upload file to object storage
      await client.storage.upload({
        bucket_name: 'arrow-replays',
        object_key: objectKey,
        file: selectedFile,
      });

      // Save metadata to database
      await client.apiCall.invoke({
        url: '/api/v1/replays/save',
        method: 'POST',
        data: {
          tournament_id: parseInt(tournamentId),
          archer_id: parseInt(archerId),
          course_number: parseInt(courseNumber),
          target_number: parseInt(targetNumber),
          object_key: objectKey,
        },
      });

      setStatus({ type: 'success', message: `Replay uploaded successfully! Key: ${objectKey}` });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Upload error:', err);
      setStatus({ type: 'error', message: 'Failed to upload replay. Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" onClick={() => navigate('/')} className="text-slate-300 hover:text-white p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Upload className="h-6 w-6 text-emerald-400" /> Upload Arrow Replay
            </h1>
            <p className="text-slate-400 text-sm">Admin only — upload video for a specific target</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Tournament ID */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Tournament ID</label>
            <input
              type="number"
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. 1"
              required
            />
          </div>

          {/* Archer ID */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Archer ID</label>
            <input
              type="number"
              value={archerId}
              onChange={(e) => setArcherId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. 1"
              required
            />
          </div>

          {/* Course Number */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Course Number</label>
            <input
              type="number"
              value={courseNumber}
              onChange={(e) => setCourseNumber(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. 1"
              required
            />
          </div>

          {/* Target Number */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Target Number</label>
            <input
              type="number"
              value={targetNumber}
              onChange={(e) => setTargetNumber(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. 1"
              required
            />
          </div>

          {/* Video File */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Video File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-emerald-500 file:text-white file:text-sm file:font-medium hover:file:bg-emerald-600"
              required
            />
            {selectedFile && (
              <p className="text-slate-400 text-sm mt-1">Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</p>
            )}
          </div>

          {/* Status Message */}
          {status && (
            <div className={`flex items-center gap-2 p-4 rounded-lg ${status.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              {status.type === 'success' ? (
                <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              )}
              <p className={`text-sm ${status.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>{status.message}</p>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={uploading || !selectedFile}
            className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-bold rounded-xl disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Replay Video'}
          </Button>
        </form>
      </div>
    </Layout>
  );
}