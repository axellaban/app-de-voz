"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "connecting" | "live" | "error";
type Mode = "mic" | "tab";
type Line = { id: number; text: string; final: boolean };
type Answer = { id: number; question: string; text: string; done: boolean };

const DG_PARAMS = new URLSearchParams({
  model: "nova-2",
  language: "es",
  smart_format: "true",
  interim_results: "true",
  endpointing: "500",
  utterance_end_ms: "800",
  vad_events: "true",
  encoding: "linear16",
  sample_rate: "16000",
  channels: "1",
}).toString();
const DG_URL = `wss://api.deepgram.com/v1/listen?${DG_PARAMS}`;

const LS_KEY = "copiloto:context:v1";

// ---------- Endpointing semántico ----------
// Deepgram avisa fin de turno por silencio (speech_final/UtteranceEnd), pero
// eso tarda 500-800ms igual. Si el texto acumulado YA suena a pregunta
// completa, disparamos antes (speculativo) y si la persona sigue hablando,
// cancelamos y volvemos a disparar con el texto completo.
const HANGING_WORDS = [
  "y", "o", "pero", "que", "porque", "aunque", "si", "como", "cuando", "mientras",
  "en", "a", "de", "del", "al", "con", "sobre", "para", "por", "sin", "entre", "hacia", "desde", "hasta",
  "el", "la", "los", "las", "un", "una", "unos", "unas", "mi", "tu", "su",
  "así que", "ya que", "es decir", "por ejemplo", "o sea",
];
const HANGING_RE = new RegExp(
  "(^|\\s)(" + HANGING_WORDS.map((w) => w.replace(/\s+/g, "\\s+")).join("|") + ")[.,]?\\s*$",
  "i"
);
const QUESTION_END_RE = /[?¿]\s*$/;
const SPEC_DEBOUNCE_MS = 180;

function looksLikeCompleteQuestion(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 6) return false;
  if (QUESTION_END_RE.test(t)) return true;
  if (HANGING_RE.test(t)) return false;
  return t.split(/\s+/).filter(Boolean).length >= 6;
}

export default function Page() {
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<Mode>("mic");
  const [error, setError] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [profile, setProfile] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [tab, setTab] = useState<"answer" | "transcript">("answer");

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const wakeLockRef = useRef<any>(null);
  const keepAliveRef = useRef<any>(null);

  const transcriptRef = useRef("");
  const questionBufRef = useRef(""); // acumula segmentos finales hasta el fin de utterance
  const lineId = useRef(0);
  const ansId = useRef(0);
  const specTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Turno de pregunta en curso: permite cancelar un disparo especulativo y
  // reemplazarlo si la persona sigue hablando, reusando la misma tarjeta.
  const turnRef = useRef<{ id: number; sentText: string; controller: AbortController | null } | null>(null);

  const scrollT = useRef<HTMLDivElement | null>(null);
  const scrollA = useRef<HTMLDivElement | null>(null);

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
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ company, role, profile }));
    } catch {}
  }, [company, role, profile]);

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
    [profile, company, role]
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

  // Reevalúa el buffer acumulado cada vez que llega texto nuevo: si ya
  // "suena completo", programa un disparo especulativo tras un debounce
  // corto (para no disparar en cada micro-fragmento).
  const scheduleSpeculative = useCallback(() => {
    if (specTimerRef.current) clearTimeout(specTimerRef.current);
    specTimerRef.current = null;
    const buf = questionBufRef.current;
    if (!looksLikeCompleteQuestion(buf)) return;
    specTimerRef.current = setTimeout(() => {
      specTimerRef.current = null;
      fireIfNew(questionBufRef.current, false);
    }, SPEC_DEBOUNCE_MS);
  }, [fireIfNew]);

  const flushQuestion = useCallback(() => {
    if (specTimerRef.current) {
      clearTimeout(specTimerRef.current);
      specTimerRef.current = null;
    }
    const q = questionBufRef.current;
    questionBufRef.current = "";
    fireIfNew(q, true);
  }, [fireIfNew]);

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
        transcriptRef.current += " " + text;
        questionBufRef.current += " " + text;
        // speech_final = Deepgram detectó fin de frase por endpointing (silencio).
        // Si no, evaluamos si el texto ya "suena completo" para disparar antes.
        if (msg.speech_final) flushQuestion();
        else scheduleSpeculative();
      }
    },
    [flushQuestion, scheduleSpeculative]
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
    if (specTimerRef.current) {
      clearTimeout(specTimerRef.current);
      specTimerRef.current = null;
    }
    turnRef.current?.controller?.abort();
    turnRef.current = null;
    try {
      const tokRes = await fetch("/api/deepgram-token", { method: "POST" });
      if (!tokRes.ok) {
        const e = await tokRes.json().catch(() => ({}));
        throw new Error(e.error || "No se pudo obtener token de Deepgram.");
      }
      const { token } = await tokRes.json();

      const stream = await acquireStream(mode);
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();
      await audioCtx.audioWorklet.addModule("/pcm-worklet.js");
      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, "pcm-worklet");
      workletRef.current = worklet;

      const ws = new WebSocket(DG_URL, ["token", token]);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("live");
        worklet.port.onmessage = (e) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
        };
        source.connect(worklet);
        // Keepalive: Deepgram cierra tras ~10s de silencio sin datos.
        keepAliveRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "KeepAlive" }));
        }, 7000);
      };
      ws.onmessage = (e) => onDgMessage(e.data);
      ws.onerror = () => {
        setError("Error en la conexión con Deepgram.");
        setStatus("error");
      };
      ws.onclose = () => {
        cleanup();
        setStatus((s) => (s === "error" ? s : "idle"));
      };

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
  }, [mode, acquireStream, onDgMessage]);

  const cleanup = useCallback(() => {
    if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    keepAliveRef.current = null;
    if (specTimerRef.current) clearTimeout(specTimerRef.current);
    specTimerRef.current = null;
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
    <main style={S.main}>
      <header style={S.header}>
        <div style={S.brand}>
          <span className="cotorra-float" style={{ fontSize: 26, marginRight: 2 }}>🦜</span>
          <span style={S.brandText}>
            <span className="cotorra-title-gradient" style={{ fontSize: 22 }}>CotorreadoAI</span>
            <span style={{ color: "var(--loro-cyan)", fontSize: 13, marginLeft: 4, fontWeight: "600" }}>/es</span>
          </span>
        </div>
        <span className={`mono ${status === "live" ? "pulse-badge" : ""}`} style={S.statusChip(status)}>
          {status === "idle" && "en espera"}
          {connecting && "conectando…"}
          {live && "en vivo"}
          {status === "error" && "error"}
        </span>
      </header>

      {!live && (
        <p className="mono" style={S.tagline}>
          🌴 El loro tropical que te sopla las respuestas en vivo para tus entrevistas.
        </p>
      )}

      {/* Selector de modo */}
      {!live && (
        <div style={{ ...S.modeRow, ...(isIOS ? S.modeRowSingle : {}) }}>
          <button
            className={`mono interactive-btn ${mode === "mic" ? "interactive-btn-on" : ""}`}
            onClick={() => setMode("mic")}
            disabled={connecting}
            style={{ width: "100%" }}
          >
            🎙️ Micrófono
            <span style={S.modeSub}>celular escuchando la sala</span>
          </button>
          {!isIOS && (
            <button
              className={`mono interactive-btn ${mode === "tab" ? "interactive-btn-on" : ""}`}
              onClick={() => setMode("tab")}
              disabled={connecting}
              style={{ width: "100%" }}
            >
              🖥️ Pestaña
              <span style={S.modeSub}>audio directo del Meet · desktop</span>
            </button>
          )}
        </div>
      )}
      {!live && isIOS && (
        <p className="mono" style={S.contextHint}>
          📱 En iPhone solo está disponible el modo micrófono — Safari no permite compartir el audio de una pestaña.
        </p>
      )}

      {error && (
        <div className="mono" style={S.errorBar}>
          {error}
        </div>
      )}

      {/* Contexto de la entrevista (solo antes de arrancar) */}
      {!live && (
        <div className="glass-panel" style={S.panel}>
          <label className="mono" style={S.label}>
            🌴 contexto de la entrevista
          </label>
          <div style={S.contextRow}>
            <div style={S.contextField}>
              <label className="mono" style={S.miniLabel}>
                empresa
              </label>
              <input
                className="cotorra-input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Ej: Mercado Libre"
                disabled={connecting}
              />
            </div>
            <div style={S.contextField}>
              <label className="mono" style={S.miniLabel}>
                puesto / rol
              </label>
              <input
                className="cotorra-input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ej: Frontend Sr."
                disabled={connecting}
              />
            </div>
          </div>
          <label className="mono" style={{ ...S.miniLabel, marginTop: 4 }}>
            tu perfil / cv
          </label>
          <textarea
            className="cotorra-textarea"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="Pegá tu CV, experiencia o notas. El loro se anclará en esto para no inventar nada."
            disabled={connecting}
          />
          {(!company.trim() || !role.trim()) && (
            <p className="mono" style={S.contextHint}>
              Completá empresa y puesto para que el loro prepare respuestas mejor orientadas.
            </p>
          )}
        </div>
      )}

      {/* Tabs móviles */}
      {live && (
        <div style={S.tabsRow}>
          <button
            className={`mono interactive-btn ${tab === "answer" ? "interactive-btn-on" : ""}`}
            style={{ width: "100%", padding: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setTab("answer")}
          >
            🪶 Respuestas sugeridas
          </button>
          <button
            className={`mono interactive-btn ${tab === "transcript" ? "interactive-btn-on" : ""}`}
            style={{ width: "100%", padding: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setTab("transcript")}
          >
            📝 Transcripción
          </button>
        </div>
      )}

      {/* Contenido */}
      <section style={S.content}>
        {(!live || tab === "answer") && (
          <div className={`glass-panel ${live ? "glass-panel-active" : ""}`} style={{ ...S.panel, ...S.answerPanel }}>
            {!live && (
              <label className="mono" style={S.label}>
                🟢 respuestas sugeridas por el loro
              </label>
            )}
            <div ref={scrollA} style={S.answerBody}>
              {answers.length === 0 ? (
                <p style={S.placeholder}>
                  🦜 Silencio en la selva... Cuando el entrevistador termine de preguntar, tu respuesta sugerida aparecerá acá en ~1-2s.
                </p>
              ) : (
                answers.map((a) => (
                  <div key={a.id} className="answer-card-animate" style={S.answerCard}>
                    <div className="mono" style={S.answerQ}>
                      ❓ {a.question}
                    </div>
                    <div style={S.answerText}>
                      {a.text || (
                        <span style={{ ...S.gen }} className="mono">
                          el loro está pensando… 🦜
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {live && tab === "transcript" && (
          <div className="glass-panel" style={{ ...S.panel, ...S.answerPanel }}>
            <div ref={scrollT} style={S.transcript}>
              {lines.length === 0 ? (
                <p style={S.placeholder}>El loro está escuchando lo que dicen... 🦜</p>
              ) : (
                lines.map((l) => (
                  <p
                    key={l.id}
                    style={{ ...S.line, color: l.final ? "var(--ink)" : "var(--ink-dim)" }}
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
      <footer style={S.footer}>
        {!live ? (
          <button onClick={start} disabled={connecting} style={S.primaryBtn} className="mono">
            {connecting ? "Trayendo al loro... 🦜" : mode === "mic" ? "▶ Soltar loro (activar micrófono)" : "▶ Soltar loro (compartir pestaña)"}
          </button>
        ) : (
          <button onClick={stop} style={S.stopBtn} className="mono">
            ■ Guardar loro en la jaula (detener)
          </button>
        )}
        {!live && (
          <p className="mono" style={S.hint}>
            {mode === "mic"
              ? "Apoyá el celular cerca de los parlantes de la notebook."
              : "Elegí la pestaña del Meet y activá “Compartir audio de la pestaña”."}
          </p>
        )}
      </footer>
    </main>
  );
}

const S: Record<string, any> = {
  main: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    padding:
      "calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))",
    gap: 14,
    maxWidth: 760,
    margin: "0 auto",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand: { display: "flex", alignItems: "center", gap: 8 },
  brandText: { fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center" },
  tagline: { fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.5, marginTop: -4 },
  statusChip: (s: Status) => ({
    fontSize: 11,
    padding: "5px 12px",
    borderRadius: 999,
    border: "1px solid var(--line)",
    color: s === "live" ? "var(--loro-red)" : s === "error" ? "var(--loro-red)" : "var(--ink-dim)",
    background: "rgba(9, 29, 21, 0.6)",
  }),
  modeRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  modeRowSingle: { gridTemplateColumns: "1fr" },
  modeSub: { fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 400, letterSpacing: 0, marginTop: 2 },
  errorBar: {
    fontSize: 13,
    color: "#fda4af",
    background: "rgba(244, 63, 94, 0.08)",
    border: "1px solid rgba(244, 63, 94, 0.3)",
    borderRadius: 12,
    padding: "12px 16px",
    lineHeight: 1.5,
  },
  panel: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--loro-yellow)",
    fontWeight: "700",
  },
  contextRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  contextField: { display: "flex", flexDirection: "column", gap: 4 },
  miniLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--ink-faint)",
  },
  contextHint: { fontSize: 11.5, color: "var(--ink-faint)", lineHeight: 1.4 },
  tabsRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  content: { flex: 1, minHeight: 0, display: "flex" },
  answerPanel: { flex: 1, minHeight: 0 },
  answerBody: {
    flex: 1,
    minHeight: 250,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  answerCard: {
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: 16,
    transition: "all 0.3s ease",
  },
  answerQ: { fontSize: 12, color: "var(--loro-cyan)", marginBottom: 8, lineHeight: 1.4, fontWeight: "600" },
  answerText: { fontSize: 16, lineHeight: 1.65, whiteSpace: "pre-wrap", color: "var(--ink)" },
  gen: { fontSize: 13, color: "var(--loro-yellow)" },
  transcript: { flex: 1, minHeight: 250, overflowY: "auto", WebkitOverflowScrolling: "touch" },
  line: { fontSize: 15, lineHeight: 1.6, marginBottom: 8 },
  placeholder: { fontSize: 13.5, color: "var(--ink-dim)", lineHeight: 1.6, padding: 8, textAlign: "center", fontStyle: "italic" },
  footer: { display: "flex", flexDirection: "column", gap: 10, position: "sticky", bottom: 0, paddingTop: 8 },
  primaryBtn: {
    background: "linear-gradient(135deg, var(--loro-green) 0%, var(--loro-yellow) 100%)",
    color: "#040d0a",
    border: "none",
    borderRadius: 14,
    padding: "16px",
    fontSize: 16,
    fontWeight: "800",
    width: "100%",
    boxShadow: "0 4px 20px rgba(16, 185, 129, 0.25)",
    transition: "all 0.2s ease",
    cursor: "pointer",
  },
  stopBtn: {
    background: "linear-gradient(135deg, var(--loro-red) 0%, #b91c1c 100%)",
    color: "#ffffff",
    border: "none",
    borderRadius: 14,
    padding: "16px",
    fontSize: 16,
    fontWeight: "800",
    width: "100%",
    boxShadow: "0 4px 20px rgba(244, 63, 94, 0.25)",
    transition: "all 0.2s ease",
    cursor: "pointer",
  },
  hint: { fontSize: 12, color: "var(--ink-faint)", textAlign: "center", lineHeight: 1.5 },
};

