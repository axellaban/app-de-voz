// Cola de reproducción TTS del simulador: troceo por oraciones + prefetch del
// siguiente chunk mientras suena el actual, para que la latencia percibida sea
// la de la primera oración y no la del texto completo.

// Extrae las oraciones completas de un buffer en streaming y devuelve el
// resto (posible oración a medio llegar). Sin lookbehind: los regex no se
// transpilan y el lookbehind rompe el bundle entero en Safari iOS < 16.4.
export function extractSentences(pending: string): { complete: string[]; rest: string } {
  const complete: string[] = [];
  const re = /[.!?…]+\s+/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pending))) {
    const sentence = pending.slice(start, m.index + m[0].length).trim();
    if (sentence) complete.push(sentence);
    start = re.lastIndex;
  }
  return { complete, rest: pending.slice(start) };
}

type QueueItem = {
  text: string;
  bufferPromise: Promise<AudioBuffer | null>;
  abort: AbortController;
};

export class TtsQueue {
  readonly analyser: AnalyserNode;
  private gain: GainNode;
  private ctx: AudioContext;
  private lang: "es" | "en";
  private items: QueueItem[] = [];
  private currentSource: AudioBufferSourceNode | null = null;
  private pumping = false;
  private inputDone = false;
  private stopped = false;
  private hadError = false;

  onStart?: () => void;
  // Se dispara al empezar a sonar cada oración, con su duración real:
  // permite revelar el texto en pantalla sincronizado con la voz.
  onChunkStart?: (text: string, durationSec: number) => void;
  onAllEnded?: () => void;
  onError?: () => void;
  private started = false;

  constructor(ctx: AudioContext, lang: "es" | "en") {
    this.ctx = ctx;
    this.lang = lang;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.gain = ctx.createGain();
    this.analyser.connect(this.gain);
    this.gain.connect(ctx.destination);
  }

  setMuted(muted: boolean) {
    // Silencia sin frenar la reproducción: el timing (onended) sigue corriendo
    // para no romper la máquina de estados de la entrevista.
    this.gain.gain.value = muted ? 0 : 1;
  }

  enqueue(sentence: string) {
    if (this.stopped) return;
    const text = sentence.trim();
    if (!text) return;
    const abort = new AbortController();
    const bufferPromise = this.fetchAndDecode(text, abort);
    this.items.push({ text, bufferPromise, abort });
    void this.pump();
  }

  // Avisar que no van a entrar más oraciones: cuando la cola drena, dispara onAllEnded.
  finishInput() {
    this.inputDone = true;
    if (!this.pumping && this.items.length === 0) this.fireEnd();
  }

  stop() {
    this.stopped = true;
    for (const it of this.items) it.abort.abort();
    this.items = [];
    try {
      this.currentSource?.stop();
    } catch {}
    this.currentSource = null;
  }

  private async fetchAndDecode(text: string, abort: AbortController): Promise<AudioBuffer | null> {
    // Timeout duro: un fetch de TTS colgado dejaba la cola esperando para
    // siempre y la sala trabada en "hablando".
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 12_000);
    try {
      const res = await fetch("/api/simulador/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: this.lang }),
        signal: abort.signal,
      });
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const buf = await res.arrayBuffer();
      // Forma con callbacks envuelta en promesa: Safari viejo no siempre
      // devuelve promesa desde decodeAudioData.
      return await new Promise<AudioBuffer>((resolve, reject) => {
        this.ctx.decodeAudioData(buf, resolve, reject);
      });
    } catch {
      if (timedOut || !abort.signal.aborted) this.hadError = true;
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    while (!this.stopped && this.items.length > 0) {
      const item = this.items.shift()!;
      const buffer = await item.bufferPromise;
      if (this.stopped) break;
      if (!buffer) continue;
      if (!this.started) {
        this.started = true;
        this.onStart?.();
      }
      this.onChunkStart?.(item.text, buffer.duration);
      await new Promise<void>((resolve) => {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.analyser);
        source.onended = () => resolve();
        this.currentSource = source;
        try {
          source.start();
        } catch {
          resolve();
        }
      });
      this.currentSource = null;
    }
    this.pumping = false;
    if (!this.stopped && this.inputDone && this.items.length === 0) this.fireEnd();
  }

  private fireEnd() {
    if (this.hadError) this.onError?.();
    this.onAllEnded?.();
    this.onAllEnded = undefined;
  }
}

// Lector de nivel para el lip-sync: RMS del dominio temporal con suavizado
// asimétrico (ataque rápido, caída lenta) para que la boca no titile.
export function createLevelReader(analyser: AnalyserNode): () => number {
  const data = new Uint8Array(analyser.fftSize);
  let level = 0;
  return () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const target = Math.min(1, rms * 4);
    level += (target - level) * (target > level ? 0.5 : 0.12);
    return level;
  };
}
