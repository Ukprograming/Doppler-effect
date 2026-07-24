import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  FileArrowUpIcon,
  FileCsvIcon,
  FloppyDiskIcon,
  InfoIcon,
  MicrophoneIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  StopIcon,
  WaveformIcon,
  WrenchIcon,
  XCircleIcon,
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
import { RangeEditor } from "./components/RangeEditor";
import { SettingsPanel } from "./components/SettingsPanel";
import { StepRail } from "./components/StepRail";
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

function formatBooleanSetting(value: boolean | undefined): string {
  if (value === false) {
    return "無効";
  }
  if (value === true) {
    return "有効（ブラウザ側で適用）";
  }
  return "ブラウザから報告なし";
}

function SectionHeader({
  step,
  eyebrow,
  title,
  description,
}: {
  step: number;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="section-header">
      <div className="section-number" aria-hidden="true">
        {String(step).padStart(2, "0")}
      </div>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "info" | "success" | "warning" | "error";
  children: React.ReactNode;
}) {
  const Icon =
    tone === "success"
      ? CheckCircleIcon
      : tone === "error"
        ? XCircleIcon
        : tone === "warning"
          ? InfoIcon
          : InfoIcon;
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={21} weight="bold" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function EmptySection({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof WaveformIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={28} weight="regular" aria-hidden="true" />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

export default function App() {
  const audio = useAudioCapture();
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
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [timeZero, setTimeZero] = useState(0);
  const [graphMode, setGraphMode] = useState<GraphMode>("frequency");
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const measurementActiveRef = useRef(false);
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
      setRecordedAudio(audioData);
      setGraphMode("frequency");
      const firstPoint = nextAnalysis.points[0];
      const lastPoint = nextAnalysis.points.at(-1);
      const start = firstPoint?.time ?? 0;
      const end = lastPoint?.time ?? audioData.duration;
      setRangeStart(start);
      setRangeEnd(end);
      setTimeZero(
        Math.min(end, Math.max(start, preferredTimeZero ?? start)),
      );
      const firstValidIndex = nextAnalysis.points.findIndex(
        (point) => point.valid,
      );
      setSelectedPointIndex(firstValidIndex >= 0 ? firstValidIndex : 0);
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
      setActionNotice(
        `${result.points.length}個の解析窓から振動数を求めました。最初に f-t グラフを確認してください。`,
      );
    },
    [applyAnalysis, settings],
  );

  const handleBaselineMeasurement = async () => {
    if (!audio.permissionGranted) {
      setActionError(
        "先にステップ1でマイクの使用を許可してください。",
      );
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
          "基準振動数を決められませんでした。音量を確認し、PCとスマートフォンを静止させて再測定してください。",
        );
      }
      setBaselineCandidate(summary);
      setProcessState("idle");
    } catch (error) {
      setProcessState("idle");
      setActionError(
        error instanceof Error
          ? error.message
          : "基準振動数の測定に失敗しました。",
      );
    }
  };

  const acceptBaseline = () => {
    if (!baselineCandidate) {
      return;
    }
    setBaseline(baselineCandidate);
    setActionNotice(
      `${baselineCandidate.frequency.toFixed(1)} Hzを静止時の基準振動数 f₀ にしました。`,
    );
    setAnalysis(null);
    setRecordedAudio(null);
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
      setActionError(
        "先にステップ2で基準振動数を測定し、「この値を基準にする」を押してください。",
      );
      return;
    }
    if (!audio.permissionGranted) {
      setActionError("マイクをもう一度許可してください。");
      return;
    }
    setActionError(null);
    setActionNotice(null);
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
        "デモ音声を読み込みました。台車が近づく想定で、振動数が徐々に高くなります。",
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
        setActionNotice(
          `${settings.expectedFrequency.toFixed(1)} Hzを仮の基準値として解析します。正確な実験では基準音を別に測定してください。`,
        );
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
      setActionNotice("現在の詳細設定で同じ音声を再解析しました。");
    } catch (error) {
      setProcessState("idle");
      setActionError(
        error instanceof Error
          ? error.message
          : "音声を再解析できませんでした。",
      );
    }
  };

  const selectedPoint: AnalysisPoint | null =
    selectedPointIndex !== null
      ? analysis?.points[selectedPointIndex] ?? null
      : null;
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

  useEffect(
    () => () => {
      if (autoStopTimerRef.current !== null) {
        window.clearTimeout(autoStopTimerRef.current);
      }
    },
    [],
  );

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
      setActionNotice(
        `${visiblePointCount}点のCSVを保存しました。速度の列は含めていません。`,
      );
    } catch {
      setActionError(
        "CSVを保存できませんでした。ブラウザのダウンロード許可を確認してください。",
      );
    }
  };

  const savePng = async () => {
    if (!graphRef.current) {
      return;
    }
    try {
      await exportSvgAsPng(graphRef.current);
      setActionNotice("表示中のグラフをPNG画像として保存しました。");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "グラフ画像を保存できませんでした。",
      );
    }
  };

  const currentStatus =
    processState === "analyzing"
      ? "音声を解析中"
      : processState === "recording-measurement"
        ? "台車運動を測定中"
        : processState === "recording-baseline"
          ? "基準音を測定中"
          : baseline && analysis
            ? "結果を確認できます"
            : baseline
              ? "本測定の準備完了"
              : audio.permissionGranted
                ? "基準測定の準備完了"
                : "マイクの準備から開始";

  return (
    <div className="min-h-[100dvh]">
      <header className="app-header">
        <div className="header-grid">
          <div className="header-copy">
            <div className="brand-mark" aria-label="Doppler Frequency Lab">
              <WaveformIcon size={22} weight="bold" aria-hidden="true" />
              <span>DF LAB / PHYSICS</span>
            </div>
            <p className="eyebrow mt-12">高校物理・定量実験</p>
            <h1>
              音の変化を、
              <br />
              振動数として測る。
            </h1>
            <p className="header-lead">
              PCのマイクが測るのは観測振動数 <span className="math">f</span>
              。静止時の基準 <span className="math">f₀</span>
              と比べるところまでを、順番に確かめます。
            </p>
          </div>
          <div className="header-instrument">
            <div className="instrument-line" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="instrument-status">
              <span className="status-pulse" aria-hidden="true" />
              <div>
                <span>現在の状態</span>
                <strong>{currentStatus}</strong>
              </div>
            </div>
            <div className="instrument-equation">
              <span>このアプリで作る量</span>
              <strong>Δf = f − f₀</strong>
              <small>速度 v はCSVを使って自分で求めます。</small>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="content-grid">
          <aside className="hidden lg:block">
            <StepRail
              baselineReady={Boolean(baseline)}
              measurementReady={Boolean(recordedAudio)}
              analysisReady={Boolean(analysis)}
            />
          </aside>

          <div className="min-w-0">
            {(audio.error || actionError || actionNotice) && (
              <div className="mb-6 space-y-3">
                {audio.error ? <Notice tone="error">{audio.error}</Notice> : null}
                {actionError ? (
                  <Notice tone="error">{actionError}</Notice>
                ) : null}
                {actionNotice ? (
                  <Notice tone="success">{actionNotice}</Notice>
                ) : null}
              </div>
            )}

            <section id="step-1" className="lab-section reveal-section">
              <SectionHeader
                step={1}
                eyebrow="INPUT"
                title="マイクと音源の準備"
                description="スマートフォンで純音を鳴らし、PC側の音量とマイク設定を確かめます。"
              />
              <div className="asymmetric-grid">
                <div className="space-y-5">
                  <button
                    className="button button-primary w-full sm:w-auto"
                    type="button"
                    disabled={isBusy || audio.isRecording}
                    onClick={() => void audio.requestPermission()}
                  >
                    <MicrophoneIcon size={20} weight="bold" />
                    {audio.permissionGranted
                      ? "マイクを選び直す"
                      : "マイクの使用を許可"}
                  </button>
                  <label className="field-block">
                    <span>使用する入力デバイス</span>
                    <select
                      value={audio.selectedDeviceId}
                      disabled={audio.isRecording}
                      onChange={(event) =>
                        audio.setSelectedDeviceId(event.target.value)
                      }
                    >
                      {audio.devices.length === 0 ? (
                        <option value="">許可後にマイクを表示します</option>
                      ) : (
                        audio.devices.map((device, index) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `マイク ${index + 1}`}
                          </option>
                        ))
                      )}
                    </select>
                    <small>
                      変更した後は「マイクを選び直す」を押してください。
                    </small>
                  </label>
                  <label className="field-block">
                    <span>想定する音源振動数 [Hz]</span>
                    <input
                      type="number"
                      min={100}
                      max={12000}
                      step={1}
                      value={settings.expectedFrequency}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          expectedFrequency: Number(event.target.value),
                        })
                      }
                    />
                    <small>初期値は4000 Hzです。</small>
                  </label>
                </div>
                <div className="measurement-surface">
                  <LevelMeter
                    level={audio.level}
                    peakLevel={audio.peakLevel}
                    active={audio.permissionGranted}
                  />
                  <div className="mt-7 border-t border-slate-200 pt-5">
                    <p className="mb-3 text-xs font-bold tracking-[0.12em] text-slate-400">
                      実際に適用された設定
                    </p>
                    <dl className="setting-readout">
                      <div>
                        <dt>エコー除去</dt>
                        <dd>
                          {formatBooleanSetting(
                            audio.appliedSettings?.echoCancellation,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>ノイズ抑制</dt>
                        <dd>
                          {formatBooleanSetting(
                            audio.appliedSettings?.noiseSuppression,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>自動音量調整</dt>
                        <dd>
                          {formatBooleanSetting(
                            audio.appliedSettings?.autoGainControl,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>サンプリング</dt>
                        <dd className="font-mono">
                          {audio.sampleRate
                            ? `${audio.sampleRate} Hz`
                            : "未取得"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </section>

            <section id="step-2" className="lab-section reveal-section">
              <SectionHeader
                step={2}
                eyebrow="BASELINE"
                title="静止時の基準振動数 f₀ を測る"
                description="台車を静止させ、複数の解析窓の中央値から外れ値に強い基準を作ります。"
              />
              <div className="split-action">
                <div>
                  <ol className="instruction-list">
                    <li>台車とスマートフォンを静止させます。</li>
                    <li>4000 Hzの純音を鳴らします。</li>
                    <li>カウントダウン後も、そのまま動かさずに待ちます。</li>
                  </ol>
                  <button
                    className="button button-primary mt-7"
                    type="button"
                    disabled={!audio.permissionGranted || isBusy || audio.isRecording}
                    onClick={() => void handleBaselineMeasurement()}
                  >
                    <SpeakerHighIcon size={20} weight="bold" />
                    基準振動数を測定
                  </button>
                </div>
                <div className="result-well">
                  {processState === "countdown-baseline" && countdown ? (
                    <div className="countdown" aria-live="assertive">
                      <span>測定まで</span>
                      <strong>{countdown}</strong>
                      <small>台車を動かさないでください</small>
                    </div>
                  ) : processState === "recording-baseline" ? (
                    <div className="recording-state" aria-live="polite">
                      <span className="recording-wave" aria-hidden="true" />
                      <strong>基準音を記録しています</strong>
                      <small>{settings.baselineDuration.toFixed(1)}秒間</small>
                    </div>
                  ) : processState === "analyzing" && !analysis ? (
                    <div className="skeleton-stack" aria-label="基準音を解析中">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : baselineCandidate ? (
                    <div className="baseline-result">
                      <p>測定した基準振動数</p>
                      <strong className="frequency-value">
                        {baselineCandidate.frequency.toFixed(1)}
                        <span>Hz</span>
                      </strong>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <QualityBadge
                          label={baselineCandidate.qualityLabel}
                          score={baselineCandidate.qualityScore}
                        />
                        <span className="text-sm text-slate-500">
                          有効 {baselineCandidate.validPointCount} /{" "}
                          {baselineCandidate.totalPointCount} 点
                        </span>
                      </div>
                      {baselineCandidate.qualityLabel !== "良好" ? (
                        <p className="mt-4 text-sm leading-relaxed text-amber-800">
                          音源をマイクへ向け、周囲の雑音を減らして再測定すると安定します。
                        </p>
                      ) : null}
                      <button
                        className="button button-lime mt-6 w-full"
                        type="button"
                        onClick={acceptBaseline}
                      >
                        <CheckCircleIcon size={20} weight="bold" />
                        この値を基準にする
                      </button>
                    </div>
                  ) : (
                    <EmptySection
                      icon={SpeakerHighIcon}
                      title="まだ基準値はありません"
                      body="測定後、ここに f₀ と測定品質を表示します。"
                    />
                  )}
                </div>
              </div>
            </section>

            <section id="step-3" className="lab-section reveal-section">
              <SectionHeader
                step={3}
                eyebrow="MEASURE"
                title="台車運動中の音を測る"
                description="測定中は台車と音の変化へ注意を向けます。複雑なグラフは測定後に表示します。"
              />
              {baseline ? (
                <div className="measurement-stage">
                  <div className="measurement-stage-top">
                    <div>
                      <p className="eyebrow">基準 f₀</p>
                      <strong className="font-mono text-2xl text-slate-900">
                        {baseline.frequency.toFixed(1)} Hz
                      </strong>
                    </div>
                    <QualityBadge
                      label={baseline.qualityLabel}
                      score={baseline.qualityScore}
                    />
                  </div>

                  {processState === "countdown-measurement" && countdown ? (
                    <div className="measurement-focus">
                      <div className="countdown" aria-live="assertive">
                        <span>測定まで</span>
                        <strong>{countdown}</strong>
                        <small>台車を離す準備をしてください</small>
                      </div>
                    </div>
                  ) : audio.isRecording ? (
                    <div className="measurement-focus" aria-live="polite">
                      <span className="live-chip">
                        <span />
                        記録中
                      </span>
                      <strong className="elapsed-value">
                        {audio.elapsed.toFixed(1)}
                        <span>s</span>
                      </strong>
                      <LevelMeter
                        level={audio.level}
                        peakLevel={audio.peakLevel}
                        active
                      />
                      <button
                        className="button button-stop mt-7"
                        type="button"
                        onClick={() => void finishMeasurement()}
                      >
                        <StopIcon size={20} weight="fill" />
                        測定を停止
                      </button>
                    </div>
                  ) : processState === "analyzing" ? (
                    <div className="measurement-focus">
                      <div className="skeleton-stack" aria-label="音声を解析中">
                        <span />
                        <span />
                        <span />
                      </div>
                      <p className="mt-4 text-center font-semibold text-slate-700">
                        STFTで観測振動数を求めています
                      </p>
                    </div>
                  ) : (
                    <div className="measurement-focus">
                      <PlayIcon
                        size={34}
                        weight="regular"
                        className="text-blue-700"
                        aria-hidden="true"
                      />
                      <h3>準備ができたら本測定を始めます</h3>
                      <p>
                        最大 {settings.maxDuration.toFixed(0)}
                        秒。必要なところまで測ったら停止してください。
                      </p>
                      <button
                        className="button button-primary mt-6"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void startMeasurement()}
                      >
                        <PlayIcon size={20} weight="fill" />
                        測定開始
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <EmptySection
                  icon={PauseIcon}
                  title="基準振動数を決めると測定できます"
                  body="ステップ2で測定し、「この値を基準にする」を押してください。"
                />
              )}

              <div className="secondary-actions">
                <div>
                  <h3>保存済み音声・デモで試す</h3>
                  <p>
                    マイクを使えない環境でも、解析とグラフ操作を確認できます。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="button button-quiet cursor-pointer">
                    <FileArrowUpIcon size={18} weight="bold" />
                    WAVを読み込む
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
                  <button
                    className="button button-quiet"
                    type="button"
                    disabled={isBusy || audio.isRecording}
                    onClick={() => void loadDemo()}
                  >
                    <ChartLineUpIcon size={18} weight="bold" />
                    デモデータを使う
                  </button>
                </div>
              </div>
            </section>

            <section id="step-4" className="lab-section reveal-section">
              <SectionHeader
                step={4}
                eyebrow="TRIM & ZERO"
                title="測定範囲と t = 0 を決める"
                description="不要な前後を除き、台車を離した瞬間をCSVの時刻原点にします。"
              />
              {analysis && recordedAudio ? (
                <>
                  <RangeEditor
                    points={analysis.points}
                    duration={recordedAudio.duration}
                    start={rangeStart}
                    end={rangeEnd}
                    timeZero={timeZero}
                    onStartChange={(value) => {
                      setRangeStart(value);
                      setTimeZero((current) => Math.max(value, current));
                    }}
                    onEndChange={(value) => {
                      setRangeEnd(value);
                      setTimeZero((current) => Math.min(value, current));
                    }}
                    onTimeZeroChange={setTimeZero}
                  />
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
                    <p className="text-sm text-slate-600">
                      解析範囲内：{" "}
                      <strong className="font-mono text-slate-900">
                        {visiblePointCount}点
                      </strong>
                      {" / "}有効：
                      <strong className="font-mono text-slate-900">
                        {validVisiblePointCount}点
                      </strong>
                    </p>
                    <p className="formula-chip">CSV時刻 = 測定時刻 − t₀</p>
                  </div>
                </>
              ) : (
                <EmptySection
                  icon={WrenchIcon}
                  title="本測定のあとに設定できます"
                  body="全測定区間の振動数を簡易表示し、3本の操作線で範囲と時刻原点を決めます。"
                />
              )}
            </section>

            <section id="step-5" className="lab-section reveal-section">
              <SectionHeader
                step={5}
                eyebrow="OBSERVE"
                title={
                  graphMode === "frequency"
                    ? "PCが観測した振動数 f"
                    : "基準の振動数からのずれ Δf"
                }
                description={
                  graphMode === "frequency"
                    ? "最初に、PCが直接測った観測振動数を確認します。"
                    : "観測振動数から静止時の基準を引いて、ずれとして見ています。"
                }
              />
              {analysis && baseline ? (
                <>
                  {analysis.warnings.map((warning) => (
                    <div className="mb-3" key={warning}>
                      <Notice tone="warning">{warning}</Notice>
                    </div>
                  ))}
                  <div className="graph-toolbar">
                    <div>
                      <span className="legend-item">
                        <i className="legend-dot" />
                        有効な測定点
                      </span>
                      <span className="legend-item">
                        <i className="legend-triangle" />
                        信頼性が低い点
                      </span>
                    </div>
                    <span className="zoom-note">
                      縦軸は測定値付近を拡大して表示しています
                    </span>
                  </div>

                  {graphMode === "delta" ? (
                    <div className="equation-reveal" aria-live="polite">
                      <div className="equation-words">
                        <span>観測された振動数 f</span>
                        <b>−</b>
                        <span>静止時の振動数 f₀</span>
                        <b>＝</b>
                        <span>振動数のずれ Δf</span>
                      </div>
                      <strong>Δf = f − f₀</strong>
                    </div>
                  ) : null}

                  <FrequencyChart
                    ref={graphRef}
                    points={analysis.points}
                    baselineFrequency={baseline.frequency}
                    mode={graphMode}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    timeZero={timeZero}
                    selectedIndex={selectedPointIndex}
                    onSelect={setSelectedPointIndex}
                  />

                  <div className="graph-actions">
                    <button
                      className={
                        graphMode === "frequency"
                          ? "button button-primary"
                          : "button button-quiet"
                      }
                      type="button"
                      onClick={() =>
                        setGraphMode((current) =>
                          current === "frequency" ? "delta" : "frequency",
                        )
                      }
                    >
                      {graphMode === "frequency" ? (
                        <>
                          基準の振動数からの「ずれ」を見る
                          <ArrowRightIcon size={19} weight="bold" />
                        </>
                      ) : (
                        <>
                          <ArrowCounterClockwiseIcon
                            size={19}
                            weight="bold"
                          />
                          観測された振動数 f に戻る
                        </>
                      )}
                    </button>
                    <p className="formula-constant">Δf = f − f₀</p>
                  </div>

                  <div className="point-inspector">
                    <div>
                      <p className="eyebrow">選択した測定点</p>
                      {selectedPoint ? (
                        <strong>
                          t = {(selectedPoint.time - timeZero).toFixed(2)} s
                        </strong>
                      ) : (
                        <strong>グラフ上の点を選んでください</strong>
                      )}
                    </div>
                    {selectedPoint ? (
                      <dl>
                        <div>
                          <dt>観測振動数 f</dt>
                          <dd>{selectedPoint.frequency.toFixed(1)} Hz</dd>
                        </div>
                        <div>
                          <dt>基準振動数 f₀</dt>
                          <dd>{baseline.frequency.toFixed(1)} Hz</dd>
                        </div>
                        <div>
                          <dt>Δf = f − f₀</dt>
                          <dd>
                            {(
                              selectedPoint.frequency - baseline.frequency
                            ).toFixed(1)}{" "}
                            Hz
                          </dd>
                        </div>
                        <div>
                          <dt>測定品質</dt>
                          <dd>
                            <QualityBadge
                              label={selectedPoint.qualityLabel}
                              score={selectedPoint.qualityScore}
                            />
                          </dd>
                        </div>
                        <div>
                          <dt>計算に使った区間</dt>
                          <dd>
                            {(selectedPoint.windowStart - timeZero).toFixed(2)}
                            {" ～ "}
                            {(selectedPoint.windowEnd - timeZero).toFixed(2)} s
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                  </div>

                  <div className="export-panel">
                    <div>
                      <p className="eyebrow">EXPORT</p>
                      <h3>測定結果を持ち出す</h3>
                      <p>
                        CSVには t、f、Δf と品質情報を含めます。速度 v
                        は含めません。
                      </p>
                    </div>
                    <div className="export-buttons">
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={saveCsv}
                      >
                        <FileCsvIcon size={20} weight="bold" />
                        CSVを保存
                      </button>
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() => void savePng()}
                      >
                        <DownloadSimpleIcon size={19} weight="bold" />
                        グラフPNG
                      </button>
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() => {
                          if (recordedAudio) {
                            exportWav(recordedAudio);
                          }
                        }}
                      >
                        <WaveformIcon size={19} weight="bold" />
                        生音声WAV
                      </button>
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() =>
                          exportConditions(
                            settings,
                            baseline,
                            analysis.sampleRate,
                            rangeStart,
                            rangeEnd,
                            timeZero,
                          )
                        }
                      >
                        <FloppyDiskIcon size={19} weight="bold" />
                        条件JSON
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <EmptySection
                  icon={ChartLineUpIcon}
                  title="本測定を解析するとグラフを表示します"
                  body="最初の表示は必ず観測振動数 f-t です。その後、生徒の操作で Δf-t に切り替えます。"
                />
              )}
            </section>

            <section className="lab-section reveal-section">
              <SettingsPanel
                settings={settings}
                onChange={setSettings}
                sampleRate={analysis?.sampleRate ?? audio.sampleRate}
              />
              {recordedAudio && baseline ? (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <div>
                    <strong className="block text-slate-800">
                      解析条件を変更しましたか？
                    </strong>
                    <span className="mt-1 block text-sm text-slate-500">
                      保存済みの同じ音声を、現在の設定でもう一度解析できます。
                    </span>
                  </div>
                  <button
                    className="button button-quiet"
                    type="button"
                    disabled={isBusy || audio.isRecording}
                    onClick={() => void reanalyze()}
                  >
                    <ArrowCounterClockwiseIcon size={18} weight="bold" />
                    同じ音声を再解析
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </main>

      <footer>
        <div>
          <span>DF LAB / PHYSICS</span>
          <p>
            音声は外部へ送信せず、このブラウザ内で解析します。
            実験前に必ず基準音で動作を確認してください。
          </p>
        </div>
        <p>速度 v は測定後に物理モデルを使って求めます。</p>
      </footer>
    </div>
  );
}
