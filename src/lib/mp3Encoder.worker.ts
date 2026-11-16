import { Mp3Encoder } from '@breezystack/lamejs';

// Runs off the main thread: receives mono Float32 PCM chunks, encodes MP3 32 kbps.

const SUPPORTED_RATES = new Set([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);

let encoder: InstanceType<typeof Mp3Encoder> | null = null;
let step = 1; // input samples per output sample (1 = no resampling)
let pending = new Float32Array(0);
const mp3Parts: Uint8Array[] = [];

function resamplePcm(input: Float32Array): Float32Array {
  if (step === 1) return input;
  const joined = new Float32Array(pending.length + input.length);
  joined.set(pending);
  joined.set(input, pending.length);
  const outCount = Math.max(0, Math.floor((joined.length - 1) / step));
  const out = new Float32Array(outCount);
  for (let i = 0; i < outCount; i++) {
    const pos = i * step;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = joined[idx] ?? 0;
    const b = joined[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  const keepFrom = Math.floor(outCount * step);
  pending = joined.slice(keepFrom);
  return out;
}

function toInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function pushEncoded(chunk: Int8Array | Uint8Array | number[] | null) {
  if (!chunk || !chunk.length) return;
  mp3Parts.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
}

self.onmessage = (event: MessageEvent) => {
  const msg = event.data as
    | { type: 'init'; sampleRate: number; kbps?: number }
    | { type: 'pcm'; samples: Float32Array }
    | { type: 'flush' };
  try {
    if (msg.type === 'init') {
      const rate = SUPPORTED_RATES.has(msg.sampleRate) ? msg.sampleRate : 44100;
      encoder = new Mp3Encoder(1, rate, msg.kbps ?? 32);
      step = msg.sampleRate / rate;
      pending = new Float32Array(0);
      mp3Parts.length = 0;
      return;
    }
    if (!encoder) return;
    if (msg.type === 'pcm') {
      const pcm = resamplePcm(msg.samples);
      if (!pcm.length) return;
      pushEncoded(encoder.encodeBuffer(toInt16(pcm)));
      return;
    }
    if (msg.type === 'flush') {
      pushEncoded(encoder.flush());
      const parts = mp3Parts.map((part) => {
        const buffer = part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer;
        return buffer;
      });
      (self as unknown as Worker).postMessage({ type: 'done', parts }, parts);
    }
  } catch (error) {
    (self as unknown as Worker).postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
