// Universal voice-memo capture: raw PCM via getUserMedia + AudioContext,
// encoded to MP3 (32 kbps) in a Web Worker. Replaces MediaRecorder so the
// format is identical on Chrome, Samsung Internet and Safari iOS.

export interface PcmRecordingSession {
  /** Stops capture, closes the mic/context and resolves the finished MP3 blob. */
  stop(): Promise<Blob>;
  /** Aborts capture without producing audio (unmount, fatal error). */
  cancel(): void;
}

interface StartOptions {
  /** Called when capture dies on its own (e.g. no audio data within 2 s). */
  onFatal?: (message: string) => void;
}

const WORKLET_NAME = 'easy-med-pcm-capture';
const WORKLET_SOURCE = `
class EasyMedPcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.pending = new Float32Array(0); }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      const joined = new Float32Array(this.pending.length + channel.length);
      joined.set(this.pending);
      joined.set(channel, this.pending.length);
      this.pending = joined.slice(-64);
      if (joined.length - 64 >= 2048) {
        const chunk = joined.slice(0, joined.length - 64);
        this.port.postMessage(chunk, [chunk.buffer]);
        this.pending = joined.slice(joined.length - 64);
      }
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', EasyMedPcmCapture);
`;

const NO_AUDIO_TIMEOUT_MS = 2000;

function downmix(input: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return input;
  const out = new Float32Array(input.length / channels);
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += input[i * channels + c] ?? 0;
    out[i] = sum / channels;
  }
  return out;
}

export async function startPcmRecording({ onFatal }: StartOptions = {}): Promise<PcmRecordingSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: 44100 });
  } catch {
    context = new AudioContext();
  }
  if (context.state === 'suspended') await context.resume();

  const worker = new Worker(new URL('./mp3Encoder.worker.ts', import.meta.url), { type: 'module' });
  worker.postMessage({ type: 'init', sampleRate: context.sampleRate, kbps: 32 });

  let gotAudio = false;
  let fatalNotified = false;
  const notifyFatal = (message: string) => {
    if (fatalNotified) return;
    fatalNotified = true;
    cleanup();
    onFatal?.(message);
  };

  const forward = (samples: Float32Array) => {
    if (samples.length === 0) return;
    gotAudio = true;
    const copy = samples.slice();
    worker.postMessage({ type: 'pcm', samples: copy }, [copy.buffer]);
  };

  const source = context.createMediaStreamSource(stream);
  let node: AudioNode;
  if (context.audioWorklet) {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const worklet = new AudioWorkletNode(context, WORKLET_NAME);
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => forward(event.data);
    node = worklet;
  } else {
    const processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer;
      const data = input.getChannelData(0);
      const mono = input.numberOfChannels > 1
        ? downmix(inputCopyAll(input), input.numberOfChannels)
        : data;
      forward(mono.slice());
    };
    node = processor;
  }
  source.connect(node);
  node.connect(context.destination);

  function inputCopyAll(buffer: AudioBuffer): Float32Array {
    // ScriptProcessor fallback: interleaved copy of all channels for downmix.
    const frames = buffer.length;
    const channels = buffer.numberOfChannels;
    const out = new Float32Array(frames * channels);
    for (let c = 0; c < channels; c++) {
      const channelData = buffer.getChannelData(c);
      for (let i = 0; i < frames; i++) out[i * channels + c] = channelData[i];
    }
    return out;
  }

  const watchdog = window.setTimeout(() => {
    if (!gotAudio) notifyFatal('Aucun son détecté : vérifiez que le microphone n’est pas coupé et réessayez.');
  }, NO_AUDIO_TIMEOUT_MS);

  worker.addEventListener('error', () => notifyFatal('Le moteur d’encodage audio a échoué sur cet appareil.'));

  let stopped = false;
  const cleanup = () => {
    window.clearTimeout(watchdog);
    try { node.disconnect(); } catch { /* already disconnected */ }
    try { source.disconnect(); } catch { /* already disconnected */ }
    stream.getTracks().forEach((track) => track.stop());
    void context.close().catch(() => undefined);
  };

  return {
    async stop() {
      if (stopped) return new Blob([], { type: 'audio/mpeg' });
      stopped = true;
      cleanup();
      const parts = await new Promise<ArrayBuffer[]>((resolve, reject) => {
        const onMessage = (event: MessageEvent) => {
          const data = event.data as { type: string; parts?: ArrayBuffer[]; message?: string };
          if (data.type === 'done') {
            worker.removeEventListener('message', onMessage);
            resolve(data.parts ?? []);
          } else if (data.type === 'error') {
            worker.removeEventListener('message', onMessage);
            reject(new Error(data.message || 'Encodage audio impossible.'));
          }
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({ type: 'flush' });
      }).finally(() => worker.terminate());
      return new Blob(parts, { type: 'audio/mpeg' });
    },
    cancel() {
      if (stopped) return;
      stopped = true;
      cleanup();
      worker.terminate();
    },
  };
}
