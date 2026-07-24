import {
  ArrowCounterClockwiseIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  FileArrowUpIcon,
  FileCsvIcon,
  FloppyDiskIcon,
  GearSixIcon,
  MicrophoneIcon,
  PlayIcon,
  SpeakerHighIcon,
  StopIcon,
  WaveformIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FrequencyChart, type GraphMode } from "./components/FrequencyChart";
import { LevelMeter } from "./components/LevelMeter";
import { QualityBadge } from "./components/QualityBadge";
import { SettingsPanel } from "./components/SettingsPanel";
import { useAudioCapture } from "./hooks/useAudioCapture";
import { summarizeBaseline } from "./lib/analysis";
import { createDemoAudio, decodeWav } from "./lib/audioFiles";
import {
  exportConditions,
  exportCsv,
  exportSvgAsPng,
  exportWav,
} from "./lib/exports";
import { analyzeInWorker } from "./lib/workerClient";
import {
  DEFAULT_SETTINGS,
  type AnalysisPoint,
  type AnalysisResult,
  type AnalysisSettings,
  type BaselineResult,
  type RecordedAudio,
} from "./types";

type ProcessState =
  | "idle"
  | "countdown-baseline"
  | "recording-baseline"
  | "countdown-measurement"
  | "recording-measurement"
  | "analyzing";

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function StatusMessage({
  tone,
  children,
}: {
  tone: "success" | "error" | "info";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`status-message status-message-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "success" ? (
        <CheckCircleIcon size={17} weight="fill" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </div>
  );
}

function Step({
  number,
  title,
  value,
  ready,
  children,
}: {
  number: number;
  title: string;
  value: string;
  ready: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`workflow-step ${ready ? "workflow-step-ready" : ""}`}>
      <div className="step-heading">
        <span className="step-number">{number}</span>
        <div>
          <h2>{title}</h2>
          <p>{value}</p>
        </div>
        {ready ? (
          <CheckCircleIcon
            className="step-check"
            size={19}
            weight="fill"
            aria-label="準備完了"
          />
        ) : null}
      </div>
      <div className="step-action">{children}</div>
    </section>
  );
}

export default function App() {
  const audio = useAudioCapture();
  const getCaptureSnapshot = audio.getCaptureSnapshot;
  const [settings, setSettings] =
    useState<AnalysisSettings>(DEFAULT_SETTINGS);
  const [processState, setProcessState] = useState<ProcessState>("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [baselineCandidate, setBaselineCandidate] =
    useState<BaselineResult | null>(null);
  const [baseline, setBaseline] = useState<BaselineResult | null>(null);
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(
    null,
  );
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [liveAnalysis, setLiveAnalysis] = useState<AnalysisResult | null>(null);
  const [liveDuration, setLiveDuration] = useState(0);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [timeZero, setTimeZero] = useState(0);
  const [graphMode, setGraphMode] = useState<GraphMode>("frequency");
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const measurementActiveRef = useRef(false);
  const liveAnalysisBusyRef = useRef(false);
  const graphRef = useRef<SVGSVGElement>(null);

  const runCountdown = useCallback(
    async (state: "countdown-baseline" | "countdown-measurement") => {
      setProcessState(state);
      for (let value = 3; value >= 1; value -= 1) {
        setCountdown(value);
        await wait(1000);
      }
      setCountdown(null);
    },
    [],
  );

  const applyAnalysis = useCallback(
    (
      nextAnalysis: AnalysisResult,
      audioData: RecordedAudio,
      preferredTimeZero?: number,
    ) => {
      setAnalysis(nextAnalysis);
      setLiveAnalysis(null);
      setLiveDuration(0);
      setRecordedAudio(audioData);
      setGraphMode("frequency");
      const firstPoint = nextAnalysis.points[0];
      const lastPoint = nextAnalysis.points.at(-1);
      const start = firstPoint?.time ?? 0;
      const end = lastPoint?.time ?? audioData.duration;
      setRangeStart(start);
      setRangeEnd(end);
      setTimeZero(Math.min(end, Math.max(start, preferredTimeZero ?? start)));
      let lastValidIndex = -1;
      for (let index = nextAnalysis.points.length - 1; index >= 0; index -= 1) {
        if (nextAnalysis.points[index]?.valid) {
          lastValidIndex = index;
          break;
        }
      }
      setSelectedPointIndex(
        lastValidIndex >= 0
          ? lastValidIndex
          : Math.max(0, nextAnalysis.points.length - 1),
      );
    },
    [],
  );

  const analyzeRecordedAudio = useCallback(
    async (
      audioData: RecordedAudio,
      activeBaseline: BaselineResult,
      preferredTimeZero?: number,
    ) => {
      setProcessState("analyzing");
      setActionError(null);
      const result = await analyzeInWorker(
        audioData.samples,
        audioData.sampleRate,
        settings,
        activeBaseline.frequency,
      );
      applyAnalysis(result, audioData, preferredTimeZero);
      setProcessState("idle");
      setActionNotice("測定結果を更新しました。");
    },
    [applyAnalysis, settings],
  );

  const handleBaselineMeasurement = async () => {
    if (!audio.permissionGranted) {
      setActionError("先にマイクを準備してください。");
      return;
    }
    setActionError(null);
    setActionNotice(null);
    setBaselineCandidate(null);
    try {
      await runCountdown("countdown-baseline");
      setProcessState("recording-baseline");
      await audio.startCapture();
      await wait(settings.baselineDuration * 1000);
      const captured = await audio.stopCapture();
      setProcessState("analyzing");
      const result = await analyzeInWorker(
        captured.samples,
        captured.sampleRate,
        settings,
        settings.expectedFrequency,
      );
      const summary = summarizeBaseline(result);
      if (!summary) {
        throw new Error(
          "基準振動数を決められませんでした。音量を確認して再測定してください。",
        );
      }
      setBaselineCandidate(summary);
      setBaseline(summary);
      setAnalysis(null);
      setRecordedAudio(null);
      setProcessState("idle");
      setActionNotice(
        `${summary.frequency.toFixed(1)} Hzを基準振動数 f₀ に設定しました。`,
      );
    } catch (error) {
      setProcessState("idle");
      setActionError(
        error instanceof Error
          ? error.message
          : "基準振動数の測定に失敗しました。",
      );
    }
  };

  const finishMeasurement = useCallback(async () => {
    if (stoppingRef.current || !measurementActiveRef.current || !baseline) {
      return;
    }
    stoppingRef.current = true;
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    try {
      const captured = await audio.stopCapture();
      measurementActiveRef.current = false;
      await analyzeRecordedAudio(captured, baseline);
    } catch (error) {
      setProcessState("idle");
      setActionError(
        error instanceof Error
          ? error.message
          : "測定した音声を解析できませんでした。",
      );
    } finally {
      measurementActiveRef.current = false;
      stoppingRef.current = false;
    }
  }, [analyzeRecordedAudio, audio, baseline]);

  const startMeasurement = async () => {
    if (!baseline) {
      setActionError("先に基準振動数 f₀ を測定してください。");
      return;
    }
    if (!audio.permissionGranted) {
      setActionError("マイクをもう一度準備してください。");
      return;
    }
    setActionError(null);
    setActionNotice(null);
    setAnalysis(null);
    setRecordedAudio(null);
    setLiveAnalysis(null);
    setLiveDuration(0);
    setGraphMode("frequency");
    setSelectedPointIndex(null);
    try {
      await runCountdown("countdown-measurement");
      setProcessState("recording-measurement");
      await audio.startCapture();
      measurementActiveRef.current = true;
      autoStopTimerRef.current = window.setTimeout(() => {
        void finishMeasurement();
      }, settings.maxDuration * 1000);
    } catch (error) {
      setProcessState("idle");
      setActionError(
        error instanceof Error
          ? error.message
          : "本測定を開始できませんでした。",
      );
    }
  };

  useEffect(() => {
    if (processState !== "recording-measurement" || !baseline) {
      return;
    }
    let active = true;
    const updateLiveGraph = async () => {
      if (liveAnalysisBusyRef.current) {
        return;
      }
      const snapshot = getCaptureSnapshot();
      if (!snapshot || snapshot.duration < settings.windowDuration) {
        return;
      }
      liveAnalysisBusyRef.current = true;
      try {
        const result = await analyzeInWorker(
          snapshot.samples,
          snapshot.sampleRate,
          settings,
          baseline.frequency,
        );
        if (!active) {
          return;
        }
        setLiveAnalysis(result);
        setLiveDuration(snapshot.duration);
        setSelectedPointIndex(Math.max(0, result.points.length - 1));
      } catch {
        // The final analysis after stopping remains the authoritative result.
      } finally {
        liveAnalysisBusyRef.current = false;
      }
    };
    void updateLiveGraph();
    const interval = window.setInterval(() => {
      void updateLiveGraph();
    }, 400);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    baseline,
    getCaptureSnapshot,
    processState,
    settings,
  ]);

  const loadDemo = async () => {
    setActionError(null);
    setActionNotice(null);
    const demoBaseline: BaselineResult = {
      frequency: 4000,
      qualityScore: 0.91,
      qualityLabel: "良好",
      validPointCount: 34,
      totalPointCount: 34,
    };
    setBaseline(demoBaseline);
    setBaselineCandidate(demoBaseline);
    try {
      const demoAudio = createDemoAudio();
      await analyzeRecordedAudio(demoAudio, demoBaseline, 0.7);
      setActionNotice(
        "デモを表示しました。台車が近づくと振動数が高くなる例です。",
      );
    } catch (error) {
      setProcessState("idle");
      setActionError(
        error instanceof Error
          ? error.message
          : "デモデータを作成できませんでした。",
      );
    }
  };

  const loadWav = async (file: File) => {
    setActionError(null);
    setActionNotice(null);
    try {
      const decoded = await decodeWav(file);
      const activeBaseline =
        baseline ??
        ({
          frequency: settings.expectedFrequency,
          qualityScore: 0.42,
          qualityLabel: "注意",
          validPointCount: 0,
          totalPointCount: 0,
        } satisfies BaselineResult);
      if (!baseline) {
        setBaseline(activeBaseline);
        setBaselineCandidate(activeBaseline);
      }
      await analyzeRecordedAudio(decoded, activeBaseline);
    } catch (error) {
      setProcessState("idle");
      setActionError(
        error instanceof Error
          ? error.message
          : "WAVファイルを読み込めませんでした。",
      );
    }
  };

  const reanalyze = async () => {
    if (!recordedAudio || !baseline) {
      return;
    }
    try {
      await analyzeRecordedAudio(recordedAudio, baseline, timeZero);
      setActionNotice("現在の設定で同じ音声を再解析しました。");
      setSettingsOpen(false);
    } catch (error) {
      setProcessState("idle");
      setActionError(
        error instanceof Error
          ? error.message
          : "音声を再解析できませんでした。",
      );
    }
  };

  useEffect(
    () => () => {
      if (autoStopTimerRef.current !== null) {
        window.clearTimeout(autoStopTimerRef.current);
      }
    },
    [],
  );

  const displayAnalysis = liveAnalysis ?? analysis;
  const displayPoints = displayAnalysis?.points ?? [];
  const isRecordingMeasurement =
    processState === "recording-measurement" && audio.isRecording;
  const displayRangeStart = isRecordingMeasurement ? 0 : rangeStart;
  const displayRangeEnd = isRecordingMeasurement
    ? Math.max(
        settings.windowDuration,
        liveDuration,
        displayPoints.at(-1)?.time ?? 0,
      )
    : Math.max(rangeEnd, settings.windowDuration);
  const displayTimeZero = isRecordingMeasurement ? 0 : timeZero;
  const selectedPoint: AnalysisPoint | null =
    selectedPointIndex !== null
      ? displayPoints[selectedPointIndex] ?? displayPoints.at(-1) ?? null
      : displayPoints.at(-1) ?? null;
  const visiblePointCount = useMemo(
    () =>
      analysis?.points.filter(
        (point) => point.time >= rangeStart && point.time <= rangeEnd,
      ).length ?? 0,
    [analysis, rangeEnd, rangeStart],
  );
  const validVisiblePointCount = useMemo(
    () =>
      analysis?.points.filter(
        (point) =>
          point.time >= rangeStart &&
          point.time <= rangeEnd &&
          point.valid,
      ).length ?? 0,
    [analysis, rangeEnd, rangeStart],
  );
  const isBusy =
    processState !== "idle" && processState !== "recording-measurement";
  const currentStatus =
    processState === "countdown-baseline" ||
    processState === "countdown-measurement"
      ? `${countdown ?? 0}秒後に開始`
      : processState === "recording-baseline"
        ? "基準音を測定中"
        : processState === "recording-measurement"
          ? "リアルタイム測定中"
          : processState === "analyzing"
            ? "解析中"
            : analysis
              ? "測定結果"
              : baseline
                ? "本測定の準備完了"
                : audio.permissionGranted
                  ? "基準測定の準備完了"
                  : "マイクを準備";
  const measurementDuration = recordedAudio?.duration ?? liveDuration;

  const saveCsv = () => {
    if (!analysis || !baseline) {
      return;
    }
    try {
      exportCsv(
        analysis.points,
        baseline.frequency,
        rangeStart,
        rangeEnd,
        timeZero,
      );
      setActionNotice(`${visiblePointCount}点のCSVを保存しました。`);
    } catch {
      setActionError("CSVを保存できませんでした。");
    }
  };

  const savePng = async () => {
    if (!graphRef.current) {
      return;
    }
    try {
      await exportSvgAsPng(graphRef.current);
      setActionNotice("グラフをPNG画像として保存しました。");
    } catch {
      setActionError("グラフ画像を保存できませんでした。");
    }
  };

  return (
    <div className="app-shell">
      <header className="compact-header">
        <div className="compact-brand">
          <span className="brand-icon">
            <WaveformIcon size={20} weight="bold" aria-hidden="true" />
          </span>
          <div>
            <h1>ドップラー効果</h1>
            <p>観測振動数 f を時間に対して測る</p>
          </div>
        </div>
        <div className="header-status" aria-live="polite">
          <span
            className={isRecordingMeasurement ? "status-dot status-dot-live" : "status-dot"}
          />
          <strong>{currentStatus}</strong>
          {isRecordingMeasurement ? (
            <span className="header-time">{audio.elapsed.toFixed(1)} s</span>
          ) : null}
        </div>
      </header>

      <main className="lab-workspace">
        <section className="graph-panel" aria-label="振動数グラフ">
          <div className="graph-header">
            <div>
              <span className="graph-kicker">
                {isRecordingMeasurement ? "LIVE" : "GRAPH"}
              </span>
              <h2>
                {graphMode === "frequency"
                  ? "観測振動数 f"
                  : "振動数のずれ Δf"}
              </h2>
            </div>
            <div className="mode-switch" aria-label="グラフの縦軸">
              <button
                className={graphMode === "frequency" ? "active" : ""}
                type="button"
                onClick={() => setGraphMode("frequency")}
              >
                f
              </button>
              <button
                className={graphMode === "delta" ? "active" : ""}
                type="button"
                disabled={!baseline}
                onClick={() => setGraphMode("delta")}
              >
                Δf
              </button>
            </div>
          </div>

          <div className="graph-stage">
            <FrequencyChart
              ref={graphRef}
              points={displayPoints}
              baselineFrequency={baseline?.frequency ?? settings.expectedFrequency}
              mode={graphMode}
              rangeStart={displayRangeStart}
              rangeEnd={displayRangeEnd}
              timeZero={displayTimeZero}
              selectedIndex={selectedPointIndex}
              onSelect={setSelectedPointIndex}
            />

            {!displayAnalysis && processState === "idle" ? (
              <div className="graph-empty">
                <ChartLineUpIcon size={36} weight="light" aria-hidden="true" />
                <strong>測定すると、ここにグラフが描かれます</strong>
                <span>右の「マイク」から順に進めてください。</span>
              </div>
            ) : null}

            {(processState === "countdown-baseline" ||
              processState === "countdown-measurement") &&
            countdown ? (
              <div className="countdown-overlay" aria-live="assertive">
                <span>開始まで</span>
                <strong>{countdown}</strong>
              </div>
            ) : null}

            {processState === "analyzing" && !displayAnalysis ? (
              <div className="analysis-overlay" role="status">
                <span className="analysis-pulse" />
                <strong>振動数を解析中</strong>
              </div>
            ) : null}

            <div className="message-stack">
              {audio.error ? (
                <StatusMessage tone="error">{audio.error}</StatusMessage>
              ) : null}
              {actionError ? (
                <StatusMessage tone="error">{actionError}</StatusMessage>
              ) : null}
            </div>
            <span className="sr-only" aria-live="polite">
              {actionNotice}
            </span>
          </div>

          <div className="measurement-readout" aria-live="polite">
            <div className="primary-readout">
              <span>現在の f</span>
              <strong>
                {selectedPoint ? selectedPoint.frequency.toFixed(1) : "—"}
                <small>Hz</small>
              </strong>
            </div>
            <div>
              <span>基準 f₀</span>
              <strong>
                {baseline ? baseline.frequency.toFixed(1) : "—"}
                <small>Hz</small>
              </strong>
            </div>
            <div>
              <span>Δf</span>
              <strong>
                {selectedPoint && baseline
                  ? (selectedPoint.frequency - baseline.frequency).toFixed(1)
                  : "—"}
                <small>Hz</small>
              </strong>
            </div>
            <div>
              <span>時刻 t</span>
              <strong>
                {selectedPoint
                  ? (selectedPoint.time - displayTimeZero).toFixed(2)
                  : "—"}
                <small>s</small>
              </strong>
            </div>
            <div className="quality-readout">
              <span>品質</span>
              {selectedPoint ? (
                <QualityBadge
                  label={selectedPoint.qualityLabel}
                  score={selectedPoint.qualityScore}
                />
              ) : (
                <strong>—</strong>
              )}
            </div>
          </div>

          {analysis && recordedAudio && !isRecordingMeasurement ? (
            <div className="trim-strip">
              <label>
                <span>開始 {rangeStart.toFixed(2)} s</span>
                <input
                  type="range"
                  min={analysis.points[0]?.time ?? 0}
                  max={rangeEnd}
                  step={0.01}
                  value={rangeStart}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setRangeStart(value);
                    setTimeZero((current) => Math.max(value, current));
                  }}
                />
              </label>
              <label>
                <span>t = 0　{timeZero.toFixed(2)} s</span>
                <input
                  type="range"
                  min={rangeStart}
                  max={rangeEnd}
                  step={0.01}
                  value={timeZero}
                  onChange={(event) => setTimeZero(Number(event.target.value))}
                />
              </label>
              <label>
                <span>終了 {rangeEnd.toFixed(2)} s</span>
                <input
                  type="range"
                  min={rangeStart}
                  max={analysis.points.at(-1)?.time ?? recordedAudio.duration}
                  step={0.01}
                  value={rangeEnd}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setRangeEnd(value);
                    setTimeZero((current) => Math.min(value, current));
                  }}
                />
              </label>
              <p>
                有効 {validVisiblePointCount}/{visiblePointCount}点
              </p>
            </div>
          ) : (
            <div className="trim-strip trim-strip-live">
              <span>
                {isRecordingMeasurement
                  ? "測定中はグラフをリアルタイム更新します"
                  : "測定後に範囲と t = 0 を調整できます"}
              </span>
              <strong>
                {measurementDuration > 0
                  ? `${measurementDuration.toFixed(1)} s`
                  : "Δf = f − f₀"}
              </strong>
            </div>
          )}
        </section>

        <aside className="control-panel" aria-label="測定操作">
          <div className="signal-block">
            <div className="frequency-input">
              <label htmlFor="expected-frequency">音源</label>
              <input
                id="expected-frequency"
                type="number"
                min={100}
                max={12000}
                step={1}
                value={settings.expectedFrequency}
                disabled={audio.isRecording}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    expectedFrequency: Number(event.target.value),
                  })
                }
              />
              <span>Hz</span>
            </div>
            <LevelMeter
              level={audio.level}
              peakLevel={audio.peakLevel}
              active={audio.permissionGranted}
            />
          </div>

          <div className="workflow-list">
            <Step
              number={1}
              title="マイク"
              value={
                audio.permissionGranted
                  ? audio.devices.find(
                      (device) => device.deviceId === audio.selectedDeviceId,
                    )?.label || "使用できます"
                  : "使用を許可します"
              }
              ready={audio.permissionGranted}
            >
              {audio.permissionGranted && audio.devices.length > 0 ? (
                <select
                  className="compact-select"
                  aria-label="使用する入力デバイス"
                  value={audio.selectedDeviceId}
                  disabled={audio.isRecording}
                  onChange={(event) =>
                    audio.setSelectedDeviceId(event.target.value)
                  }
                >
                  {audio.devices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `マイク ${index + 1}`}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                className="action-button"
                type="button"
                disabled={isBusy || audio.isRecording}
                onClick={() => void audio.requestPermission()}
              >
                <MicrophoneIcon size={18} weight="bold" />
                {audio.permissionGranted ? "選び直す" : "準備する"}
              </button>
            </Step>

            <Step
              number={2}
              title="基準 f₀"
              value={
                baselineCandidate
                  ? `${baselineCandidate.frequency.toFixed(1)} Hz`
                  : processState === "recording-baseline"
                    ? "測定中"
                    : "台車を静止させます"
              }
              ready={Boolean(baseline)}
            >
              <button
                className="action-button"
                type="button"
                disabled={
                  !audio.permissionGranted || isBusy || audio.isRecording
                }
                onClick={() => void handleBaselineMeasurement()}
              >
                <SpeakerHighIcon size={18} weight="bold" />
                {baseline ? "測り直す" : "基準を測る"}
              </button>
            </Step>

            <Step
              number={3}
              title="本測定"
              value={
                isRecordingMeasurement
                  ? `${audio.elapsed.toFixed(1)} / ${settings.maxDuration.toFixed(0)} s`
                  : analysis
                    ? `${analysis.points.length}点`
                    : "台車を動かします"
              }
              ready={Boolean(analysis)}
            >
              {isRecordingMeasurement ? (
                <button
                  className="action-button action-button-stop"
                  type="button"
                  onClick={() => void finishMeasurement()}
                >
                  <StopIcon size={18} weight="fill" />
                  停止
                </button>
              ) : (
                <button
                  className="action-button action-button-primary"
                  type="button"
                  disabled={!baseline || isBusy}
                  onClick={() => void startMeasurement()}
                >
                  <PlayIcon size={18} weight="fill" />
                  測定開始
                </button>
              )}
            </Step>
          </div>

          <div className="utility-grid">
            <button
              type="button"
              disabled={isBusy || audio.isRecording}
              onClick={() => void loadDemo()}
            >
              <ChartLineUpIcon size={17} weight="bold" />
              デモ
            </button>
            <label>
              <FileArrowUpIcon size={17} weight="bold" />
              WAV読込
              <input
                className="sr-only"
                type="file"
                accept=".wav,audio/wav"
                disabled={isBusy || audio.isRecording}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void loadWav(file);
                  }
                  event.target.value = "";
                }}
              />
            </label>
            <button type="button" onClick={() => setSettingsOpen(true)}>
              <GearSixIcon size={17} weight="bold" />
              設定
            </button>
          </div>

          <div className="export-block">
            <span>保存</span>
            <div>
              <button
                type="button"
                disabled={!analysis || !baseline}
                onClick={saveCsv}
                aria-label="CSVを保存"
                title="CSVを保存"
              >
                <FileCsvIcon size={19} weight="bold" />
              </button>
              <button
                type="button"
                disabled={!analysis}
                onClick={() => void savePng()}
                aria-label="グラフPNGを保存"
                title="グラフPNGを保存"
              >
                <DownloadSimpleIcon size={19} weight="bold" />
              </button>
              <button
                type="button"
                disabled={!recordedAudio}
                onClick={() => {
                  if (recordedAudio) {
                    exportWav(recordedAudio);
                  }
                }}
                aria-label="生音声WAVを保存"
                title="生音声WAVを保存"
              >
                <WaveformIcon size={19} weight="bold" />
              </button>
              <button
                type="button"
                disabled={!analysis || !baseline}
                onClick={() => {
                  if (analysis && baseline) {
                    exportConditions(
                      settings,
                      baseline,
                      analysis.sampleRate,
                      rangeStart,
                      rangeEnd,
                      timeZero,
                    );
                  }
                }}
                aria-label="測定条件JSONを保存"
                title="測定条件JSONを保存"
              >
                <FloppyDiskIcon size={19} weight="bold" />
              </button>
            </div>
          </div>

          <p className="privacy-note">
            音声と測定結果はブラウザ内だけで処理します。
          </p>
        </aside>
      </main>

      {settingsOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setSettingsOpen(false)}
        >
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="詳細設定"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>SETTINGS</span>
                <h2>測定と解析の設定</h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="設定を閉じる"
              >
                <XIcon size={22} weight="bold" />
              </button>
            </header>
            <div className="settings-modal-body">
              <SettingsPanel
                settings={settings}
                onChange={setSettings}
                sampleRate={analysis?.sampleRate ?? audio.sampleRate}
                defaultOpen
              />
              {recordedAudio && baseline ? (
                <button
                  className="reanalyze-button"
                  type="button"
                  disabled={isBusy || audio.isRecording}
                  onClick={() => void reanalyze()}
                >
                  <ArrowCounterClockwiseIcon size={18} weight="bold" />
                  この設定で再解析
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
