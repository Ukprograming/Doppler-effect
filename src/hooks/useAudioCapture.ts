import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppliedAudioSettings,
  RecordedAudio,
} from "../types";

interface AudioCaptureState {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  setSelectedDeviceId: (deviceId: string) => void;
  permissionGranted: boolean;
  appliedSettings: AppliedAudioSettings | null;
  sampleRate: number | null;
  level: number;
  peakLevel: number;
  isRecording: boolean;
  elapsed: number;
  error: string | null;
  requestPermission: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<RecordedAudio>;
  clearError: () => void;
}

function concatenateChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function explainMediaError(error: unknown): string {
  if (error instanceof DOMException) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      return "マイクの使用が許可されませんでした。アドレスバー付近の設定からマイクを許可し、もう一度押してください。";
    }
    if (
      error.name === "NotFoundError" ||
      error.name === "DevicesNotFoundError"
    ) {
      return "使用できるマイクが見つかりません。マイクの接続を確認してから、もう一度試してください。";
    }
    if (error.name === "NotReadableError") {
      return "マイクを開始できませんでした。別のアプリがマイクを使用していないか確認してください。";
    }
  }
  return "マイクを開始できませんでした。接続とブラウザの権限を確認してください。";
}

export function useAudioCapture(): AudioCaptureState {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [appliedSettings, setAppliedSettings] =
    useState<AppliedAudioSettings | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const sinkRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const recordingRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return;
    }
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const inputs = allDevices.filter((device) => device.kind === "audioinput");
    setDevices(inputs);
    setSelectedDeviceId((current) => current || inputs[0]?.deviceId || "");
  }, []);

  const stopLevelMonitor = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const startLevelMonitor = useCallback(() => {
    stopLevelMonitor();
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }
    const data = new Float32Array(analyser.fftSize);
    const update = () => {
      analyser.getFloatTimeDomainData(data);
      let squareSum = 0;
      let absolutePeak = 0;
      for (const sample of data) {
        squareSum += sample * sample;
        absolutePeak = Math.max(absolutePeak, Math.abs(sample));
      }
      const rms = Math.sqrt(squareSum / data.length);
      setLevel(Math.min(1, rms * 7));
      setPeakLevel(absolutePeak);
      animationFrameRef.current = requestAnimationFrame(update);
    };
    animationFrameRef.current = requestAnimationFrame(update);
  }, [stopLevelMonitor]);

  const disposeAudio = useCallback(async () => {
    stopLevelMonitor();
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    recordingRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    workletRef.current?.disconnect();
    sinkRef.current?.disconnect();
    if (contextRef.current && contextRef.current.state !== "closed") {
      await contextRef.current.close();
    }
    streamRef.current = null;
    sourceRef.current = null;
    analyserRef.current = null;
    workletRef.current = null;
    sinkRef.current = null;
    contextRef.current = null;
  }, [stopLevelMonitor]);

  const requestPermission = useCallback(async () => {
    setError(null);
    if (!window.isSecureContext) {
      setError(
        "マイクはHTTPSまたはlocalhostでのみ利用できます。公開時はHTTPSのURLを使ってください。",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "このブラウザではマイク入力を利用できません。最新版のChromeまたはEdgeを使用してください。",
      );
      return;
    }
    if (!window.AudioWorkletNode) {
      setError(
        "このブラウザは高精度な音声取得に対応していません。最新版のChromeまたはEdgeへ更新してください。",
      );
      return;
    }

    try {
      await disposeAudio();
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedDeviceId
            ? { exact: selectedDeviceId }
            : undefined,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const context = new AudioContext({ latencyHint: "interactive" });
      await context.audioWorklet.addModule(
        new URL("pcm-processor.js", document.baseURI).toString(),
      );
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      const worklet = new AudioWorkletNode(context, "pcm-capture-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const sink = context.createGain();
      sink.gain.value = 0;

      source.connect(analyser);
      analyser.connect(worklet);
      worklet.connect(sink);
      sink.connect(context.destination);
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (recordingRef.current) {
          chunksRef.current.push(event.data);
        }
      };

      const track = stream.getAudioTracks()[0];
      track.addEventListener(
        "ended",
        () => {
          recordingRef.current = false;
          setIsRecording(false);
          setError(
            "測定中にマイクが切断されました。接続を確認して、マイクをもう一度許可してください。",
          );
        },
        { once: true },
      );
      const trackSettings = track.getSettings();

      streamRef.current = stream;
      contextRef.current = context;
      sourceRef.current = source;
      analyserRef.current = analyser;
      workletRef.current = worklet;
      sinkRef.current = sink;
      setAppliedSettings({
        echoCancellation: trackSettings.echoCancellation,
        noiseSuppression: trackSettings.noiseSuppression,
        autoGainControl: trackSettings.autoGainControl,
        sampleRate: trackSettings.sampleRate,
        channelCount: trackSettings.channelCount,
        deviceId: trackSettings.deviceId,
      });
      setSampleRate(context.sampleRate);
      setPermissionGranted(true);
      await refreshDevices();
      startLevelMonitor();
    } catch (caughtError) {
      await disposeAudio();
      setPermissionGranted(false);
      setError(explainMediaError(caughtError));
    }
  }, [
    disposeAudio,
    refreshDevices,
    selectedDeviceId,
    startLevelMonitor,
  ]);

  const startCapture = useCallback(async () => {
    const context = contextRef.current;
    if (!context || !permissionGranted) {
      throw new Error("先にマイクの使用を許可してください。");
    }
    if (context.state === "suspended") {
      await context.resume();
    }
    chunksRef.current = [];
    recordingStartedAtRef.current = context.currentTime;
    recordingRef.current = true;
    setElapsed(0);
    setIsRecording(true);
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsed(context.currentTime - recordingStartedAtRef.current);
    }, 100);
  }, [permissionGranted]);

  const stopCapture = useCallback(async (): Promise<RecordedAudio> => {
    const context = contextRef.current;
    if (!context) {
      throw new Error("マイクが準備されていません。");
    }
    recordingRef.current = false;
    setIsRecording(false);
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const samples = concatenateChunks(chunksRef.current);
    chunksRef.current = [];
    if (samples.length === 0) {
      throw new Error(
        "音声データを記録できませんでした。マイクの接続を確認してください。",
      );
    }
    return {
      samples,
      sampleRate: context.sampleRate,
      duration: samples.length / context.sampleRate,
      source: "microphone",
    };
  }, []);

  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        refreshDevices,
      );
      void disposeAudio();
    };
  }, [disposeAudio, refreshDevices]);

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    permissionGranted,
    appliedSettings,
    sampleRate,
    level,
    peakLevel,
    isRecording,
    elapsed,
    error,
    requestPermission,
    refreshDevices,
    startCapture,
    stopCapture,
    clearError: () => setError(null),
  };
}
