import { useState, useEffect, useRef } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Video, AlertCircle, CheckCircle, Loader2, Eye, EyeOff, Crosshair } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

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

// Minimum clip size in bytes (50KB) - anything smaller is likely corrupted/empty
const MIN_CLIP_SIZE_BYTES = 50 * 1024;
// Cooldown duration in ms after a trigger before new triggers are accepted
// Must be longer than post-trigger recording (3s) + processing time
const TRIGGER_COOLDOWN_MS = 8000;
// Post-trigger recording duration in ms
const POST_TRIGGER_DURATION_MS = 3000;
// Motion detection interval in ms
const MOTION_DETECT_INTERVAL_MS = 150;
// Pixel intensity change threshold (0-255) to consider a pixel as "changed"
const PIXEL_CHANGE_THRESHOLD = 30;

export default function ReplayCamera() {
  const { user, token } = useAuth();
  const client = getClient();

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const motionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevFrameDataRef = useRef<Uint8Array | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const cooldownRef = useRef<boolean>(false);
  const triggerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningRef = useRef<boolean>(false);
  // Lock that prevents ANY new trigger processing while a clip is being recorded/assembled/uploaded
  const isRecordingClipRef = useRef<boolean>(false);
  // Refs to hold current values for async closures (fixes stale state in uploads)
  const targetNumberRef = useRef<number>(1);
  const selectedTournamentRef = useRef<Tournament | null>(null);
  const selectedArcherRef = useRef<Archer | null>(null);
  const selectedCourseRef = useRef<CourseConfig | null>(null);
  const tokenRef = useRef<string | null>(null);

  // State
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [sensitivity, setSensitivity] = useState(0.05); // 5% of pixels must change
  const [currentMotionLevel, setCurrentMotionLevel] = useState(0);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [coursesConfig, setCoursesConfig] = useState<CourseConfig[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseConfig | null>(null);
  const [archers, setArchers] = useState<Archer[]>([]);
  const [selectedArcher, setSelectedArcher] = useState<Archer | null>(null);
  const [targetNumber, setTargetNumber] = useState(1);
  const [clipCount, setClipCount] = useState(0);

  // Keep refs in sync with state (so async closures always get current values)
  useEffect(() => { targetNumberRef.current = targetNumber; }, [targetNumber]);
  useEffect(() => { selectedTournamentRef.current = selectedTournament; }, [selectedTournament]);
  useEffect(() => { selectedArcherRef.current = selectedArcher; }, [selectedArcher]);
  useEffect(() => { selectedCourseRef.current = selectedCourse; }, [selectedCourse]);
  useEffect(() => { tokenRef.current = token ?? null; }, [token]);

  // Fetch tournaments on mount (only if logged in)
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
    if (motionIntervalRef.current) {
      clearInterval(motionIntervalRef.current);
      motionIntervalRef.current = null;
    }
    if (dataPollingRef.current) {
      clearInterval(dataPollingRef.current);
      dataPollingRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    if (triggerTimeoutRef.current) {
      clearTimeout(triggerTimeoutRef.current);
      triggerTimeoutRef.current = null;
    }
    prevFrameDataRef.current = null;
    isListeningRef.current = false;
    isRecordingClipRef.current = false;
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

  const isIOS = (): boolean => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  const getSupportedMimeType = (): string => {
    // On iOS Safari, mp4 is the only supported format for MediaRecorder
    const iosTypes = [
      'video/mp4',
      'video/mp4;codecs=avc1',
    ];
    const defaultTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm',
      'video/mp4',
    ];
    const types = isIOS() ? iosTypes : defaultTypes;
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    // Last resort: try without specifying mimeType
    return '';
  };

  const startCamera = async () => {
    setCameraStatus('requesting');
    try {
      let stream: MediaStream;
      try {
        // First try exact 'environment' to force the rear camera on iOS
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch {
        // Fallback: some devices don't support exact constraint, use ideal instead
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      }
      streamRef.current = stream;

      // Set status to 'active' FIRST so the <video> element renders in the DOM
      setCameraStatus('active');

      // Wait a tick for React to render the video element
      await new Promise(resolve => setTimeout(resolve, 50));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // iOS Safari needs explicit play after srcObject assignment
        try {
          await videoRef.current.play();
        } catch {
          // play() can fail silently on some browsers, video should still display
        }
      }

      await requestWakeLock();
      startRecording(stream);
      // Wait for video to have dimensions before starting motion detection
      setTimeout(() => startMotionDetection(), 500);
    } catch (err) {
      console.error('Camera error:', err);
      setCameraStatus('error');
      setStatusMessage('Camera access denied. Please allow permissions and try again.');
    }
  };

  const dataPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = (stream: MediaStream) => {
    const mimeType = getSupportedMimeType();

    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      const options: MediaRecorderOptions = { videoBitsPerSecond: 2500000 };
      if (mimeType) options.mimeType = mimeType;
      recorder = new MediaRecorder(stream, options);
    } catch {
      // If options fail, try bare MediaRecorder
      try {
        recorder = new MediaRecorder(stream);
      } catch (e2) {
        console.error('MediaRecorder not supported:', e2);
        setStatusMessage('Recording not supported on this device/browser.');
        return;
      }
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
        // Keep only last 12 seconds worth of chunks (extra buffer for safety)
        if (chunksRef.current.length > 12) {
          chunksRef.current = chunksRef.current.slice(-12);
        }
      }
    };

    // On iOS, timeslice in start() is unreliable. Use requestData() polling instead.
    if (isIOS()) {
      recorder.start(); // Start without timeslice
      // Poll for data every 1 second
      dataPollingRef.current = setInterval(() => {
        if (recorder.state === 'recording') {
          try {
            recorder.requestData();
          } catch {
            // requestData may throw if recorder is in wrong state
          }
        }
      }, 1000);
    } else {
      recorder.start(1000); // 1-second chunks on non-iOS
    }

    mediaRecorderRef.current = recorder;
    setRecordingStatus('listening');
    isListeningRef.current = true;
  };

  // Use a ref for sensitivity so the motion detection loop always reads the latest value
  const sensitivityRef = useRef(sensitivity);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);

  const startMotionDetection = () => {
    // Clear any existing interval
    if (motionIntervalRef.current) {
      clearInterval(motionIntervalRef.current);
    }

    motionIntervalRef.current = setInterval(() => {
      detectMotion();
    }, MOTION_DETECT_INTERVAL_MS);
  };

  const detectMotion = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Set canvas to a reduced resolution for performance
    const analysisWidth = 160;
    const analysisHeight = 120;
    canvas.width = analysisWidth;
    canvas.height = analysisHeight;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, analysisWidth, analysisHeight);

    // Define detection zone: center 60% of the frame
    const zoneX = Math.floor(analysisWidth * 0.2);
    const zoneY = Math.floor(analysisHeight * 0.2);
    const zoneW = Math.floor(analysisWidth * 0.6);
    const zoneH = Math.floor(analysisHeight * 0.6);

    // Get pixel data from detection zone only
    const imageData = ctx.getImageData(zoneX, zoneY, zoneW, zoneH);
    const pixels = imageData.data; // RGBA array

    // Convert to grayscale array for comparison
    const totalPixels = zoneW * zoneH;
    const currentGrayscale = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      // Fast grayscale: (R + G + B) / 3
      currentGrayscale[i] = Math.round((pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3);
    }

    const prevFrame = prevFrameDataRef.current;
    if (prevFrame && prevFrame.length === totalPixels) {
      // Compare with previous frame
      let changedPixels = 0;
      for (let i = 0; i < totalPixels; i++) {
        const diff = Math.abs(currentGrayscale[i] - prevFrame[i]);
        if (diff > PIXEL_CHANGE_THRESHOLD) {
          changedPixels++;
        }
      }

      const changeRatio = changedPixels / totalPixels;
      setCurrentMotionLevel(changeRatio);

      // Check if motion exceeds threshold
      // CRITICAL: Also check isRecordingClipRef to prevent triggers during clip assembly
      if (isListeningRef.current && !cooldownRef.current && !isRecordingClipRef.current && changeRatio > sensitivityRef.current) {
        triggerImpact();
      }
    }

    // Store current frame for next comparison
    prevFrameDataRef.current = currentGrayscale;
  };

  const triggerImpact = () => {
    // Double-check the recording clip lock to prevent rapid double-triggers
    if (isRecordingClipRef.current || cooldownRef.current) {
      console.log('[ReplayCamera] Trigger ignored — clip recording in progress or cooldown active');
      return;
    }

    // Lock everything immediately
    isRecordingClipRef.current = true;
    cooldownRef.current = true;
    isListeningRef.current = false;
    setRecordingStatus('triggered');
    setStatusMessage('Motion detected! Capturing clip...');

    console.log('[ReplayCamera] Motion triggered. Recording post-impact for', POST_TRIGGER_DURATION_MS, 'ms');

    // Wait for post-impact footage. This timeout MUST NOT be cancelled by anything
    // except stopEverything() (unmount/stop button).
    triggerTimeoutRef.current = setTimeout(() => {
      console.log('[ReplayCamera] Post-trigger period complete. Generating clip...');
      generateClip();
    }, POST_TRIGGER_DURATION_MS);
  };

  const generateClip = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      console.warn('[ReplayCamera] generateClip called but recorder is inactive');
      resetAfterClip();
      return;
    }

    // Stop the data polling interval (iOS)
    if (dataPollingRef.current) {
      clearInterval(dataPollingRef.current);
      dataPollingRef.current = null;
    }

    // Request final data chunk before stopping
    try {
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
    } catch {
      // May throw on some browsers
    }

    // Small delay to allow the final ondataavailable to fire
    await new Promise(resolve => setTimeout(resolve, 200));

    // Wait for the recorder to fully stop and flush remaining data
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      try {
        recorder.stop();
      } catch {
        // If stop fails, resolve anyway
        resolve();
      }
    });

    // Take the last 6 seconds of chunks (3 before trigger + 3 after)
    const totalChunks = chunksRef.current.length;
    const clipChunks = chunksRef.current.slice(-6);
    
    console.log('[ReplayCamera] Clip generation:', {
      totalChunksInBuffer: totalChunks,
      chunksUsedForClip: clipChunks.length,
      chunkSizes: clipChunks.map(c => c.size),
    });

    if (clipChunks.length === 0) {
      console.error('[ReplayCamera] No video data captured — zero chunks available');
      setStatusMessage('No video data captured. Try again.');
      setRecordingStatus('error');
      setTimeout(() => resetAfterClip(), 3000);
      return;
    }

    const mimeType = getSupportedMimeType() || 'video/mp4';
    const clipBlob = new Blob(clipChunks, { type: mimeType });

    console.log('[ReplayCamera] Clip blob assembled:', {
      blobSize: clipBlob.size,
      blobSizeKB: (clipBlob.size / 1024).toFixed(1) + ' KB',
      mimeType: clipBlob.type,
      numChunks: clipChunks.length,
    });

    // Validate minimum clip size — too small means corrupted/empty video
    if (clipBlob.size < MIN_CLIP_SIZE_BYTES) {
      console.warn(
        `[ReplayCamera] Clip too small (${clipBlob.size} bytes / ${(clipBlob.size / 1024).toFixed(1)} KB). ` +
        `Minimum required: ${MIN_CLIP_SIZE_BYTES / 1024} KB. Likely corrupted — skipping upload.`
      );
      setStatusMessage(`Clip too small to be valid (${(clipBlob.size / 1024).toFixed(0)} KB). Try again.`);
      setRecordingStatus('error');
      toast.error('Clip discarded — too small', {
        description: `Only ${(clipBlob.size / 1024).toFixed(0)} KB captured. Ensure camera has clear view and try again.`,
        duration: 5000,
      });
      setTimeout(() => resetAfterClip(), 3000);
      return;
    }

    // Upload if context is set — use refs for current values
    if (selectedTournamentRef.current && selectedArcherRef.current) {
      await uploadClip(clipBlob);
    } else {
      setStatusMessage('Clip captured but no tournament/archer selected. Skipping upload.');
      setRecordingStatus('success');
      setTimeout(() => resetAfterClip(), 2000);
    }
  };

  const uploadClip = async (clipBlob: Blob) => {
    // Check if user is logged in before uploading
    if (!user) {
      setStatusMessage('Sign in to save clips to cloud.');
      setRecordingStatus('error');
      setTimeout(() => resetAfterClip(), 3000);
      return;
    }

    setRecordingStatus('uploading');
    setStatusMessage('Uploading replay...');

    // Read current values from refs to avoid stale closure issues
    const currentTarget = targetNumberRef.current;
    const currentTournament = selectedTournamentRef.current;
    const currentArcher = selectedArcherRef.current;
    const currentCourse = selectedCourseRef.current;
    const currentToken = tokenRef.current;
    const courseNum = currentCourse?.course || 1;
    const ext = clipBlob.type.includes('webm') ? 'webm' : 'mp4';
    // Include timestamp in object key to avoid CDN/cache issues on re-upload
    const timestamp = Date.now();
    const objectKey = `replays/${currentTournament!.id}/${currentArcher!.id}/course${courseNum}_target${currentTarget}_${timestamp}.${ext}`;

    console.log('[ReplayCamera] Starting upload:', {
      objectKey,
      blobSize: clipBlob.size,
      blobSizeKB: (clipBlob.size / 1024).toFixed(1) + ' KB',
      blobType: clipBlob.type,
      tournamentId: currentTournament!.id,
      archerId: currentArcher!.id,
      courseNum,
      targetNumber: currentTarget,
      hasToken: !!currentToken,
      timestamp,
    });

    try {
      // Step 1: Get a presigned upload URL via custom backend endpoint (bypasses OIDC auth)
      console.log('[ReplayCamera] Step 1: Getting upload URL via custom endpoint...');
      const uploadRes = await client.apiCall.invoke({
        url: '/api/v1/replays/get-upload-url',
        method: 'POST',
        data: { bucket_name: 'arrow-replays', object_key: objectKey },
        ...(currentToken ? { options: { headers: { Authorization: `Bearer ${currentToken}` } } } : {}),
      });
      const uploadUrl = uploadRes?.data?.upload_url;
      console.log('[ReplayCamera] Got upload URL:', uploadUrl ? 'yes' : 'NO', uploadUrl?.substring(0, 80));

      if (!uploadUrl) {
        throw new Error('Failed to get upload URL from storage. Bucket may not exist.');
      }

      // Step 2: Upload the file directly to the presigned URL
      console.log('[ReplayCamera] Step 2: Uploading blob via PUT...', { size: clipBlob.size });
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: clipBlob,
        headers: { 'Content-Type': clipBlob.type || 'video/mp4' },
      });
      console.log('[ReplayCamera] PUT response status:', putResponse.status);

      if (!putResponse.ok) {
        const errText = await putResponse.text().catch(() => '');
        throw new Error(`Storage PUT failed: ${putResponse.status} ${errText.substring(0, 200)}`);
      }

      // Step 3: Save metadata to database via custom API
      // The backend /save endpoint will delete the old storage file if the key changed
      console.log('[ReplayCamera] Step 3: Saving metadata to /api/v1/replays/save...');
      const savePayload = {
        tournament_id: currentTournament!.id,
        archer_id: currentArcher!.id,
        course_number: courseNum,
        target_number: currentTarget,
        object_key: objectKey,
      };
      console.log('[ReplayCamera] Save payload:', JSON.stringify(savePayload));

      const saveRes = await client.apiCall.invoke({
        url: '/api/v1/replays/save',
        method: 'POST',
        data: savePayload,
        ...(currentToken ? { options: { headers: { Authorization: `Bearer ${currentToken}` } } } : {}),
      });
      console.log('[ReplayCamera] Save response:', JSON.stringify(saveRes?.data));

      if (!saveRes?.data?.id && !saveRes?.data?.object_key) {
        console.warn('[ReplayCamera] Save response missing expected fields:', saveRes?.data);
      }

      // Small delay to ensure backend has fully committed before showing success
      await new Promise(resolve => setTimeout(resolve, 500));

      setRecordingStatus('success');
      setStatusMessage(`✓ Target ${currentTarget} replay saved!`);
      toast.success(`✓ Target ${currentTarget} replay uploaded`, {
        description: `${currentArcher?.archer_name || 'Archer'} • Course ${courseNum}`,
        duration: 4000,
      });
      setClipCount(prev => prev + 1);

      // Auto-increment target
      const maxTargets = currentCourse?.targets || 20;
      if (currentTarget < maxTargets) {
        setTargetNumber(currentTarget + 1);
      }

      setTimeout(() => resetAfterClip(), 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[ReplayCamera] Upload error:', errorMsg, err);
      setRecordingStatus('error');
      setStatusMessage(`Upload failed: ${errorMsg.substring(0, 100)}`);
      toast.error(`✗ Upload failed: Target ${currentTarget}`, {
        description: errorMsg.substring(0, 120),
        duration: 6000,
      });
      setTimeout(() => resetAfterClip(), 4000);
    }
  };

  const resetAfterClip = () => {
    // Release the clip recording lock
    isRecordingClipRef.current = false;

    // Reset previous frame data so we don't get a false trigger from the frame gap
    prevFrameDataRef.current = null;

    // Keep cooldown active for a bit longer to prevent immediate re-triggers
    setTimeout(() => {
      cooldownRef.current = false;
      console.log('[ReplayCamera] Cooldown released. Ready for next trigger.');
    }, TRIGGER_COOLDOWN_MS - POST_TRIGGER_DURATION_MS);

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
      case 'listening': return 'Watching';
      case 'triggered': return 'Triggered!';
      case 'uploading': return 'Uploading';
      case 'success': return 'Saved';
      case 'error': return 'Error';
      default: return 'Idle';
    }
  };

  const getSensitivityLabel = () => {
    if (sensitivity < 0.02) return 'Ultra';
    if (sensitivity < 0.04) return 'High';
    if (sensitivity < 0.08) return 'Medium';
    if (sensitivity < 0.15) return 'Low';
    return 'Very Low';
  };

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

        {/* Prominent Start Camera Button - shown when idle */}
        {cameraStatus === 'idle' && (
          <Button
            onClick={startCamera}
            className="w-full h-16 bg-emerald-500 hover:bg-emerald-600 text-white text-xl font-bold rounded-xl mb-6 flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20"
          >
            <Video className="h-7 w-7" />
            ▶ Start Camera
          </Button>
        )}

        {/* Not logged in notice */}
        {!user && cameraStatus === 'idle' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-amber-300 text-sm">Sign in to save replay clips to cloud storage.</p>
            </div>
            <Button onClick={() => window.location.href = '/landing'} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs">
              Sign In
            </Button>
          </div>
        )}

        {/* Context Selection Bar - only show when logged in */}
        {user && cameraStatus !== 'error' && (
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
        )}

        {/* Hidden canvas for motion detection frame analysis */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Camera View */}
        {cameraStatus !== 'idle' && (
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
                ) : null}
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

                {/* Detection zone indicator (center 60%) */}
                <div className="absolute inset-0 pointer-events-none">
                  <div
                    className="absolute border border-emerald-400/30 rounded"
                    style={{ top: '20%', left: '20%', width: '60%', height: '60%' }}
                  />
                </div>

                {/* Motion level meter */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-white/70" />
                  <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-150 ${currentMotionLevel > sensitivity ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${Math.min(currentMotionLevel * 1000, 100)}%` }}
                    />
                  </div>
                  <span className="text-white/50 text-xs min-w-[3rem] text-right">
                    {(currentMotionLevel * 100).toFixed(1)}%
                  </span>
                </div>
              </>
            )}
          </div>
        )}

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

        {/* MANUAL CAPTURE BUTTON — always visible when camera active and listening */}
        {cameraStatus === 'active' && recordingStatus === 'listening' && (
          <Button
            onClick={triggerImpact}
            className="w-full h-20 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xl font-bold rounded-xl mb-4 shadow-lg shadow-amber-500/30 flex items-center justify-center gap-3 active:scale-95 transition-transform"
          >
            <Crosshair className="h-8 w-8" />
            CAPTURE NOW
          </Button>
        )}

        {/* Motion Sensitivity Control */}
        {cameraStatus === 'active' && (
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                {isListeningRef.current ? <Eye className="h-4 w-4 text-emerald-400" /> : <EyeOff className="h-4 w-4 text-slate-500" />}
                Motion Sensitivity
              </label>
              <span className="text-xs text-slate-400">
                {getSensitivityLabel()}
                {' '}({(sensitivity * 100).toFixed(1)}%)
              </span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.25"
              step="0.005"
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>More Sensitive (1%)</span>
              <span>Less Sensitive (25%)</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Detects visual changes in center 60% of frame. Lower = more sensitive to small movements like arrows hitting the target.
            </p>
          </div>
        )}

        {/* Instructions - shown when camera is idle */}
        {cameraStatus === 'idle' && (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-white font-semibold mb-3">How it works</h3>
            <ol className="text-slate-400 text-sm space-y-2 list-decimal list-inside">
              <li>Tap &quot;Start Camera&quot; above to begin recording</li>
              <li>Point camera at the target — motion in the center zone is monitored</li>
              <li>When an arrow impact is visually detected, a 6-second clip is saved</li>
              <li>Sign in and select tournament/archer to auto-upload clips</li>
              <li>Target number auto-advances after each successful save</li>
            </ol>
            <p className="text-slate-500 text-xs mt-3">
              Tip: Keep the camera steady and aimed at the target face. The detection zone (center 60%) should cover the target. Use &quot;Capture Now&quot; as a manual backup.
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