import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
} from "@phosphor-icons/react";
import { nextPowerOfTwo } from "../lib/fft";
import {
  DEFAULT_SETTINGS,
  type AnalysisSettings,
  type SmoothingSize,
} from "../types";

interface SettingsPanelProps {
  settings: AnalysisSettings;
  onChange: (settings: AnalysisSettings) => void;
  sampleRate: number | null;
}

export function SettingsPanel({
  settings,
  onChange,
  sampleRate,
}: SettingsPanelProps) {
  const effectiveSampleRate = sampleRate ?? 48000;
  const windowSamples = Math.round(
    settings.windowDuration * effectiveSampleRate,
  );
  const fftSize = nextPowerOfTwo(windowSamples);
  const update = <Key extends keyof AnalysisSettings>(
    key: Key,
    value: AnalysisSettings[Key],
  ) => onChange({ ...settings, [key]: value });

  return (
    <details className="settings-panel">
      <summary>
        <span>
          <span className="block font-semibold text-slate-800">
            詳細設定（通常は変更不要）
          </span>
          <span className="mt-1 block text-sm font-normal text-slate-500">
            解析時間幅、探索範囲、平滑化など
          </span>
        </span>
        <CaretDownIcon
          className="settings-caret"
          size={20}
          weight="bold"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-slate-200 px-5 py-6 md:px-7">
        <div className="settings-grid">
          <label className="field-block">
            <span>想定する音源振動数 [Hz]</span>
            <input
              type="number"
              min={100}
              max={12000}
              step={1}
              value={settings.expectedFrequency}
              onChange={(event) =>
                update("expectedFrequency", Number(event.target.value))
              }
            />
            <small>スマートフォンから出す純音に合わせます。</small>
          </label>
          <label className="field-block">
            <span>基準音の測定時間 [s]</span>
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={settings.baselineDuration}
              onChange={(event) =>
                update("baselineDuration", Number(event.target.value))
              }
            />
          </label>
          <label className="field-block">
            <span>本測定の最大時間 [s]</span>
            <input
              type="number"
              min={2}
              max={60}
              step={1}
              value={settings.maxDuration}
              onChange={(event) =>
                update("maxDuration", Number(event.target.value))
              }
            />
          </label>
          <label className="field-block">
            <span>解析時間幅</span>
            <select
              value={settings.windowDuration}
              onChange={(event) =>
                update("windowDuration", Number(event.target.value))
              }
            >
              <option value={0.1}>0.10秒</option>
              <option value={0.2}>0.20秒</option>
              <option value={0.3}>0.30秒</option>
              <option value={0.5}>0.50秒</option>
            </select>
            <small>
              短いほど時間変化を追いやすいが、振動数は不安定になりやすい。
              長いほど振動数は安定するが、急な変化を捉えにくい。
            </small>
          </label>
          <label className="field-block">
            <span>更新間隔 [s]</span>
            <input
              type="number"
              min={0.01}
              max={0.5}
              step={0.01}
              value={settings.hopDuration}
              onChange={(event) =>
                update("hopDuration", Number(event.target.value))
              }
            />
          </label>
          <label className="field-block">
            <span>探索範囲</span>
            <select
              value={settings.searchRange}
              onChange={(event) =>
                update("searchRange", Number(event.target.value))
              }
            >
              <option value={50}>基準から ±50 Hz</option>
              <option value={100}>基準から ±100 Hz</option>
              <option value={200}>基準から ±200 Hz</option>
            </select>
          </label>
          <label className="field-block">
            <span>平滑化</span>
            <select
              value={settings.smoothingSize}
              onChange={(event) =>
                update(
                  "smoothingSize",
                  Number(event.target.value) as SmoothingSize,
                )
              }
            >
              <option value={1}>なし</option>
              <option value={3}>3点中央値</option>
              <option value={5}>5点中央値</option>
            </select>
          </label>
          <label className="field-block">
            <span>測定品質のしきい値</span>
            <strong>{Math.round(settings.qualityThreshold * 100)}</strong>
            <input
              type="range"
              min={0.2}
              max={0.8}
              step={0.01}
              value={settings.qualityThreshold}
              onChange={(event) =>
                update("qualityThreshold", Number(event.target.value))
              }
            />
          </label>
          <div className="field-block">
            <span>解析処理</span>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.useHann}
                onChange={(event) => update("useHann", event.target.checked)}
              />
              Hann窓を使用
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.interpolatePeak}
                onChange={(event) =>
                  update("interpolatePeak", event.target.checked)
                }
              />
              ピーク周辺3点で補間
            </label>
          </div>
        </div>

        <div className="mt-7 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["実際のサンプリング周波数", `${effectiveSampleRate} Hz`],
            ["解析窓のサンプル数", `${windowSamples}`],
            ["FFTサイズ", `${fftSize}`],
            ["FFTビン間隔", `${(effectiveSampleRate / fftSize).toFixed(2)} Hz`],
            ["1 / T", `${(1 / settings.windowDuration).toFixed(2)} Hz`],
            ["表示桁", "小数第1位"],
            ["窓関数", settings.useHann ? "Hann" : "矩形"],
            [
              "ピーク補間",
              settings.interpolatePeak ? "使用する" : "使用しない",
            ],
          ].map(([label, value]) => (
            <div className="bg-white p-4" key={label}>
              <span className="block text-xs text-slate-500">{label}</span>
              <strong className="mt-1 block font-mono text-sm text-slate-800">
                {value}
              </strong>
            </div>
          ))}
        </div>
        <p className="mt-5 border-l-2 border-blue-300 pl-4 text-sm leading-relaxed text-slate-600">
          FFTビン間隔、ピーク補間後の推定値、実際の測定精度は同じものではありません。
          表示が0.1 Hz単位でも、0.1 Hzの精度を保証するものではありません。
          ゼロパディングは周波数格子を細かくしますが、本質的な分解能を上げません。
        </p>
        <button
          className="button button-quiet mt-6"
          type="button"
          onClick={() => onChange(DEFAULT_SETTINGS)}
        >
          <ArrowCounterClockwiseIcon size={18} weight="bold" />
          初期設定に戻す
        </button>
      </div>
    </details>
  );
}
