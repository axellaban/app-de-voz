"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "connecting" | "live" | "error";
type Mode = "mic" | "tab";
type Line = { id: number; text: string; final: boolean };
type Answer = { id: number; question: string; text: string; done: boolean };

// ---------- Idioma ----------
// "es" → entrevista y respuesta en español.
// "en" → entrevista y respuesta en inglés.
type Lang = "es" | "en";
const STT_LANG: Record<Lang, string> = { es: "es", en: "en" };
const ANSWER_LANG: Record<Lang, "es" | "en"> = { es: "es", en: "en" };

// ---------- Modelos de LLM ----------
// El usuario elige el modelo (como el idioma). El default es Gemini 2.5 Flash
// (rápido y ya probado). Claude y GPT se activan cuando el token está cargado
// en Vercel; si falta, el backend devuelve un error claro. Los IDs de modelo se
// pueden pisar por env var en el backend (ANTHROPIC_MODEL / OPENAI_MODEL).
type Provider = "gemini" | "anthropic" | "openai";
type ModelOption = { id: string; label: string; provider: Provider; model: string; tag: string };
const MODELS: ModelOption[] = [
  { id: "gemini-flash", label: "Gemini 2.5 Flash", provider: "gemini", model: "gemini-2.5-flash", tag: "Rápido · default" },
  { id: "gemini-pro", label: "Gemini 2.5 Pro", provider: "gemini", model: "gemini-2.5-pro", tag: "Más preciso" },
  { id: "claude-opus", label: "Claude Opus 4.8", provider: "anthropic", model: "claude-opus-4-8", tag: "Máxima calidad" },
  { id: "claude-sonnet", label: "Claude Sonnet 5", provider: "anthropic", model: "claude-sonnet-5", tag: "Equilibrado" },
  { id: "claude-haiku", label: "Claude Haiku 4.5", provider: "anthropic", model: "claude-haiku-4-5", tag: "Rápido" },
  { id: "gpt", label: "GPT (OpenAI)", provider: "openai", model: "gpt-4o", tag: "OpenAI" },
];
const DEFAULT_MODEL_ID = MODELS[0].id;

function buildDgUrl(sttLang: string): string {
  const params = new URLSearchParams({
    model: "nova-2",
    language: sttLang,
    smart_format: "true",
    interim_results: "true",
    endpointing: "500",
    utterance_end_ms: "1000", // mínimo impuesto por Deepgram — NO bajar de 1000
    vad_events: "true",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
  }).toString();
  return `wss://api.deepgram.com/v1/listen?${params}`;
}

const LS_KEY = "copiloto:context:v1";

// ---------- Endpointing semántico ----------
// Deepgram avisa fin de turno por silencio (speech_final/UtteranceEnd), pero
// eso tarda ~1s igual. Si el texto acumulado YA suena a pregunta completa,
// disparamos antes (speculativo) y si la persona sigue hablando, cancelamos y
// volvemos a disparar. Capa 100% cliente: no cambia nada de la conexión.
// Las "palabras que cuelgan" (preposiciones/conjunciones que indican frase
// incompleta) son específicas del idioma del ENTREVISTADOR (el STT).
const HANGING_ES = [
  "y", "o", "pero", "que", "porque", "aunque", "si", "como", "cuando", "mientras",
  "en", "a", "de", "del", "al", "con", "sobre", "para", "por", "sin", "entre", "hacia", "desde", "hasta",
  "el", "la", "los", "las", "un", "una", "unos", "unas", "mi", "tu", "su",
  "así que", "ya que", "es decir", "por ejemplo", "o sea",
];
const HANGING_EN = [
  "and", "or", "but", "so", "because", "that", "which", "when", "while", "if", "as",
  "the", "a", "an", "to", "of", "in", "on", "at", "for", "with", "from", "by", "about", "into", "than", "then",
];
function hangingRe(words: string[]): RegExp {
  return new RegExp(
    "(^|\\s)(" + words.map((w) => w.replace(/\s+/g, "\\s+")).join("|") + ")[.,]?\\s*$",
    "i"
  );
}
const HANGING_RE_ES = hangingRe(HANGING_ES);
const HANGING_RE_EN = hangingRe(HANGING_EN);
const QUESTION_END_RE = /[?¿]\s*$/;
const SPEC_DEBOUNCE_MS = 180;
// "Tu turno": tras responderse una pregunta, en modo micrófono la app deja de
// tomar lo que oye como preguntas nuevas (sos vos respondiendo) hasta que hay
// un silencio sostenido de este largo, que marca que terminaste y vuelve a
// escuchar al entrevistador.
const TURN_SILENCE_MS = 2800;

function looksLikeCompleteQuestion(raw: string, hangRe: RegExp): boolean {
  const t = raw.trim();
  if (t.length < 6) return false;
  if (QUESTION_END_RE.test(t)) return true;
  if (hangRe.test(t)) return false;
  return t.split(/\s+/).filter(Boolean).length >= 6;
}

export default function Page() {
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<Mode>("mic");
  const [error, setError] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [profile, setProfile] = useState("");
  const [lang, setLang] = useState<Lang>("es");
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [lines, setLines] = useState<Line[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [tab, setTab] = useState<"answer" | "transcript">("answer");

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const wakeLockRef = useRef<any>(null);
  const keepAliveRef = useRef<any>(null);
  // Reconexión: distingue cierres pedidos por el usuario (stop/cleanup) de
  // caídas inesperadas del WS en medio de la entrevista.
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El presupuesto de reintentos solo se renueva si la conexión se mantuvo
  // estable un rato — así una conexión que "flapea" (abre y cae al instante)
  // igual agota los 3 intentos y se rinde, en vez de reconectar para siempre.
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Recuperación al volver de segundo plano: reconecta si el socket murió
  // mientras la app estaba en background (Deepgram corta a los ~10s sin audio).
  const resumeRef = useRef<(() => void) | null>(null);

  const transcriptRef = useRef("");
  const questionBufRef = useRef(""); // acumula segmentos finales hasta el fin de utterance
  const lineId = useRef(0);
  const ansId = useRef(0);
  const specTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Turno de pregunta en curso: permite cancelar un disparo especulativo y
  // reemplazarlo si la persona sigue hablando, reusando la misma tarjeta.
  const turnRef = useRef<{ id: number; sentText: string; controller: AbortController | null } | null>(null);
  // "Tu turno" (solo modo micrófono): mientras respondés, no tomar tu voz como
  // pregunta. micModeRef fija si aplica esta lógica en la sesión actual.
  const micModeRef = useRef(false);
  const candidateTurnRef = useRef(false);
  const turnEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollT = useRef<HTMLDivElement | null>(null);
  const scrollA = useRef<HTMLDivElement | null>(null);

  // Modelo elegido, siempre fresco (evita closures viejas en runGenerate).
  const selectedModel = MODELS.find((m) => m.id === modelId) || MODELS[0];
  const modelRef = useRef(selectedModel);
  modelRef.current = selectedModel;

  // ---------- Detección iOS/Safari ----------
  // iOS Safari no soporta getDisplayMedia (captura de pestaña): solo mic.
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(iOS);
    if (iOS) setMode("mic");
  }, []);

  // iOS suspende el AudioContext al bloquear pantalla o cambiar de app.
  // Al volver, lo reactivamos y reintentamos el wake lock.
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== "visible") return;
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      // Da un instante a que el AudioContext y el micrófono se reactiven antes
      // de chequear si hay que reconectar el socket.
      setTimeout(() => resumeRef.current?.(), 300);
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
    };
  }, []);

  // ---------- Contexto persistido (empresa / puesto / perfil) ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.company) setCompany(saved.company);
      if (saved.role) setRole(saved.role);
      if (saved.profile) setProfile(saved.profile);
      // El modelo sí se restaura (preferencia persistente del usuario).
      if (saved.modelId && MODELS.some((m) => m.id === saved.modelId)) setModelId(saved.modelId);
      // El idioma NO se restaura: el default siempre es español (se elige por sesión).
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ company, role, profile, modelId }));
    } catch {}
  }, [company, role, profile, modelId]);

  // ---------- Generación ----------
  // Ejecuta el fetch/stream para una tarjeta ya asignada (id + controller ya
  // decididos por fireIfNew). Si un fireIfNew posterior cancela este
  // controller, el AbortError se ignora en silencio: ya hay una versión
  // mejor en camino para la misma tarjeta.
  const runGenerate = useCallback(
    async (id: number, question: string, controller: AbortController) => {
      setAnswers((prev) => {
        const card: Answer = { id, question, text: "", done: false };
        return prev.some((a) => a.id === id)
          ? prev.map((a) => (a.id === id ? card : a))
          : [card, ...prev].slice(0, 20);
      });
      setTab("answer");
      try {
        const res = await fetch("/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            company,
            role,
            answerLang: ANSWER_LANG[lang],
            provider: modelRef.current.provider,
            model: modelRef.current.model,
            transcript: transcriptRef.current.slice(-4000),
            question,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          setAnswers((prev) =>
            prev.map((a) => (a.id === id ? { ...a, text: "· Error generando respuesta.", done: true } : a))
          );
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, text: acc } : a)));
        }
        setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, done: true } : a)));
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setAnswers((prev) =>
          prev.map((a) => (a.id === id ? { ...a, text: "· Error de red.", done: true } : a))
        );
      }
    },
    [profile, company, role, lang]
  );

  // Decide si vale la pena disparar: evita pedir dos veces lo mismo y, si el
  // turno creció (la persona siguió hablando), cancela el request viejo y
  // relanza con el texto completo reusando la misma tarjeta.
  const fireIfNew = useCallback(
    (question: string, closeTurn: boolean) => {
      const q = question.trim();
      const turn = turnRef.current;
      if (!q || q.length < 4) {
        if (closeTurn) turnRef.current = null;
        return;
      }
      if (turn && turn.sentText === q) {
        if (closeTurn) turnRef.current = null;
        return; // ya cubierto por un disparo especulativo previo idéntico
      }
      turn?.controller?.abort();

      const id = turn ? turn.id : ++ansId.current;
      const controller = new AbortController();
      turnRef.current = closeTurn ? null : { id, sentText: q, controller };
      runGenerate(id, q, controller);
    },
    [runGenerate]
  );

  // Entra/extiende "tu turno": mientras estés respondiendo (mic), la app no
  // toma tu voz como pregunta. Cada vez que seguís hablando se re-arma el
  // timer; cuando hay silencio sostenido, termina tu turno y arranca fresco.
  const bumpCandidateTurn = useCallback(() => {
    candidateTurnRef.current = true;
    if (turnEndTimerRef.current) clearTimeout(turnEndTimerRef.current);
    turnEndTimerRef.current = setTimeout(() => {
      turnEndTimerRef.current = null;
      candidateTurnRef.current = false;
      questionBufRef.current = ""; // fresco para la próxima pregunta del entrevistador
    }, TURN_SILENCE_MS);
  }, []);

  // Reevalúa el buffer acumulado cada vez que llega texto nuevo: si ya
  // "suena completo", programa un disparo especulativo tras un debounce
  // corto (para no disparar en cada micro-fragmento).
  const scheduleSpeculative = useCallback(() => {
    if (specTimerRef.current) clearTimeout(specTimerRef.current);
    specTimerRef.current = null;
    if (micModeRef.current && candidateTurnRef.current) return; // tu turno: no dispares
    const buf = questionBufRef.current;
    // Las palabras que "cuelgan" dependen del idioma del entrevistador (STT).
    const hangRe = STT_LANG[lang] === "en" ? HANGING_RE_EN : HANGING_RE_ES;
    if (!looksLikeCompleteQuestion(buf, hangRe)) return;
    specTimerRef.current = setTimeout(() => {
      specTimerRef.current = null;
      fireIfNew(questionBufRef.current, false);
    }, SPEC_DEBOUNCE_MS);
  }, [fireIfNew, lang]);

  const flushQuestion = useCallback(() => {
    if (specTimerRef.current) {
      clearTimeout(specTimerRef.current);
      specTimerRef.current = null;
    }
    // Si es tu turno (estás respondiendo en mic), descartá lo acumulado en vez
    // de dispararlo como pregunta, y extendé el turno.
    if (micModeRef.current && candidateTurnRef.current) {
      questionBufRef.current = "";
      bumpCandidateTurn();
      return;
    }
    const q = questionBufRef.current;
    questionBufRef.current = "";
    fireIfNew(q, true);
    // Una pregunta real cerró → ahora es tu turno de responder (mic).
    if (micModeRef.current && q.trim().length >= 4) bumpCandidateTurn();
  }, [fireIfNew, bumpCandidateTurn]);

  // Disparo manual: responde YA con lo que haya, sin esperar al endpointing.
  // Fuerza aunque sea tu turno (por si el entrevistador te repreguntó y la app
  // lo tomó como tu voz). Si el buffer ya se vació, usa la cola de la
  // transcripción para re-pedir sobre lo último dicho.
  const answerNow = useCallback(() => {
    if (specTimerRef.current) {
      clearTimeout(specTimerRef.current);
      specTimerRef.current = null;
    }
    candidateTurnRef.current = false;
    if (turnEndTimerRef.current) {
      clearTimeout(turnEndTimerRef.current);
      turnEndTimerRef.current = null;
    }
    const q = questionBufRef.current.trim() || transcriptRef.current.trim().slice(-300);
    questionBufRef.current = "";
    fireIfNew(q, true);
    if (micModeRef.current) bumpCandidateTurn();
  }, [fireIfNew, bumpCandidateTurn]);

  // Limpia respuestas y transcripción en pantalla (como el "Clear" de Parakeet),
  // sin cortar la sesión: el Loro sigue escuchando.
  const clearAll = useCallback(() => {
    turnRef.current?.controller?.abort();
    turnRef.current = null;
    questionBufRef.current = "";
    setAnswers([]);
    setLines([]);
  }, []);

  // ---------- Mensajes Deepgram ----------
  const onDgMessage = useCallback(
    (raw: string) => {
      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      // Fin de intervención (silencio prolongado) -> disparo lo acumulado.
      if (msg.type === "UtteranceEnd") {
        flushQuestion();
        return;
      }
      if (msg.type !== "Results") return;

      const alt = msg.channel?.alternatives?.[0];
      const text: string = alt?.transcript || "";
      if (!text) return;
      const isFinal = !!msg.is_final;

      setLines((prev) => {
        const next = [...prev];
        if (next.length && !next[next.length - 1].final) {
          next[next.length - 1] = { id: next[next.length - 1].id, text, final: isFinal };
        } else {
          next.push({ id: ++lineId.current, text, final: isFinal });
        }
        return next.slice(-60);
      });

      if (isFinal) {
        transcriptRef.current += " " + text; // contexto siempre (incluye tu voz)
        // Si es tu turno (mic, estás respondiendo), no tomes tu voz como
        // pregunta: solo extendé el turno y seguí.
        if (micModeRef.current && candidateTurnRef.current) {
          bumpCandidateTurn();
          return;
        }
        questionBufRef.current += " " + text;
        // speech_final = Deepgram detectó fin de frase por endpointing (silencio).
        // Si no, evaluamos si el texto ya "suena completo" para disparar antes.
        if (msg.speech_final) flushQuestion();
        else scheduleSpeculative();
      }
    },
    [flushQuestion, scheduleSpeculative, bumpCandidateTurn]
  );

  // ---------- Captura ----------
  const acquireStream = useCallback(async (m: Mode): Promise<MediaStream> => {
    if (m === "tab") {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const at = s.getAudioTracks();
      if (at.length === 0) {
        s.getTracks().forEach((t) => t.stop());
        throw new Error('No se compartió audio. Al elegir la pestaña activá "Compartir audio de la pestaña".');
      }
      s.getVideoTracks().forEach((t) => t.stop());
      return new MediaStream(at);
    }
    // mic
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }, []);

  const start = useCallback(async () => {
    setError("");
    setStatus("connecting");
    questionBufRef.current = "";
    intentionalCloseRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (specTimerRef.current) {
      clearTimeout(specTimerRef.current);
      specTimerRef.current = null;
    }
    turnRef.current?.controller?.abort();
    turnRef.current = null;
    // "Tu turno" solo aplica en modo micrófono (en Pestaña no oís tu propia voz).
    micModeRef.current = mode === "mic";
    candidateTurnRef.current = false;
    if (turnEndTimerRef.current) {
      clearTimeout(turnEndTimerRef.current);
      turnEndTimerRef.current = null;
    }
    // Idioma del entrevistador (STT) fijado al inicio de la sesión.
    const dgUrl = buildDgUrl(STT_LANG[lang]);
    try {
      const stream = await acquireStream(mode);
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();
      await audioCtx.audioWorklet.addModule("/pcm-worklet.js");
      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, "pcm-worklet");
      workletRef.current = worklet;
      // El handler apunta siempre al socket vigente vía wsRef: tras una
      // reconexión el audio fluye solo al socket nuevo, sin re-cablear nada.
      worklet.port.onmessage = (e) => {
        const w = wsRef.current;
        if (w && w.readyState === WebSocket.OPEN) w.send(e.data);
      };
      source.connect(worklet);

      // Abre (o reabre) el WebSocket contra Deepgram reusando el mismo
      // stream/worklet: en una reconexión NO se vuelve a pedir permiso de
      // micrófono ni de pestaña, solo se reconstruye el socket.
      const connectWs = async () => {
        const tokRes = await fetch("/api/deepgram-token", { method: "POST" });
        if (!tokRes.ok) {
          const e = await tokRes.json().catch(() => ({}));
          throw new Error(e.error || "No se pudo obtener token de Deepgram.");
        }
        const { token } = await tokRes.json();

        const ws = new WebSocket(dgUrl, ["token", token]);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
          setError("");
          setStatus("live");
          // Renueva el presupuesto de reintentos solo si la conexión aguanta
          // 10s estable (no apenas abre): evita el loop infinito de flapping.
          if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
          stableTimerRef.current = setTimeout(() => {
            reconnectAttemptsRef.current = 0;
          }, 10000);
          // Keepalive: Deepgram cierra tras ~10s de silencio sin datos.
          if (keepAliveRef.current) clearInterval(keepAliveRef.current);
          keepAliveRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: "KeepAlive" }));
          }, 7000);
        };
        ws.onmessage = (e) => onDgMessage(e.data);
        ws.onerror = (err) => {
          console.error("Deepgram WebSocket error:", err);
        };
        ws.onclose = (event) => {
          if (stableTimerRef.current) {
            clearTimeout(stableTimerRef.current);
            stableTimerRef.current = null;
          }
          if (intentionalCloseRef.current) return; // stop()/cleanup() maneja el estado
          if (scheduleReconnect()) return;
          cleanup();
          if (event.code !== 1000 && event.code !== 1001) {
            setError("Se cortó la conexión. Revisá tu internet y tocá para reanudar.");
            setStatus("error");
          } else {
            setStatus((s) => (s === "error" ? s : "idle"));
          }
        };
      };

      // Caída inesperada en medio de la sesión: reintenta hasta 3 veces con
      // backoff corto, mientras el audio siga vivo. Devuelve false si ya no
      // corresponde reintentar (el llamador decide el estado final).
      const scheduleReconnect = (): boolean => {
        const trackAlive = stream.getAudioTracks()[0]?.readyState === "live";
        if (intentionalCloseRef.current || !trackAlive || reconnectAttemptsRef.current >= 3) return false;
        reconnectAttemptsRef.current += 1;
        setError(`Se cortó la conexión — reconectando (intento ${reconnectAttemptsRef.current}/3)…`);
        const delay = 600 * 2 ** (reconnectAttemptsRef.current - 1); // 600ms, 1.2s, 2.4s
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connectWs().catch(() => {
            // Falló antes de abrir el socket (p.ej. el fetch del token):
            // reintenta por el mismo camino o rinde el turno con error.
            if (!scheduleReconnect()) {
              cleanup();
              setError("Se perdió la conexión y no se pudo reanudar. Tocá para reintentar.");
              setStatus("error");
            }
          });
        }, delay);
        return true;
      };

      // Al volver de segundo plano: si el socket murió mientras la app estaba
      // en background (Deepgram corta a los ~10s sin audio) pero el micrófono
      // sigue vivo, reconectamos solos en vez de dejar el error en pantalla.
      resumeRef.current = () => {
        if (intentionalCloseRef.current) return;
        const w = wsRef.current;
        const socketDead = !w || w.readyState === WebSocket.CLOSING || w.readyState === WebSocket.CLOSED;
        const trackAlive = stream.getAudioTracks()[0]?.readyState === "live";
        if (!socketDead || !trackAlive) return;
        if (reconnectTimerRef.current) return; // ya hay una reconexión en curso
        reconnectAttemptsRef.current = 0;
        setError("Reconectando…");
        setStatus("connecting");
        connectWs().catch(() => {
          if (!scheduleReconnect()) {
            cleanup();
            setError("Se perdió la conexión y no se pudo reanudar. Tocá para reintentar.");
            setStatus("error");
          }
        });
      };

      await connectWs();

      stream.getAudioTracks()[0].onended = () => stop();

      // Wake lock: evita que el celular apague la pantalla en modo mic.
      try {
        // @ts-ignore
        if (navigator.wakeLock) wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {}
    } catch (err: any) {
      setError(err?.message || "Error al iniciar.");
      setStatus("error");
      cleanup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, acquireStream, onDgMessage, lang]);

  const cleanup = useCallback(() => {
    // Marca el cierre como intencional ANTES de cerrar el WS: su onclose no
    // debe disparar una reconexión.
    intentionalCloseRef.current = true;
    resumeRef.current = null;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
    stableTimerRef.current = null;
    if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    keepAliveRef.current = null;
    if (specTimerRef.current) clearTimeout(specTimerRef.current);
    specTimerRef.current = null;
    if (turnEndTimerRef.current) clearTimeout(turnEndTimerRef.current);
    turnEndTimerRef.current = null;
    candidateTurnRef.current = false;
    turnRef.current?.controller?.abort();
    turnRef.current = null;
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
      wsRef.current?.close();
    } catch {}
    try {
      workletRef.current?.disconnect();
    } catch {}
    try {
      audioCtxRef.current?.close();
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      wakeLockRef.current?.release?.();
    } catch {}
    wsRef.current = null;
    workletRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
    wakeLockRef.current = null;
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  // Re-adquiere el wake lock al volver a la app: iOS lo libera solo al perder foco.
  useEffect(() => {
    const reacquire = async () => {
      if (document.visibilityState !== "visible" || status !== "live" || wakeLockRef.current) return;
      try {
        // @ts-ignore
        if (navigator.wakeLock) wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {}
    };
    document.addEventListener("visibilitychange", reacquire);
    return () => document.removeEventListener("visibilitychange", reacquire);
  }, [status]);

  useEffect(() => {
    scrollT.current?.scrollTo({ top: scrollT.current.scrollHeight });
  }, [lines]);
  useEffect(() => {
    scrollA.current?.scrollTo({ top: 0 });
  }, [answers.length]);

  const live = status === "live";
  const connecting = status === "connecting";

  return (
    <main className="app-container">
      <header className="brand-header">
        <div className="brand">
          <span className="brand-title">Loreado.ia 🦜</span>
        </div>
        <span className={`status-chip ${live ? "status-chip-live" : ""}`}>
          {status === "idle" && "en espera"}
          {connecting && "conectando…"}
          {live && "en vivo"}
          {status === "error" && "error"}
        </span>
      </header>

      {!live && (
        <p className="tagline">
          El Loro escucha tu entrevista en tiempo real y te sopla las respuestas. 🦜
        </p>
      )}

      {/* Selector de idioma */}
      {!live && (
        <div>
          <label className="mono form-label" style={{ display: "block", marginBottom: 8 }}>
            Idioma de la entrevista
          </label>
          <div className="seg" role="tablist">
            <button
              className={`seg-btn ${lang === "es" ? "seg-active" : ""}`}
              onClick={() => setLang("es")}
              disabled={connecting}
              aria-selected={lang === "es"}
            >
              🇪🇸 Español
            </button>
            <button
              className={`seg-btn ${lang === "en" ? "seg-active" : ""}`}
              onClick={() => setLang("en")}
              disabled={connecting}
              aria-selected={lang === "en"}
            >
              🇺🇸 English
            </button>
          </div>
        </div>
      )}

      {/* Selector de modelo de LLM */}
      {!live && (
        <div>
          <label className="mono form-label" style={{ display: "block", marginBottom: 8 }}>
            Modelo de IA
          </label>
          <div className="select-wrap">
            <select
              className="model-select"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={connecting}
              aria-label="Modelo de IA"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.tag}
                </option>
              ))}
            </select>
            <span className="select-caret" aria-hidden="true">▾</span>
          </div>
          {selectedModel.provider !== "gemini" && (
            <p className="mono form-hint" style={{ marginTop: 6 }}>
              {selectedModel.provider === "anthropic"
                ? "Requiere ANTHROPIC_API_KEY cargada en Vercel."
                : "Requiere OPENAI_API_KEY cargada en Vercel."}
            </p>
          )}
        </div>
      )}

      {/* Selector de modo */}
      {!live && (
        <div className={`grid-responsive`}>
          <button
            className={`btn-select ${mode === "mic" ? "btn-select-active" : ""}`}
            onClick={() => setMode("mic")}
            disabled={connecting}
          >
            🎙️ Micrófono
            <span className="btn-select-sub">Escuchar la sala por mic</span>
          </button>
          {!isIOS && (
            <button
              className={`btn-select ${mode === "tab" ? "btn-select-active" : ""}`}
              onClick={() => setMode("tab")}
              disabled={connecting}
            >
              🖥️ Pestaña
              <span className="btn-select-sub">Audio digital de Meet/Zoom</span>
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="mono error-box" style={{
          fontSize: 13,
          color: "#fda4af",
          background: "rgba(244, 63, 94, 0.08)",
          border: "1px solid rgba(244, 63, 94, 0.3)",
          borderRadius: 12,
          padding: "12px 16px",
          lineHeight: 1.5
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Contexto de la entrevista (solo antes de arrancar) */}
      {!live && (
        <div className="panel">
          <label className="mono form-label">
            Contexto de la entrevista
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="mono form-mini-label">
              Empresa
            </label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Ej: Mercado Libre"
              className="form-input"
              disabled={connecting}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            <label className="mono form-mini-label">
              Descripción del puesto
            </label>
            <textarea
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Pegá la descripción del puesto: responsabilidades, requisitos, seniority."
              className="form-textarea form-textarea-sm"
              disabled={connecting}
            />
          </div>
          <label className="mono form-mini-label" style={{ marginTop: 4 }}>
            Tu perfil / CV
          </label>
          <textarea
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="Pegá tu CV, experiencia o notas. El Loro usará esto para responder."
            className="form-textarea"
            disabled={connecting}
          />
          {(!company.trim() || !role.trim()) && (
            <p className="mono form-hint">
              Completá empresa y descripción del puesto para respuestas mejor personalizadas.
            </p>
          )}
        </div>
      )}

      {/* Tira de escucha en vivo: muestra lo último que se oye y da acceso
          secundario a la transcripción. La respuesta es la protagonista. */}
      {live && (
        <div className="listen-bar mono">
          {tab === "answer" ? (
            <>
              <span className="eq" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
              <span className="listen-text">
                {lines.length ? lines[lines.length - 1].text : "escuchando…"}
              </span>
              <button className="listen-toggle" onClick={() => setTab("transcript")}>
                Transcripción
              </button>
            </>
          ) : (
            <>
              <span className="listen-text" style={{ color: "var(--ink)", fontWeight: 600 }}>
                Transcripción completa
              </span>
              <button className="listen-toggle" onClick={() => setTab("answer")}>
                ← Respuestas
              </button>
            </>
          )}
        </div>
      )}

      {/* Contenido */}
      <section style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", marginTop: 4 }}>
        {!live && (
          <p
            className="mono"
            style={{ margin: "auto", textAlign: "center", color: "var(--ink-faint)", fontSize: 13, lineHeight: 1.6, maxWidth: 340, padding: 16 }}
          >
            🦜 Cuando el entrevistador pregunte, tu respuesta aparece sola acá en ~1-2s. No tenés que apretar nada.
          </p>
        )}
        {live && tab === "answer" && (
          <div className="panel" style={{ flex: 1, minHeight: 0 }}>
            <div ref={scrollA} className="answers-container">
              {answers.length === 0 ? (
                <p className="placeholder" style={{ fontSize: 13.5, color: "var(--ink-dim)", lineHeight: 1.6, textAlign: "center", fontStyle: "italic", padding: "8px" }}>
                  Cuando el entrevistador termine de preguntar, tu respuesta aparece acá en ~1-2s.
                </p>
              ) : (
                answers.map((a, index) => (
                  <div key={a.id} className={`answer-card ${index === 0 ? "answer-card-first" : ""}`}>
                    <div className="answer-card-q-row">
                      <span className="mono answer-card-label answer-card-label-q">💬 Pregunta</span>
                      <span className="answer-card-question">{a.question}</span>
                    </div>
                    <div className="answer-card-a-row">
                      <span className="mono answer-card-label answer-card-label-a">⭐ Respuesta</span>
                      <div className="answer-card-text">
                        {a.text ? (
                          // Colapsa líneas en blanco de más entre viñetas, pero conserva
                          // el salto simple que separa la apertura de las viñetas.
                          a.text.replace(/\n{3,}/g, "\n\n").trim()
                        ) : (
                          <span className="mono answer-card-loading">
                            generando…
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {live && tab === "transcript" && (
          <div className="panel" style={{ flex: 1, minHeight: 0 }}>
            <div ref={scrollT} className="transcript-container">
              {lines.length === 0 ? (
                <p className="placeholder" style={{ fontSize: 13.5, color: "var(--ink-dim)", lineHeight: 1.6, textAlign: "center", fontStyle: "italic", padding: "8px" }}>
                  Escuchando… la transcripción aparece acá.
                </p>
              ) : (
                lines.map((l) => (
                  <p
                    key={l.id}
                    className="transcript-line"
                    style={{ color: l.final ? "var(--ink)" : "var(--ink-dim)" }}
                  >
                    {l.text}
                  </p>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer style={{ display: "flex", flexDirection: "column", gap: 8, position: "sticky", bottom: 0, paddingTop: 4, background: "var(--bg)" }}>
        {!live ? (
          <button onClick={start} disabled={connecting} className="btn-action btn-primary">
            {connecting ? "Conectando… 🦜" : mode === "mic" ? "▶ Soltar el Loro (activar micrófono)" : "▶ Soltar el Loro (compartir pestaña)"}
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={answerNow} className="btn-action btn-primary">
              ✦ Responder ahora
            </button>
            <div className="grid-responsive" style={{ gap: 10 }}>
              <button onClick={clearAll} className="btn-action btn-ghost">
                Limpiar
              </button>
              <button onClick={stop} className="btn-action btn-stop">
                ■ Detener
              </button>
            </div>
          </div>
        )}
        {!live && (
          <p className="mono btn-hint">
            {mode === "mic"
              ? "Apoyá el celular cerca de los parlantes. Sin auriculares: el micrófono tiene que poder oír al entrevistador."
              : "Elegí la pestaña del Meet y activá “Compartir audio de la pestaña”. Con auriculares funciona igual."}
          </p>
        )}
      </footer>
    </main>
  );
}
