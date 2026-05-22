import { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Video, AlertCircle, CheckCircle, Loader2, Eye, EyeOff, Crosshair, Camera } from 'lucide-react';
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

// Detection state machine
type DetectionState = 'WARMUP' | 'STABILIZING' | 'WATCHING' | 'TRIGGERED';

// Minimum clip size in bytes (5KB) - lowered to avoid discarding valid compressed clips
const MIN_CLIP_SIZE_BYTES = 5 * 1024;
// Post-trigger recording duration in ms (4s to ensure enough data)
const POST_TRIGGER_DURATION_MS = 4000;
// Motion detection interval in ms (faster for arrow detection)
const MOTION_DETECT_INTERVAL_MS = 50;
// Analysis canvas dimensions (increased for close-range arrow detection at 2ft)
const ANALYSIS_WIDTH = 240;
const ANALYSIS_HEIGHT = 180;
// Rolling average window size (number of frames to track)
const ROLLING_WINDOW_SIZE = 20;
// Time scene must be stable before entering WATCHING state (ms) — increased for outdoor use
const STABILIZE_DURATION_MS = 3000;
// Shake threshold - rolling average above this means camera is shaking (2% for outdoor light variation)
const SHAKE_THRESHOLD = 0.02;
// Default trigger sensitivity (global baseline comparison threshold) — 1% for better arrow detection
const DEFAULT_SENSITIVITY = 0.01;
// Camera warmup duration in ms (let auto-exposure/focus settle)
const WARMUP_DURATION_MS = 5000;
// Baseline refresh interval when stable (ms) — refresh every 10s to give more time for arrow detection
const BASELINE_REFRESH_INTERVAL_MS = 10000;
// Default detection zone size (percentage of frame center to analyze)
const DEFAULT_ZONE_SIZE = 0.5; // 50%

// Grid-based detection constants
const GRID_COLS = 6;
const GRID_ROWS = 4;
const GRID_CELL_THRESHOLD = 0.10; // 10% of pixels in a single cell must change to trigger (lowered for close-range)

// Frame-to-frame spike detection constants
const SPIKE_LOW_THRESHOLD = 0.005; // Previous frame-to-frame motion must be below this (0.5%)
const SPIKE_HIGH_THRESHOLD = 0.02; // Current frame-to-frame motion must exceed this (2%) for spike trigger

// Periodic logging interval (ms)
const LOG_INTERVAL_MS = 1000;

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
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const triggerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningRef = useRef<boolean>(false);
  // Lock that prevents ANY new trigger processing while a clip is being recorded/assembled/uploaded
  const isRecordingClipRef = useRef<boolean>(false);

  // Detection state machine refs
  const detectionStateRef = useRef<DetectionState>('WARMUP');
  const baselineFrameRef = useRef<Uint8Array | null>(null);
  const prevFrameDataRef = useRef<Uint8Array | null>(null);
  const rollingMotionRef = useRef<number[]>([]);
  const stableStartTimeRef = useRef<number | null>(null);
  const baselineAgeRef = useRef<number>(0); // ms since baseline was set

  // Frame-to-frame spike detection refs
  const prevFrameToFrameMotionRef = useRef<number>(0);
  const lastLogTimeRef = useRef<number>(0);

  // Debug view refs
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  // Warmup refs
  const warmupCompleteRef = useRef<boolean>(false);
  const warmupStartTimeRef = useRef<number>(0);

  // Refs to hold current values for async closures
  const targetNumberRef = useRef<number>(1);
  const selectedTournamentRef = useRef<Tournament | null>(null);
  const selectedArcherRef = useRef<Archer | null>(null);
  const selectedCourseRef = useRef<CourseConfig | null>(null);
  const tokenRef = useRef<string | null>(null);

  // State
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY);
  const [zoneSize, setZoneSize] = useState(DEFAULT_ZONE_SIZE);
  const [currentMotionLevel, setCurrentMotionLevel] = useState(0);
  const [detectionState, setDetectionState] = useState<DetectionState>('WARMUP');
  const [baselineAge, setBaselineAge] = useState(0);
  const [warmupCountdown, setWarmupCountdown] = useState(0);
  const [triggeredCell, setTriggeredCell] = useState<{ col: number; row: number; pct: number } | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [coursesConfig, setCoursesConfig] = useState<CourseConfig[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseConfig | null>(null);
  const [archers, setArchers] = useState<Archer[]>([]);
  const [selectedArcher, setSelectedArcher] = useState<Archer | null>(null);
  const [targetNumber, setTargetNumber] = useState(1);
  const [clipCount, setClipCount] = useState(0);
  const [debugView, setDebugView] = useState(false);
  const debugViewRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { targetNumberRef.current = targetNumber; }, [targetNumber]);
  useEffect(() => { selectedTournamentRef.current = selectedTournament; }, [selectedTournament]);
  useEffect(() => { selectedArcherRef.current = selectedArcher; }, [selectedArcher]);
  useEffect(() => { selectedCourseRef.current = selectedCourse; }, [selectedCourse]);
  useEffect(() => { tokenRef.current = token ?? null; }, [token]);

  // Use refs for sensitivity and zone size so the motion detection loop always reads the latest value
  const sensitivityRef = useRef(sensitivity);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  const zoneSizeRef = useRef(zoneSize);
  useEffect(() => { zoneSizeRef.current = zoneSize; }, [zoneSize]);
  useEffect(() => { debugViewRef.current = debugView; }, [debugView]);

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

  const dataPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warmupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopEverything = () => {
    if (motionIntervalRef.current) {
      clearInterval(motionIntervalRef.current);
      motionIntervalRef.current = null;
    }
    if (dataPollingRef.current) {
      clearInterval(dataPollingRef.current);
      dataPollingRef.current = null;
    }
    if (warmupIntervalRef.current) {
      clearInterval(warmupIntervalRef.current);
      warmupIntervalRef.current = null;
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
    baselineFrameRef.current = null;
    rollingMotionRef.current = [];
    stableStartTimeRef.current = null;
    detectionStateRef.current = 'WARMUP';
    isListeningRef.current = false;
    isRecordingClipRef.current = false;
    warmupCompleteRef.current = false;
    prevFrameToFrameMotionRef.current = 0;
    lastLogTimeRef.current = 0;
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
    const iosTypes = ['video/mp4', 'video/mp4;codecs=avc1'];
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
    return '';
  };

  const startCamera = async () => {
    setCameraStatus('requesting');
    try {
      let stream: MediaStream;
      // Request high frame rate for better replay quality (120fps ideal, min 30fps)
      const videoConstraints = {
        facingMode: { ideal: 'environment' },
        frameRate: { ideal: 120, min: 30 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { ...videoConstraints, facingMode: { exact: 'environment' } },
          audio: true,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: true,
        });
      }
      streamRef.current = stream;
      setCameraStatus('active');

      await new Promise(resolve => setTimeout(resolve, 50));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // play() can fail silently
        }
      }

      await requestWakeLock();
      startRecording(stream);
      // Start warmup countdown — do NOT start motion detection yet
      startWarmup();
    } catch (err) {
      console.error('Camera error:', err);
      setCameraStatus('error');
      setStatusMessage('Camera access denied. Please allow permissions and try again.');
    }
  };

  const startWarmup = () => {
    warmupCompleteRef.current = false;
    warmupStartTimeRef.current = Date.now();
    detectionStateRef.current = 'WARMUP';
    setDetectionState('WARMUP');
    setWarmupCountdown(Math.ceil(WARMUP_DURATION_MS / 1000));

    // Update countdown every second
    warmupIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - warmupStartTimeRef.current;
      const remaining = Math.max(0, Math.ceil((WARMUP_DURATION_MS - elapsed) / 1000));
      setWarmupCountdown(remaining);

      if (elapsed >= WARMUP_DURATION_MS) {
        // Warmup complete — start motion detection
        if (warmupIntervalRef.current) {
          clearInterval(warmupIntervalRef.current);
          warmupIntervalRef.current = null;
        }
        warmupCompleteRef.current = true;
        detectionStateRef.current = 'STABILIZING';
        setDetectionState('STABILIZING');
        console.log('[ReplayCamera] Warmup complete — starting motion detection');
        startMotionDetection();
      }
    }, 200);
  };

  const startRecording = (stream: MediaStream) => {
    const mimeType = getSupportedMimeType();

    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      const options: MediaRecorderOptions = { videoBitsPerSecond: 2500000 };
      if (mimeType) options.mimeType = mimeType;
      recorder = new MediaRecorder(stream, options);
    } catch {
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
        // Keep only last 12 seconds worth of chunks
        if (chunksRef.current.length > 12) {
          chunksRef.current = chunksRef.current.slice(-12);
        }
      }
    };

    if (isIOS()) {
      recorder.start();
      dataPollingRef.current = setInterval(() => {
        if (recorder.state === 'recording') {
          try { recorder.requestData(); } catch { /* ignore */ }
        }
      }, 1000);
    } else {
      recorder.start(1000);
    }

    mediaRecorderRef.current = recorder;
    setRecordingStatus('listening');
    isListeningRef.current = true;

    // Reset detection state (but keep warmup if still warming up)
    if (warmupCompleteRef.current) {
      detectionStateRef.current = 'STABILIZING';
      setDetectionState('STABILIZING');
    }
    baselineFrameRef.current = null;
    prevFrameDataRef.current = null;
    rollingMotionRef.current = [];
    stableStartTimeRef.current = null;
  };

  const startMotionDetection = () => {
    if (motionIntervalRef.current) {
      clearInterval(motionIntervalRef.current);
    }
    motionIntervalRef.current = setInterval(() => {
      detectMotion();
    }, MOTION_DETECT_INTERVAL_MS);
  };

  const getRollingAverage = useCallback((): number => {
    const arr = rollingMotionRef.current;
    if (arr.length === 0) return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum / arr.length;
  }, []);

  const detectMotion = () => {
    // Don't analyze during warmup
    if (!warmupCompleteRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = ANALYSIS_WIDTH;
    canvas.height = ANALYSIS_HEIGHT;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);

    // Detection zone: center portion based on zoneSize setting
    const currentZoneSize = zoneSizeRef.current;
    const margin = (1 - currentZoneSize) / 2;
    const zoneX = Math.floor(ANALYSIS_WIDTH * margin);
    const zoneY = Math.floor(ANALYSIS_HEIGHT * margin);
    const zoneW = Math.floor(ANALYSIS_WIDTH * currentZoneSize);
    const zoneH = Math.floor(ANALYSIS_HEIGHT * currentZoneSize);

    const imageData = ctx.getImageData(zoneX, zoneY, zoneW, zoneH);
    const pixels = imageData.data;

    // Convert to grayscale at full resolution within the zone (no subsampling for better arrow detection)
    const totalPixels = zoneW * zoneH;
    const currentGrayscale = new Uint8Array(totalPixels);

    for (let i = 0; i < totalPixels; i++) {
      const pixelIdx = i * 4;
      currentGrayscale[i] = Math.round(
        (pixels[pixelIdx] + pixels[pixelIdx + 1] + pixels[pixelIdx + 2]) / 3
      );
    }

    const prevFrame = prevFrameDataRef.current;
    const now = Date.now();

    // --- Frame-to-frame motion (for shake detection AND spike detection) ---
    let frameToFrameMotion = 0;
    if (prevFrame && prevFrame.length === totalPixels) {
      let diffSum = 0;
      for (let i = 0; i < totalPixels; i++) {
        diffSum += Math.abs(currentGrayscale[i] - prevFrame[i]);
      }
      // Normalize: max possible diff per pixel is 255, so ratio = diffSum / (totalPixels * 255)
      frameToFrameMotion = diffSum / (totalPixels * 255);
    }

    // --- Baseline comparison (for impact detection) ---
    let baselineMotion = 0;
    let cellTriggered: { col: number; row: number; pct: number } | null = null;
    let maxCellPct = 0;
    const baseline = baselineFrameRef.current;

    if (baseline && baseline.length === totalPixels) {
      let globalDiffSum = 0;

      // Grid-based detection: divide zone into GRID_COLS x GRID_ROWS cells
      const cellW = Math.floor(zoneW / GRID_COLS);
      const cellH = Math.floor(zoneH / GRID_ROWS);
      const pixelDiffThreshold = 15; // lowered from 30 for black target with subtle changes

      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const cellStartX = col * cellW;
          const cellStartY = row * cellH;
          let cellChangedPixels = 0;
          const cellTotalPixels = cellW * cellH;

          for (let cy = 0; cy < cellH; cy++) {
            for (let cx = 0; cx < cellW; cx++) {
              const idx = (cellStartY + cy) * zoneW + (cellStartX + cx);
              const diff = Math.abs(currentGrayscale[idx] - baseline[idx]);
              globalDiffSum += diff;
              if (diff > pixelDiffThreshold) {
                cellChangedPixels++;
              }
            }
          }

          const cellPct = cellChangedPixels / cellTotalPixels;
          if (cellPct > maxCellPct) maxCellPct = cellPct;

          // If any single cell exceeds the cell threshold, we have a localized trigger
          if (cellPct > GRID_CELL_THRESHOLD) {
            if (!cellTriggered || cellPct > cellTriggered.pct) {
              cellTriggered = { col, row, pct: cellPct };
            }
          }
        }
      }

      baselineMotion = globalDiffSum / (totalPixels * 255);

      // Debug view: render difference image to debug canvas
      if (debugViewRef.current && debugCanvasRef.current) {
        const debugCtx = debugCanvasRef.current.getContext('2d');
        if (debugCtx) {
          debugCanvasRef.current.width = zoneW;
          debugCanvasRef.current.height = zoneH;
          const debugImageData = debugCtx.createImageData(zoneW, zoneH);
          for (let i = 0; i < totalPixels; i++) {
            const diff = Math.abs(currentGrayscale[i] - baseline[i]);
            // Amplify difference for visibility (multiply by 4, cap at 255)
            const amplified = Math.min(diff * 4, 255);
            const pixIdx = i * 4;
            // Show differences as green on black (changed pixels bright green)
            debugImageData.data[pixIdx] = 0;
            debugImageData.data[pixIdx + 1] = amplified;
            debugImageData.data[pixIdx + 2] = 0;
            debugImageData.data[pixIdx + 3] = 255;
          }
          debugCtx.putImageData(debugImageData, 0, 0);
        }
      }

      if (cellTriggered) {
        console.log(
          `[ReplayCamera] Cell trigger: col=${cellTriggered.col}, row=${cellTriggered.row}, ` +
          `${(cellTriggered.pct * 100).toFixed(1)}% changed (threshold: ${(GRID_CELL_THRESHOLD * 100).toFixed(0)}%)`
        );
      }
    }

    // Update rolling motion window
    rollingMotionRef.current.push(frameToFrameMotion);
    if (rollingMotionRef.current.length > ROLLING_WINDOW_SIZE) {
      rollingMotionRef.current.shift();
    }

    const rollingAvg = getRollingAverage();

    // Update UI state (use baseline motion for the meter since that's what triggers)
    setCurrentMotionLevel(baselineMotion);

    // Update baseline age
    baselineAgeRef.current += MOTION_DETECT_INTERVAL_MS;
    // Update displayed baseline age every ~500ms to avoid too many re-renders
    if (baselineAgeRef.current % 500 < MOTION_DETECT_INTERVAL_MS) {
      setBaselineAge(baselineAgeRef.current);
    }

    // --- Periodic logging (every 1 second) ---
    if (now - lastLogTimeRef.current >= LOG_INTERVAL_MS) {
      lastLogTimeRef.current = now;
      const currentState = detectionStateRef.current;
      console.log(
        `[ReplayCamera] [${currentState}] global: ${(baselineMotion * 100).toFixed(2)}% | ` +
        `maxCell: ${(maxCellPct * 100).toFixed(1)}% | f2f: ${(frameToFrameMotion * 100).toFixed(2)}% | ` +
        `prevF2F: ${(prevFrameToFrameMotionRef.current * 100).toFixed(2)}% | ` +
        `rolling: ${(rollingAvg * 100).toFixed(2)}% | baseline age: ${Math.floor(baselineAgeRef.current / 1000)}s`
      );
    }

    // --- State machine logic ---
    const currentState = detectionStateRef.current;

    if (currentState === 'STABILIZING') {
      // Check if scene has been stable long enough to transition to WATCHING
      if (rollingAvg < SHAKE_THRESHOLD && rollingMotionRef.current.length >= 5) {
        if (stableStartTimeRef.current === null) {
          stableStartTimeRef.current = now;
        } else if (now - stableStartTimeRef.current >= STABILIZE_DURATION_MS) {
          // Scene has been stable for required duration — update baseline and enter WATCHING
          baselineFrameRef.current = new Uint8Array(currentGrayscale);
          baselineAgeRef.current = 0;
          setBaselineAge(0);
          detectionStateRef.current = 'WATCHING';
          setDetectionState('WATCHING');
          stableStartTimeRef.current = null;
          setTriggeredCell(null);
          prevFrameToFrameMotionRef.current = 0;
          console.log('[ReplayCamera] State: STABILIZING → WATCHING (baseline set)');
        }
      } else {
        // Reset stable timer if motion detected
        stableStartTimeRef.current = null;
      }
    } else if (currentState === 'WATCHING') {
      // If camera starts shaking (rolling avg exceeds shake threshold), go back to STABILIZING
      if (rollingAvg > SHAKE_THRESHOLD * 2) {
        detectionStateRef.current = 'STABILIZING';
        setDetectionState('STABILIZING');
        stableStartTimeRef.current = null;
        setTriggeredCell(null);
        console.log('[ReplayCamera] State: WATCHING → STABILIZING (shake detected)');
        prevFrameToFrameMotionRef.current = frameToFrameMotion;
        prevFrameDataRef.current = currentGrayscale;
        return;
      }

      // Continuously update baseline if scene remains very stable
      // Refresh every BASELINE_REFRESH_INTERVAL_MS to handle gradual outdoor light changes
      if (rollingAvg < SHAKE_THRESHOLD * 0.5 && baselineAgeRef.current > BASELINE_REFRESH_INTERVAL_MS) {
        baselineFrameRef.current = new Uint8Array(currentGrayscale);
        baselineAgeRef.current = 0;
        setBaselineAge(0);
      }

      // Check for impact using TRIPLE trigger strategy:
      // 1. Global: baseline motion exceeds sensitivity threshold (catches large changes)
      // 2. Grid cell: ANY single cell has >10% changed pixels (catches thin objects like arrows)
      // 3. Frame-to-frame spike: sudden jump from <0.5% to >2% (catches target vibration on impact)
      if (
        isListeningRef.current &&
        !isRecordingClipRef.current &&
        rollingAvg < SHAKE_THRESHOLD
      ) {
        const globalTrigger = baselineMotion > sensitivityRef.current;
        const cellTrigger = cellTriggered !== null;

        // NEW: Frame-to-frame spike detection
        // If previous f2f was very low (still scene) and current f2f suddenly jumps high → impact vibration
        const spikeTrigger = (
          prevFrameToFrameMotionRef.current < SPIKE_LOW_THRESHOLD &&
          frameToFrameMotion > SPIKE_HIGH_THRESHOLD
        );

        if (spikeTrigger) {
          console.log(
            `[ReplayCamera] TRIGGER via frame-to-frame SPIKE: ` +
            `prev=${(prevFrameToFrameMotionRef.current * 100).toFixed(2)}% → ` +
            `curr=${(frameToFrameMotion * 100).toFixed(2)}% (threshold: ${(SPIKE_HIGH_THRESHOLD * 100).toFixed(1)}%)`
          );
          triggerImpact();
          prevFrameToFrameMotionRef.current = frameToFrameMotion;
          prevFrameDataRef.current = currentGrayscale;
          return;
        }

        if (globalTrigger || cellTrigger) {
          // Additional check: the frame-to-frame motion for THIS frame should be notable
          // (distinguishes "arrow appeared" from gradual drift)
          // Use a very low threshold for cell triggers since arrows are thin
          const f2fThreshold = cellTrigger
            ? sensitivityRef.current * 0.1  // Very low for cell-based (arrow) triggers
            : sensitivityRef.current * 0.3; // Normal for global triggers

          if (frameToFrameMotion > f2fThreshold) {
            if (cellTrigger && cellTriggered) {
              setTriggeredCell(cellTriggered);
              console.log(
                `[ReplayCamera] TRIGGER via grid cell [${cellTriggered.col},${cellTriggered.row}] ` +
                `at ${(cellTriggered.pct * 100).toFixed(1)}% | global: ${(baselineMotion * 100).toFixed(2)}%`
              );
            } else {
              console.log(
                `[ReplayCamera] TRIGGER via global threshold: ${(baselineMotion * 100).toFixed(2)}% > ${(sensitivityRef.current * 100).toFixed(2)}%`
              );
            }
            triggerImpact();
            prevFrameToFrameMotionRef.current = frameToFrameMotion;
            prevFrameDataRef.current = currentGrayscale;
            return;
          }
        }
      }
    }
    // TRIGGERED state: do nothing, wait for clip to finish

    // Track previous frame-to-frame motion for spike detection
    prevFrameToFrameMotionRef.current = frameToFrameMotion;

    // Store current frame for next comparison
    prevFrameDataRef.current = currentGrayscale;
  };

  const triggerImpact = () => {
    if (isRecordingClipRef.current) {
      console.log('[ReplayCamera] Trigger ignored — clip recording in progress');
      return;
    }

    // Lock everything immediately
    isRecordingClipRef.current = true;
    isListeningRef.current = false;
    detectionStateRef.current = 'TRIGGERED';
    setDetectionState('TRIGGERED');
    setRecordingStatus('triggered');
    setStatusMessage('Impact detected! Capturing clip...');

    console.log('[ReplayCamera] Impact triggered. Recording post-impact for', POST_TRIGGER_DURATION_MS, 'ms');

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

    if (dataPollingRef.current) {
      clearInterval(dataPollingRef.current);
      dataPollingRef.current = null;
    }

    try {
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
    } catch {
      // May throw on some browsers
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });

    const totalChunks = chunksRef.current.length;
    // Use last 7 chunks (~7s of video: 3s pre + 4s post)
    const clipChunks = chunksRef.current.slice(-7);

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

    if (selectedTournamentRef.current && selectedArcherRef.current) {
      await uploadClip(clipBlob);
    } else {
      setStatusMessage('Clip captured but no tournament/archer selected. Skipping upload.');
      setRecordingStatus('success');
      setTimeout(() => resetAfterClip(), 2000);
    }
  };

  const uploadClip = async (clipBlob: Blob) => {
    if (!user) {
      setStatusMessage('Sign in to save clips to cloud.');
      setRecordingStatus('error');
      setTimeout(() => resetAfterClip(), 3000);
      return;
    }

    setRecordingStatus('uploading');
    setStatusMessage('Uploading replay...');

    const currentTarget = targetNumberRef.current;
    const currentTournament = selectedTournamentRef.current;
    const currentArcher = selectedArcherRef.current;
    const currentCourse = selectedCourseRef.current;
    const currentToken = tokenRef.current;
    const courseNum = currentCourse?.course || 1;
    const ext = clipBlob.type.includes('webm') ? 'webm' : 'mp4';
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

      await new Promise(resolve => setTimeout(resolve, 500));

      setRecordingStatus('success');
      setStatusMessage(`✓ Target ${currentTarget} replay saved!`);
      toast.success(`✓ Target ${currentTarget} replay uploaded`, {
        description: `${currentArcher?.archer_name || 'Archer'} • Course ${courseNum}`,
        duration: 4000,
      });
      setClipCount(prev => prev + 1);

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

    // Reset detection state — force back to STABILIZING so camera must be still before next trigger
    prevFrameDataRef.current = null;
    baselineFrameRef.current = null;
    rollingMotionRef.current = [];
    stableStartTimeRef.current = null;
    detectionStateRef.current = 'STABILIZING';
    setDetectionState('STABILIZING');
    baselineAgeRef.current = 0;
    setBaselineAge(0);
    setTriggeredCell(null);

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

  const getDetectionStateColor = () => {
    switch (detectionState) {
      case 'WATCHING': return 'bg-emerald-500';
      case 'STABILIZING': return 'bg-amber-500';
      case 'WARMUP': return 'bg-blue-500';
      case 'TRIGGERED': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  };

  const getDetectionStateLabel = () => {
    switch (detectionState) {
      case 'WATCHING': return 'Watching';
      case 'STABILIZING': return 'Stabilizing...';
      case 'WARMUP': return `Warming up... (${warmupCountdown}s)`;
      case 'TRIGGERED': return 'Recording!';
      default: return 'Idle';
    }
  };

  const getStatusColor = () => {
    switch (recordingStatus) {
      case 'listening': return 'bg-emerald-500';
      case 'triggered': return 'bg-red-500';
      case 'uploading': return 'bg-blue-500';
      case 'success': return 'bg-emerald-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  };

  const getStatusLabel = () => {
    switch (recordingStatus) {
      case 'listening': return getDetectionStateLabel();
      case 'triggered': return 'Recording!';
      case 'uploading': return 'Uploading';
      case 'success': return 'Saved';
      case 'error': return 'Error';
      default: return 'Idle';
    }
  };

  const getSensitivityLabel = () => {
    if (sensitivity < 0.005) return 'Ultra';
    if (sensitivity < 0.01) return 'Very High';
    if (sensitivity < 0.02) return 'High';
    if (sensitivity < 0.04) return 'Medium';
    if (sensitivity < 0.07) return 'Low';
    return 'Very Low';
  };

  const getZoneSizeLabel = () => {
    const pct = Math.round(zoneSize * 100);
    if (pct <= 40) return 'Tight';
    if (pct <= 60) return 'Medium';
    if (pct <= 75) return 'Wide';
    return 'Full';
  };

  const formatBaselineAge = () => {
    if (!baselineFrameRef.current) return 'None';
    const seconds = Math.floor(baselineAge / 1000);
    if (seconds < 1) return 'Just set';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  // Suppress unused variable warnings for functions used in JSX
  void getStatusColor;

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
                {/* Warmup overlay */}
                {detectionState === 'WARMUP' && (
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center z-10">
                    <Camera className="h-12 w-12 text-blue-400 mb-3 animate-pulse" />
                    <p className="text-white text-lg font-semibold">Camera warming up...</p>
                    <p className="text-blue-300 text-3xl font-bold mt-2">{warmupCountdown}s</p>
                    <p className="text-slate-400 text-sm mt-2">Auto-exposure & focus settling</p>
                  </div>
                )}

                {/* Top-left detection state badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
                  <div className={`w-3 h-3 rounded-full ${getDetectionStateColor()} ${detectionState === 'WATCHING' ? 'animate-pulse' : ''}`} />
                  <span className="text-white text-sm font-medium bg-black/50 px-2 py-0.5 rounded">
                    {getStatusLabel()}
                  </span>
                </div>

                {/* Top-right target info + baseline age */}
                <div className="absolute top-3 right-3 flex flex-col items-end gap-1 z-20">
                  <div className="bg-black/50 px-3 py-1 rounded text-white text-sm">
                    T{targetNumber} {selectedArcher ? `• ${selectedArcher.archer_name}` : ''}
                  </div>
                  {detectionState !== 'WARMUP' && (
                    <div className="bg-black/50 px-2 py-0.5 rounded text-slate-300 text-xs">
                      Baseline: {formatBaselineAge()}
                    </div>
                  )}
                </div>

                {/* Detection zone indicator with grid overlay */}
                {detectionState !== 'WARMUP' && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div
                      className={`absolute border rounded transition-colors duration-300 ${
                        detectionState === 'WATCHING' ? 'border-emerald-400/40' :
                        detectionState === 'TRIGGERED' ? 'border-red-400/60' :
                        'border-amber-400/30'
                      }`}
                      style={{
                        top: `${((1 - zoneSize) / 2) * 100}%`,
                        left: `${((1 - zoneSize) / 2) * 100}%`,
                        width: `${zoneSize * 100}%`,
                        height: `${zoneSize * 100}%`,
                      }}
                    >
                      {/* Grid lines inside detection zone */}
                      {detectionState === 'WATCHING' && (
                        <div className="absolute inset-0 grid opacity-20" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)` }}>
                          {Array.from({ length: GRID_COLS * GRID_ROWS }).map((_, i) => {
                            const col = i % GRID_COLS;
                            const row = Math.floor(i / GRID_COLS);
                            const isTriggeredCell = triggeredCell && triggeredCell.col === col && triggeredCell.row === row;
                            return (
                              <div
                                key={i}
                                className={`border border-emerald-400/30 ${isTriggeredCell ? '!bg-red-500/40 !border-red-400' : ''}`}
                              />
                            );
                          })}
                        </div>
                      )}
                      {/* Show triggered cell highlight */}
                      {triggeredCell && detectionState === 'TRIGGERED' && (
                        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)` }}>
                          {Array.from({ length: GRID_COLS * GRID_ROWS }).map((_, i) => {
                            const col = i % GRID_COLS;
                            const row = Math.floor(i / GRID_COLS);
                            const isTriggeredCell = triggeredCell.col === col && triggeredCell.row === row;
                            return (
                              <div
                                key={i}
                                className={`border border-transparent ${isTriggeredCell ? 'bg-red-500/50 border-red-400 animate-pulse' : ''}`}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Debug View PiP overlay */}
                {debugView && detectionState !== 'WARMUP' && (
                  <div className="absolute bottom-14 right-3 z-30 border border-emerald-400/60 rounded overflow-hidden shadow-lg">
                    <canvas
                      ref={debugCanvasRef}
                      className="w-[120px] h-[90px] bg-black"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    <div className="absolute top-0 left-0 bg-black/70 px-1 text-[9px] text-emerald-300 font-mono">
                      DIFF VIEW
                    </div>
                  </div>
                )}

                {/* Motion level meter with cell trigger indicator */}
                {detectionState !== 'WARMUP' && (
                  <div className="absolute bottom-3 left-3 right-3">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-white/70" />
                      <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden relative">
                        {/* Threshold marker */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-10"
                          style={{ left: `${Math.min(sensitivity * 1000, 100)}%` }}
                        />
                        <div
                          className={`h-full rounded-full transition-all duration-100 ${
                            currentMotionLevel > sensitivity ? 'bg-red-400' :
                            detectionState === 'WATCHING' ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                          style={{ width: `${Math.min(currentMotionLevel * 1000, 100)}%` }}
                        />
                      </div>
                      <span className="text-white/50 text-xs min-w-[3rem] text-right">
                        {(currentMotionLevel * 100).toFixed(1)}%
                      </span>
                    </div>
                    {/* Cell trigger indicator */}
                    {triggeredCell && (
                      <div className="mt-1 text-xs text-red-300 bg-black/50 px-2 py-0.5 rounded inline-block">
                        Cell [{triggeredCell.col},{triggeredCell.row}] triggered ({(triggeredCell.pct * 100).toFixed(0)}%)
                      </div>
                    )}
                  </div>
                )}
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
        {cameraStatus === 'active' && recordingStatus === 'listening' && detectionState !== 'WARMUP' && (
          <Button
            onClick={triggerImpact}
            className="w-full h-20 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xl font-bold rounded-xl mb-4 shadow-lg shadow-amber-500/30 flex items-center justify-center gap-3 active:scale-95 transition-transform"
          >
            <Crosshair className="h-8 w-8" />
            CAPTURE NOW
          </Button>
        )}

        {/* Motion Sensitivity & Detection Zone Controls */}
        {cameraStatus === 'active' && (
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4">
            {/* Trigger Sensitivity */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  {detectionState === 'WATCHING' ? <Eye className="h-4 w-4 text-emerald-400" /> : <EyeOff className="h-4 w-4 text-amber-400" />}
                  Trigger Sensitivity
                </label>
                <span className="text-xs text-slate-400">
                  {getSensitivityLabel()}
                  {' '}({(sensitivity * 100).toFixed(1)}%)
                </span>
              </div>
              <input
                type="range"
                min="0.003"
                max="0.10"
                step="0.001"
                value={sensitivity}
                onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Lower = more sensitive (0.3%)</span>
                <span>Higher = less sensitive (10%)</span>
              </div>
            </div>

            {/* Detection Zone Size */}
            <div className="mb-4 pt-3 border-t border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-blue-400" />
                  Detection Zone
                </label>
                <span className="text-xs text-slate-400">
                  {getZoneSizeLabel()} ({Math.round(zoneSize * 100)}%)
                </span>
              </div>
              <input
                type="range"
                min="0.3"
                max="0.9"
                step="0.05"
                value={zoneSize}
                onChange={(e) => setZoneSize(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Tight (target only)</span>
                <span>Wide (full frame)</span>
              </div>
            </div>

            {/* Debug View Toggle */}
            <div className="mb-4 pt-3 border-t border-slate-700/50">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-purple-400" />
                  Debug View
                </label>
                <Button
                  size="sm"
                  variant={debugView ? 'default' : 'outline'}
                  onClick={() => setDebugView(!debugView)}
                  className={`text-xs h-7 ${debugView ? 'bg-purple-500 hover:bg-purple-600 text-white' : 'border-slate-600 text-slate-400 hover:text-white'}`}
                >
                  {debugView ? 'ON' : 'OFF'}
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Shows what the detection system &quot;sees&quot; — green pixels = change from baseline. Use to verify camera alignment with target.
              </p>
            </div>

            <p className="text-xs text-slate-500">
              <strong>Triple detection:</strong> Triggers on global motion, localized cell change ({GRID_COLS}×{GRID_ROWS} grid, {Math.round(GRID_CELL_THRESHOLD * 100)}% threshold), OR frame-to-frame spike (sudden motion jump from stillness). Pixel threshold: {15} brightness units. Optimized for close-range (2ft) black target with white center.
            </p>
            {/* Detection state info */}
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-700/50">
              <div className={`w-2.5 h-2.5 rounded-full ${getDetectionStateColor()}`} />
              <span className="text-xs text-slate-400">
                {detectionState === 'WARMUP' && `Camera warming up (${warmupCountdown}s) — auto-exposure settling...`}
                {detectionState === 'STABILIZING' && 'Waiting for camera to stabilize (hold still ~3s)...'}
                {detectionState === 'WATCHING' && 'Baseline set — watching for arrow impact (grid + global)'}
                {detectionState === 'TRIGGERED' && 'Impact detected — recording clip...'}
              </span>
            </div>
          </div>
        )}

        {/* Instructions - shown when camera is idle */}
        {cameraStatus === 'idle' && (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-white font-semibold mb-3">How it works</h3>
            <ol className="text-slate-400 text-sm space-y-2 list-decimal list-inside">
              <li>Tap &quot;Start Camera&quot; above to begin recording</li>
              <li>Camera warms up for 5 seconds (auto-exposure/focus settling)</li>
              <li>Point camera at the target and hold still — the system will stabilize (~3s)</li>
              <li>Once stable (green &quot;Watching&quot;), any sudden change (arrow impact) triggers a clip</li>
              <li>Triple detection: grid cells ({GRID_COLS}×{GRID_ROWS}), global motion, AND frame-to-frame spike</li>
              <li>Optimized for close range (2ft tripod) — black target with white center</li>
              <li>Enable &quot;Debug View&quot; to see what the camera detects (green = change from baseline)</li>
              <li>Camera shake is automatically filtered — only sudden impacts from stillness trigger</li>
              <li>Sign in and select tournament/archer to auto-upload clips</li>
              <li>Target number auto-advances after each successful save</li>
            </ol>
            <p className="text-slate-500 text-xs mt-3">
              Tip: Mount the camera on a tripod ~2ft from target. Use &quot;Detection Zone&quot; to focus on just the target face. Enable Debug View to verify alignment. The system requests high frame rate (up to 120fps) for smoother replays. Use &quot;Capture Now&quot; as a manual backup. Check browser console for detailed motion logs every second.
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