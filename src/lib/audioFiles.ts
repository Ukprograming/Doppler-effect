import type { RecordedAudio } from "../types";

export function encodeWav(audio: RecordedAudio): Blob {
  const bytesPerSample = 2;
  const dataLength = audio.samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < audio.samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, audio.samples[index]));
    view.setInt16(
      44 + index * bytesPerSample,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function readChunkText(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

export async function decodeWav(file: File): Promise<RecordedAudio> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  if (
    view.byteLength < 44 ||
    readChunkText(view, 0) !== "RIFF" ||
    readChunkText(view, 8) !== "WAVE"
  ) {
    throw new Error("WAV形式の音声ファイルを選んでください。");
  }

  let offset = 12;
  let audioFormat = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readChunkText(view, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(chunkStart, true);
      channelCount = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (chunkId === "data") {
      dataOffset = chunkStart;
      dataSize = Math.min(chunkSize, view.byteLength - chunkStart);
      break;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  const supported =
    (audioFormat === 1 && [16, 24, 32].includes(bitsPerSample)) ||
    (audioFormat === 3 && bitsPerSample === 32);
  if (
    !supported ||
    channelCount < 1 ||
    sampleRate <= 0 ||
    dataOffset < 0
  ) {
    throw new Error(
      "このWAVの符号化形式には対応していません。PCM 16/24/32bitまたはFloat 32bitを使用してください。",
    );
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataSize / (bytesPerSample * channelCount));
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let mixed = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sampleOffset =
        dataOffset + (frame * channelCount + channel) * bytesPerSample;
      if (audioFormat === 3) {
        mixed += view.getFloat32(sampleOffset, true);
      } else if (bitsPerSample === 16) {
        mixed += view.getInt16(sampleOffset, true) / 0x8000;
      } else if (bitsPerSample === 24) {
        let value =
          view.getUint8(sampleOffset) |
          (view.getUint8(sampleOffset + 1) << 8) |
          (view.getUint8(sampleOffset + 2) << 16);
        if (value & 0x800000) {
          value |= 0xff000000;
        }
        mixed += value / 0x800000;
      } else {
        mixed += view.getInt32(sampleOffset, true) / 0x80000000;
      }
    }
    samples[frame] = mixed / channelCount;
  }

  return {
    samples,
    sampleRate,
    duration: samples.length / sampleRate,
    source: "wav",
  };
}

export function createDemoAudio(
  sampleRate = 48000,
  duration = 5.2,
): RecordedAudio {
  const samples = new Float32Array(Math.round(sampleRate * duration));
  let seed = 9147;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  let phase = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const progress = Math.min(1, Math.max(0, (time - 0.7) / 3.8));
    const frequency = 4000 + 24 * progress * progress;
    phase += (2 * Math.PI * frequency) / sampleRate;
    const envelope =
      Math.min(1, time / 0.08) * Math.min(1, (duration - time) / 0.08);
    samples[index] =
      envelope * (0.34 * Math.sin(phase) + 0.012 * random());
  }
  return { samples, sampleRate, duration, source: "demo" };
}
