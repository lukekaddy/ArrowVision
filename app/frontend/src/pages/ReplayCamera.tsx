import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Video, Mic, MicOff, AlertCircle, CheckCircle, Loader2, Volume2 } from 'lucide-react';

interface Tournament {
  id: number;
  name: string;
  courses?: string;
}

interface CourseConfig {
  course: number;
  name?: string;
  targets: number;
}

interface Archer {
  id: number;
  archer_name: string;
  first_name?: string;
  last_name?: string;
}

type CameraStatus = 'idle' | 'requesting' | 'active' | 'error';
type RecordingStatus = 'idle' | 'listening' | 'triggered' | 'uploading' | 'success' | 'error';

export default function ReplayCamera() {
  const { user, loading, login } = useAuth();
  const client = getClient();
  const navigate = useNavigate();

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const cooldownRef = useRef<boolean>(false);
  const triggerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningRef = useRef<boolean>(false);

  // State
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [sensitivity, setSensitivity] = useState(0.15);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [coursesConfig, setCoursesConfig] = useState<CourseConfig[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseConfig | null>(null);
  const [archers, setArchers] = useState<Archer[]>([]);
  const [selectedArcher, setSelectedArcher] = useState<Archer | null>(null);
  const [targetNumber, setTargetNumber] = useState(1);
  const [clipCount, setClipCount] = useState(0);

  // Fetch tournaments on mount
  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await client.apiCall.invoke({ url: '/api/v1/tournament/public-list', method: 'GET', data: {} });
        setTournaments(res?.data?.items || []);
      } catch {
        setTournaments([]);
      }
    };
    if (user) fetchTournaments();
  }, [user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopEverything();
    };
  }, []);

  const stopEverything = () => {
    // Stop animation frame
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    // Release wake lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    // Clear timeout
    if (triggerTimeoutRef.current) {
      clearTimeout(triggerTimeoutRef.current);
      triggerTimeoutRef.current = null;
    }
    isListeningRef.current = false;
  };

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Wake lock not supported or denied
    }
  };

  const getSupportedMimeType = (): string => {
    const types = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm',
      'video/mp4',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  };

  const startCamera = async () => {
    setCameraStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      await requestWakeLock();
      setCameraStatus('active');
      startRecording(stream);
      startAudioDetection(stream);
    } catch (err) {
      console.error('Camera error:', err);
      setCameraStatus('error');
      setStatusMessage('Camera/microphone access denied. Please allow permissions and try again.');
    }
  };

  const startRecording = (stream: MediaStream) => {
    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      setStatusMessage('No supported video format found on this device.');
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
        // Keep only last 10 seconds worth of chunks (10 chunks at 1s each)
        if (chunksRef.current.length > 10) {
          chunksRef.current = chunksRef.current.slice(-10);
        }
      }
    };

    recorder.start(1000); // 1-second chunks
    mediaRecorderRef.current = recorder;
    setRecordingStatus('listening');
    isListeningRef.current = true;
  };

  const startAudioDetection = (stream: MediaStream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.fftSize);

    const detectLoop = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(dataArray);

      // Calculate RMS volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setCurrentVolume(rms);

      // Check for impact
      if (isListeningRef.current && !cooldownRef.current && rms > sensitivity) {
        triggerImpact();
      }

      animFrameRef.current = requestAnimationFrame(detectLoop);
    };

    animFrameRef.current = requestAnimationFrame(detectLoop);
  };

  const triggerImpact = () => {
    cooldownRef.current = true;
    isListeningRef.current = false;
    setRecordingStatus('triggered');
    setStatusMessage('Impact detected! Capturing clip...');

    // Wait 3 more seconds to capture post-impact footage
    triggerTimeoutRef.current = setTimeout(() => {
      generateClip();
    }, 3000);
  };

  const generateClip = async () => {
    // Stop recorder to flush final data
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      resetAfterClip();
      return;
    }

    // Request data and wait for it
    recorder.stop();

    // Small delay to ensure ondataavailable fires
    await new Promise(resolve => setTimeout(resolve, 200));

    // Take the last 6 seconds of chunks (3 before trigger + 3 after)
    const clipChunks = chunksRef.current.slice(-6);
    if (clipChunks.length === 0) {
      setStatusMessage('No video data captured.');
      setRecordingStatus('error');
      resetAfterClip();
      return;
    }

    const mimeType = getSupportedMimeType();
    const clipBlob = new Blob(clipChunks, { type: mimeType });

    // Upload if context is set
    if (selectedTournament && selectedArcher) {
      await uploadClip(clipBlob);
    } else {
      setStatusMessage('Clip captured but no tournament/archer selected. Skipping upload.');
      setRecordingStatus('success');
      setTimeout(() => resetAfterClip(), 2000);
    }
  };

  const uploadClip = async (clipBlob: Blob) => {
    setRecordingStatus('uploading');
    setStatusMessage('Uploading replay...');

    const courseNum = selectedCourse?.course || 1;
    const objectKey = `replays/${selectedTournament!.id}/${selectedArcher!.id}/course${courseNum}_target${targetNumber}.mp4`;

    try {
      // Convert blob to File for upload
      const file = new File([clipBlob], `course${courseNum}_target${targetNumber}.mp4`, { type: clipBlob.type });

      await client.storage.upload({
        bucket_name: 'arrow-replays',
        object_key: objectKey,
        file: file,
      });

      // Save metadata
      await client.apiCall.invoke({
        url: '/api/v1/replays/save',
        method: 'POST',
        data: {
          tournament_id: selectedTournament!.id,
          archer_id: selectedArcher!.id,
          course_number: courseNum,
          target_number: targetNumber,
          object_key: objectKey,
        },
      });

      setRecordingStatus('success');
      setStatusMessage(`✓ Target ${targetNumber} replay saved!`);
      setClipCount(prev => prev + 1);

      // Auto-increment target
      const maxTargets = selectedCourse?.targets || 20;
      if (targetNumber < maxTargets) {
        setTargetNumber(prev => prev + 1);
      }

      setTimeout(() => resetAfterClip(), 2000);
    } catch (err) {
      console.error('Upload error:', err);
      setRecordingStatus('error');
      setStatusMessage('Upload failed. Will retry on next trigger.');
      setTimeout(() => resetAfterClip(), 3000);
    }
  };

  const resetAfterClip = () => {
    cooldownRef.current = false;
    // Restart recording if stream is still active
    if (streamRef.current && streamRef.current.active) {
      startRecording(streamRef.current);
    } else {
      setRecordingStatus('idle');
    }
  };

  const selectTournament = async (id: string) => {
    const t = tournaments.find(t => t.id === parseInt(id));
    if (!t) return;
    setSelectedTournament(t);
    setSelectedArcher(null);
    setSelectedCourse(null);
    setTargetNumber(1);

    let parsed: CourseConfig[] = [];
    if (t.courses) {
      try { parsed = JSON.parse(t.courses); } catch { parsed = []; }
    }
    setCoursesConfig(parsed);
    if (parsed.length === 1) setSelectedCourse(parsed[0]);

    try {
      const res = await client.apiCall.invoke({ url: `/api/v1/tournament/archers/${id}`, method: 'GET', data: {} });
      setArchers(res?.data || []);
    } catch {
      setArchers([]);
    }
  };

  const selectCourse = (courseNum: string) => {
    const c = coursesConfig.find(c => c.course === parseInt(courseNum));
    setSelectedCourse(c || null);
    setTargetNumber(1);
  };

  const getStatusColor = () => {
    switch (recordingStatus) {
      case 'listening': return 'bg-emerald-500';
      case 'triggered': return 'bg-amber-500';
      case 'uploading': return 'bg-blue-500';
      case 'success': return 'bg-emerald-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  };

  const getStatusLabel = () => {
    switch (recordingStatus) {
      case 'listening': return 'Listening';
      case 'triggered': return 'Triggered!';
      case 'uploading': return 'Uploading';
      case 'success': return 'Saved';
      case 'error': return 'Error';
      default: return 'Idle';
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <Loader2 className="h-12 w-12 text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <Video className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Sign In Required</h2>
          <p className="text-slate-400 mb-6">Sign in to use the Replay Camera.</p>
          <Button onClick={login} className="bg-emerald-500 hover:bg-emerald-600 text-white">Sign In</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Video className="h-6 w-6 text-emerald-400" /> Replay Camera
          </h1>
          {clipCount > 0 && (
            <span className="text-sm text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
              {clipCount} clip{clipCount > 1 ? 's' : ''} saved
            </span>
          )}
        </div>

        {/* Context Selection Bar */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <Select onValueChange={selectTournament}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-10 text-sm">
              <SelectValue placeholder="Tournament" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {tournaments.map(t => (
                <SelectItem key={t.id} value={t.id.toString()} className="text-white text-sm">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {coursesConfig.length > 1 ? (
            <Select onValueChange={selectCourse}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-10 text-sm">
                <SelectValue placeholder="Course" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {coursesConfig.map(c => (
                  <SelectItem key={c.course} value={c.course.toString()} className="text-white text-sm">
                    {c.name || `Course ${c.course}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select onValueChange={(v) => { setSelectedArcher(archers.find(a => a.id === parseInt(v)) || null); setTargetNumber(1); }}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-10 text-sm">
                <SelectValue placeholder="Archer" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {archers.map(a => (
                  <SelectItem key={a.id} value={a.id.toString()} className="text-white text-sm">{a.archer_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {coursesConfig.length > 1 && (
            <Select onValueChange={(v) => { setSelectedArcher(archers.find(a => a.id === parseInt(v)) || null); setTargetNumber(1); }}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-10 text-sm">
                <SelectValue placeholder="Archer" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {archers.map(a => (
                  <SelectItem key={a.id} value={a.id.toString()} className="text-white text-sm">{a.archer_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Target Number */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm whitespace-nowrap">Target:</span>
            <input
              type="number"
              min={1}
              max={selectedCourse?.targets || 99}
              value={targetNumber}
              onChange={(e) => setTargetNumber(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Camera View */}
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-4">
          {cameraStatus === 'active' ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {cameraStatus === 'requesting' ? (
                <>
                  <Loader2 className="h-12 w-12 text-emerald-400 animate-spin mb-3" />
                  <p className="text-slate-300">Requesting camera access...</p>
                </>
              ) : cameraStatus === 'error' ? (
                <>
                  <AlertCircle className="h-12 w-12 text-red-400 mb-3" />
                  <p className="text-red-300 text-center px-4">{statusMessage}</p>
                  <Button onClick={startCamera} className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white">
                    Retry
                  </Button>
                </>
              ) : (
                <>
                  <Video className="h-16 w-16 text-slate-600 mb-3" />
                  <p className="text-slate-400 mb-4">Camera preview will appear here</p>
                  <Button onClick={startCamera} className="bg-emerald-500 hover:bg-emerald-600 text-white h-12 px-6 text-lg">
                    Start Camera
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Status Overlay */}
          {cameraStatus === 'active' && (
            <>
              {/* Top-left status badge */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${recordingStatus === 'listening' ? 'animate-pulse' : ''}`} />
                <span className="text-white text-sm font-medium bg-black/50 px-2 py-0.5 rounded">
                  {getStatusLabel()}
                </span>
              </div>

              {/* Top-right target info */}
              <div className="absolute top-3 right-3 bg-black/50 px-3 py-1 rounded text-white text-sm">
                T{targetNumber} {selectedArcher ? `• ${selectedArcher.archer_name}` : ''}
              </div>

              {/* Volume meter */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-white/70" />
                <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${currentVolume > sensitivity ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(currentVolume * 500, 100)}%` }}
                  />
                </div>
                {/* Threshold marker */}
                <div className="relative w-full absolute left-0 right-0 bottom-0 pointer-events-none" style={{ display: 'none' }}>
                  <div className="absolute h-2 border-r-2 border-red-400" style={{ left: `${sensitivity * 500}%` }} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Status Message */}
        {statusMessage && cameraStatus === 'active' && (
          <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
            recordingStatus === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30' :
            recordingStatus === 'error' ? 'bg-red-500/10 border border-red-500/30' :
            'bg-amber-500/10 border border-amber-500/30'
          }`}>
            {recordingStatus === 'success' ? (
              <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
            ) : recordingStatus === 'error' ? (
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            ) : (
              <Loader2 className="h-5 w-5 text-amber-400 animate-spin flex-shrink-0" />
            )}
            <p className={`text-sm ${
              recordingStatus === 'success' ? 'text-emerald-300' :
              recordingStatus === 'error' ? 'text-red-300' : 'text-amber-300'
            }`}>{statusMessage}</p>
          </div>
        )}

        {/* Sensitivity Control */}
        {cameraStatus === 'active' && (
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                {isListeningRef.current ? <Mic className="h-4 w-4 text-emerald-400" /> : <MicOff className="h-4 w-4 text-slate-500" />}
                Sound Sensitivity
              </label>
              <span className="text-xs text-slate-400">{(sensitivity * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.02"
              max="0.5"
              step="0.01"
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Very Sensitive</span>
              <span>Less Sensitive</span>
            </div>
          </div>
        )}

        {/* Manual Trigger Button */}
        {cameraStatus === 'active' && recordingStatus === 'listening' && (
          <Button
            onClick={triggerImpact}
            className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-bold rounded-xl"
          >
            Manual Trigger
          </Button>
        )}

        {/* Instructions */}
        {cameraStatus === 'idle' && (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-white font-semibold mb-3">How it works</h3>
            <ol className="text-slate-400 text-sm space-y-2 list-decimal list-inside">
              <li>Select tournament, archer, and starting target above</li>
              <li>Tap &quot;Start Camera&quot; to begin recording</li>
              <li>Point camera at the target — audio continuously monitored</li>
              <li>When an arrow impact is detected, a 6-second clip is saved</li>
              <li>Target number auto-advances after each successful save</li>
            </ol>
            <p className="text-slate-500 text-xs mt-3">
              Tip: Adjust sensitivity slider if triggers are too frequent or too rare.
            </p>
          </div>
        )}

        {/* Stop button */}
        {cameraStatus === 'active' && (
          <Button
            onClick={() => { stopEverything(); setCameraStatus('idle'); setRecordingStatus('idle'); setStatusMessage(''); }}
            variant="ghost"
            className="w-full mt-4 text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            Stop Camera
          </Button>
        )}
      </div>
    </Layout>
  );
}