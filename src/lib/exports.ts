import type {
  AnalysisPoint,
  AnalysisSettings,
  BaselineResult,
  RecordedAudio,
} from "../types";
import { encodeWav } from "./audioFiles";

export function fileTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  ].join("_");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildCsv(
  points: AnalysisPoint[],
  baselineFrequency: number,
  rangeStart: number,
  rangeEnd: number,
  timeZero: number,
): string {
  const header =
    "time_s,frequency_hz,delta_f_hz,frequency_raw_hz,quality,valid,window_start_s,window_end_s,baseline_frequency_hz";
  const rows = points
    .filter((point) => point.time >= rangeStart && point.time <= rangeEnd)
    .map((point) => {
      const values = [
        point.time - timeZero,
        point.frequency,
        point.frequency - baselineFrequency,
        point.rawFrequency,
        point.qualityScore,
        point.valid,
        point.windowStart - timeZero,
        point.windowEnd - timeZero,
        baselineFrequency,
      ];
      return values
        .map((value) =>
          typeof value === "number"
            ? Number.isFinite(value)
              ? value.toFixed(6)
              : ""
            : String(value),
        )
        .join(",");
    });
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}

export function exportCsv(
  points: AnalysisPoint[],
  baselineFrequency: number,
  rangeStart: number,
  rangeEnd: number,
  timeZero: number,
): void {
  const csv = buildCsv(
    points,
    baselineFrequency,
    rangeStart,
    rangeEnd,
    timeZero,
  );
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    `doppler_frequency_${fileTimestamp()}.csv`,
  );
}

export function exportWav(audio: RecordedAudio): void {
  downloadBlob(
    encodeWav(audio),
    `doppler_audio_${fileTimestamp()}.wav`,
  );
}

export function exportConditions(
  settings: AnalysisSettings,
  baseline: BaselineResult,
  sampleRate: number,
  rangeStart: number,
  rangeEnd: number,
  timeZero: number,
): void {
  const content = JSON.stringify(
    {
      savedAt: new Date().toISOString(),
      baseline,
      sampleRate,
      analysisRange: { start_s: rangeStart, end_s: rangeEnd },
      timeZero_s: timeZero,
      settings,
    },
    null,
    2,
  );
  downloadBlob(
    new Blob([content], { type: "application/json;charset=utf-8" }),
    `doppler_conditions_${fileTimestamp()}.json`,
  );
}

export async function exportSvgAsPng(
  svg: SVGSVGElement,
  filename = `doppler_graph_${fileTimestamp()}.png`,
): Promise<void> {
  const serializer = new XMLSerializer();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const source = serializer.serializeToString(clone);
  const svgBlob = new Blob([source], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("グラフ画像を作成できませんでした。"));
      image.src = url;
    });
    const width = Number(svg.getAttribute("width")) || 1120;
    const height = Number(svg.getAttribute("height")) || 560;
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("グラフ画像を作成できませんでした。");
    }
    context.scale(2, 2);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("グラフ画像を作成できませんでした。"));
        }
      }, "image/png");
    });
    downloadBlob(png, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
