"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { track } from "../lib/track";
import Avatar, { type AvatarState } from "./Avatar";
import { TtsQueue, extractSentences } from "./tts";

type Line = { id: number; text: string; final: boolean };
type Lang = "es" | "en";
type Provider = "gemini" | "anthropic" | "openai";
type ModelOption = { id: string; label: string; provider: Provider; model: string; tag: string };

type InterviewType = "general" | "technical" | "behavioral" | "hr";

// Fases del turno de entrevista. El flujo es automático: el entrevistador
// habla (speaking), escucha (listening) y cierra la respuesta por silencio
// (confirming) sin que el usuario tenga que tocar nada.
type Phase =
  | "setup"
  | "connecting"
  | "asking"
  | "speaking"
  | "listening"
  | "confirming"
  | "feedback";

type HistoryItem = {
  question: string;
  answer: string;
};

type FeedbackQuestion = {
  question: string;
  answer: string;
  score?: number;
  analysis: string;
  suggestion: string;
};

type FeedbackIndicator = { name: string; score: number };

type FeedbackReport = {
  score: number;
  summary: string;
  indicators?: FeedbackIndicator[];
  strengths: string[];
  improvements: string[];
  questions: FeedbackQuestion[];
};

// Colores de semáforo según score.
function scoreColor(score: number): string {
  return score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
}

// Velocímetro estilo tablero de auto para el puntaje general.
function polarPoint(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}
function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const a = polarPoint(cx, cy, r, fromDeg);
  const b = polarPoint(cx, cy, r, toDeg);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${r} ${r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}
function ScoreGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  // La aguja arranca en 0 y barre hasta el score al montar.
  const [needle, setNeedle] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setNeedle(clamped), 150);
    return () => clearTimeout(t);
  }, [clamped]);
  const needleDeg = needle * 1.8 - 90;
  const R = 82;
  return (
    <div className="sim-gauge" role="img" aria-label={`Puntaje ${clamped} de 100`}>
      <svg viewBox="0 0 200 122" className="sim-gauge-svg">
        {/* Arcos de fondo: rojo / ámbar / verde con pequeños gaps */}
        <path d={arcPath(100, 104, R, 180, 111)} stroke="#fecaca" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d={arcPath(100, 104, R, 107, 57)} stroke="#fde68a" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d={arcPath(100, 104, R, 53, 0)} stroke="#a7f3d0" strokeWidth="14" fill="none" strokeLinecap="round" />
        {/* Ticks */}
        {[0, 25, 50, 75, 100].map((v) => {
          const a = polarPoint(100, 104, R - 14, 180 - v * 1.8);
          const b = polarPoint(100, 104, R - 20, 180 - v * 1.8);
          return <line key={v} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cbd5e1" strokeWidth="2" />;
        })}
        {/* Aguja */}
        <g
          style={{
            transform: `rotate(${needleDeg}deg)`,
            transformOrigin: "100px 104px",
            transition: "transform 1.3s cubic-bezier(0.3, 1.3, 0.45, 1)",
          }}
        >
          <line x1="100" y1="104" x2="100" y2="36" stroke="#17181a" strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="104" r="8" fill="#17181a" />
          <circle cx="100" cy="104" r="3" fill="#fff" />
        </g>
      </svg>
      <div className="sim-gauge-value" style={{ color: scoreColor(clamped) }}>
        {clamped}
        <span className="sim-gauge-total">/100</span>
      </div>
      <div className="sim-score-label">PUNTAJE GENERAL</div>
    </div>
  );
}

// Semáforo de tres luces: se enciende la que corresponde al score.
function TrafficLight({ score }: { score: number }) {
  const level = score >= 75 ? 2 : score >= 50 ? 1 : 0;
  const colors = ["#ef4444", "#f59e0b", "#10b981"];
  return (
    <span className="sim-traffic" aria-hidden="true">
      {colors.map((c, i) => (
        <span
          key={c}
          className="sim-traffic-dot"
          style={i === level ? { background: c, boxShadow: `0 0 8px ${c}88` } : undefined}
        />
      ))}
    </span>
  );
}

const STT_LANG: Record<Lang, string> = { es: "es", en: "en" };

const MODELS: ModelOption[] = [
  { id: "gemini-flash", label: "Gemini 2.5 Flash", provider: "gemini", model: "gemini-2.5-flash", tag: "Recomendado" },
  { id: "gemini-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "gemini", model: "gemini-2.5-flash-lite", tag: "Rápido" },
];
const DEFAULT_MODEL_ID = "gemini-flash";

// Provider Marks
function OpenAIMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#000" aria-hidden="true">
      <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-3.99 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 22a6.05 6.05 0 0 0 5.77-4.21 5.99 5.99 0 0 0 3.99-2.9 6.05 6.05 0 0 0-.75-7.07zm-9.02 12.6a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5zM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.09 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 21a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.48 4.48 0 0 1 2.34-1.97V11.6a.77.77 0 0 0 .39.68l5.82 3.36-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9zm16.6 3.86-5.84-3.39L15.11 7.2a.08.08 0 0 1 .07 0l4.83 2.78a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.39-.68zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.42 7.24V4.91a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.32 12.9 6.3 11.73a.08.08 0 0 1-.04-.06V6.1a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.72 5.49a.79.79 0 0 0-.39.68zm1.1-2.36L12 9.06l2.6 1.5v3l-2.6 1.5-2.6-1.5z" />
    </svg>
  );
}
function AnthropicMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="#CC785C" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
      <line x1="18.4" y1="5.6" x2="5.6" y2="18.4" />
    </svg>
  );
}
function GeminiMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
function ProviderIcon({ provider }: { provider: Provider }) {
  return (
    <span className="dd-icon">
      {provider === "openai" ? <OpenAIMark /> : provider === "anthropic" ? <AnthropicMark /> : <GeminiMark />}
    </span>
  );
}

// Field icons
const fieldIconProps = {
  width: 13,
  height: 13,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
function BriefcaseIcon() {
  return (
    <svg {...fieldIconProps}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg {...fieldIconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg {...fieldIconProps}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Íconos de la sala (header de videollamada)
const ctlIconProps = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
function BackIcon() {
  return (
    <svg {...ctlIconProps}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function CamIcon({ off }: { off?: boolean }) {
  return (
    <svg {...ctlIconProps}>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      {off && <line x1="2" y1="2" x2="22" y2="22" />}
    </svg>
  );
}
function MicIcon({ off }: { off?: boolean }) {
  return (
    <svg {...ctlIconProps}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" />
      {off && <line x1="2" y1="2" x2="22" y2="22" />}
    </svg>
  );
}
function SpeakerIcon({ off }: { off?: boolean }) {
  return (
    <svg {...ctlIconProps}>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {off ? <line x1="16" y1="9" x2="22" y2="15" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
      {off && <line x1="22" y1="9" x2="16" y2="15" />}
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg {...ctlIconProps} width={15} height={15}>
      <path d="M10.7 13.3a15 15 0 0 1-2.8-4l2-2a1 1 0 0 0 .2-1L9.4 2.6a1 1 0 0 0-1-.6H4.6a1 1 0 0 0-1 1.1A19 19 0 0 0 20.9 20.4a1 1 0 0 0 1.1-1v-3.8a1 1 0 0 0-.6-1l-3.7-1.7a1 1 0 0 0-1 .2l-2 2a15 15 0 0 1-4-1.8z" transform="rotate(135 12 12)" />
    </svg>
  );
}

// Info tip
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <span className="info-tip" ref={ref}>
      <button
        type="button"
        className="info-tip-btn"
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        aria-label="Ayuda"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      {open && <span className="info-bubble">{text}</span>}
    </span>
  );
}

// Dropdown component
type DDOption = {
  id: string;
  label: string;
  icon?: ReactNode;
  tag?: string;
  badge?: string;
};
function Dropdown({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  alignRight,
}: {
  value: string;
  options: DDOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  alignRight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);
  const current = options.find((o) => o.id === value) || options[0];
  return (
    <div className="dd" ref={ref}>
      <button
        type="button"
        className="dd-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="dd-trigger-main">
          {current?.icon}
          <span className="dd-trigger-label">{current?.label}</span>
        </span>
        <span className="dd-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`dd-menu ${alignRight ? "dd-menu-right" : ""}`} role="listbox">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              className={`dd-option ${o.id === value ? "dd-option-sel" : ""}`}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              <span className="dd-option-left">
                {o.icon}
                <span className="dd-option-label">{o.label}</span>
                {o.tag && <span className="dd-option-tag">{o.tag}</span>}
              </span>
              <span className="dd-option-right">
                {o.badge && <span className="dd-badge">{o.badge}</span>}
                {o.id === value && <span className="dd-check" aria-hidden="true">✓</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function buildDgUrl(sttLang: string): string {
  const params = new URLSearchParams({
    model: "nova-2",
    language: sttLang,
    smart_format: "true",
    interim_results: "true",
    endpointing: "500",
    utterance_end_ms: "1000",
    vad_events: "true",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
  }).toString();
  return `wss://api.deepgram.com/v1/listen?${params}`;
}

function fmtElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const LS_KEY_CONTEXT = "simulador:context:v1";

// Umbral mínimo para considerar que hubo una respuesta real (evita cerrar el
// turno por un carraspeo transcripto).
const MIN_ANSWER_CHARS = 10;
// Espera extra (cancelable con habla) después del silencio, antes de cerrar.
// Benchmark: los voice agents cierran turno a 0.5-0.8s de silencio; en
// entrevista damos más margen para pensar, total ~2.3s.
const CONFIRM_MS = 800;

export default function SimuladorPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const phaseRef = useRef<Phase>("setup");
  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const [error, setError] = useState("");

  // Setup form states
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [profile, setProfile] = useState("");
  const [lang, setLang] = useState<Lang>("es");
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [interviewType, setInterviewType] = useState<InterviewType>("general");
  // Largo fijo de la entrevista (el selector se quitó del setup a pedido).
  const questionsCount = 5;

  // Voz del entrevistador
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const mutedRef = useRef(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Interview state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const historyRef = useRef<HistoryItem[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const questionRef = useRef("");
  // Texto de la pregunta ya "dicho" en voz alta: se revela palabra por palabra
  // al ritmo del audio, como subtítulos.
  const [spokenQuestion, setSpokenQuestion] = useState("");
  const spokenBaseRef = useRef("");
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const currentAnswerRef = useRef("");
  const [elapsed, setElapsed] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [camAvailable, setCamAvailable] = useState(false);
  const [micOn, setMicOn] = useState(true);
  // Pasos reales de conexión para el panel de chat: 0=media, 1=WS, 2=primera
  // pregunta en camino, 3=todo listo.
  const [connectStep, setConnectStep] = useState(0);

  // Feedback state
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [feedbackReport, setFeedbackReport] = useState<FeedbackReport | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Social proof simulada del setup: número que deriva lentamente entre 35 y
  // 90 para que parezca actividad real. Decisión de producto explícita.
  const [practicing, setPracticing] = useState(0);
  useEffect(() => {
    setPracticing(35 + Math.floor(Math.random() * 56));
    const iv = setInterval(() => {
      setPracticing((p) => Math.min(90, Math.max(35, p + Math.floor(Math.random() * 5) - 2)));
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  // Refs de audio / red
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const ttsRef = useRef<TtsQueue | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lineId = useRef(0);
  const sessionLangRef = useRef<Lang>("es");

  const intentionalCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Watchdog de silencio: regla de tiempo dura que no depende de que Deepgram
  // emita UtteranceEnd/is_final — chequea actividad de voz cada 400ms.
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeechAtRef = useRef(0);
  // Tope duro de la fase "hablando": si algo se cuelga (stream, TTS), la sala
  // pasa igual a escuchar en vez de quedar trabada.
  const speakFailsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const wakeLockRef = useRef<any>(null);
  // En qué pregunta (además de la 1) el entrevistador "mira" la cámara.
  const visionQuestionRef = useRef(0);

  const selectedModel = MODELS.find((m) => m.id === modelId) || MODELS[0];

  // Los handlers del WebSocket viven entre renders: llaman a la versión fresca
  // de cada función de flujo a través de estos refs.
  const beginTurnRef = useRef<(h: HistoryItem[]) => void>(() => {});
  const closeAnswerRef = useRef<(auto: boolean) => void>(() => {});
  const dgMessageRef = useRef<(raw: string) => void>(() => {});
  const connectWsRef = useRef<(first: boolean) => Promise<void>>(async () => {});
  const scheduleReconnectRef = useRef<() => void>(() => {});

  // Load and save context
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY_CONTEXT);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.company) setCompany(saved.company);
      if (saved.role) setRole(saved.role);
      if (saved.profile) setProfile(saved.profile);
      if (saved.modelId && MODELS.some((m) => m.id === saved.modelId)) setModelId(saved.modelId);
      if (saved.lang === "es" || saved.lang === "en") setLang(saved.lang);
      if (saved.interviewType) setInterviewType(saved.interviewType);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY_CONTEXT,
        JSON.stringify({ company, role, profile, modelId, lang, interviewType })
      );
    } catch {}
  }, [company, role, profile, modelId, lang, interviewType]);

  // ---------- Timers del turno ----------

  const clearRevealTimer = () => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  };

  // Revela las palabras de una oración repartidas en su duración real de audio.
  const startReveal = (text: string, durationSec: number) => {
    clearRevealTimer();
    const base = spokenBaseRef.current;
    spokenBaseRef.current = base ? `${base} ${text}` : text;
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return;
    setSpokenQuestion(base);
    const stepMs = Math.max(40, (durationSec * 1000) / (words.length + 1));
    let i = 0;
    revealTimerRef.current = setInterval(() => {
      i += 1;
      const partial = words.slice(0, i).join(" ");
      setSpokenQuestion(base ? `${base} ${partial}` : partial);
      if (i >= words.length) clearRevealTimer();
    }, stepMs);
  };

  const clearTurnTimers = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    if (speakFailsafeRef.current) {
      clearTimeout(speakFailsafeRef.current);
      speakFailsafeRef.current = null;
    }
  };

  const SILENCE_MS = 1500;

  const startWatchdog = () => {
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    lastSpeechAtRef.current = Date.now();
    watchdogRef.current = setInterval(() => {
      if (phaseRef.current !== "listening") return;
      if (currentAnswerRef.current.trim().length < MIN_ANSWER_CHARS) return;
      if (Date.now() - lastSpeechAtRef.current >= SILENCE_MS) enterConfirming();
    }, 400);
  };

  const enterListening = () => {
    clearTurnTimers();
    currentAnswerRef.current = "";
    setCurrentAnswer("");
    setLines([]);
    setPhaseBoth("listening");
    startWatchdog();
  };

  // Espera silenciosa antes de cerrar la respuesta: sin countdown visible
  // (decisión de producto), pero hablar de nuevo la cancela igual.
  const enterConfirming = () => {
    clearTurnTimers();
    setPhaseBoth("confirming");
    confirmTimerRef.current = setTimeout(() => {
      confirmTimerRef.current = null;
      closeAnswerRef.current(true);
    }, CONFIRM_MS);
  };

  // ---------- Deepgram ----------

  const onDgMessage = (raw: string) => {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "UtteranceEnd") {
      if (phaseRef.current === "listening" && currentAnswerRef.current.trim().length >= MIN_ANSWER_CHARS) {
        enterConfirming();
      }
      return;
    }
    if (msg.type !== "Results") return;

    // Gating anti-eco: fuera de listening/confirming (avatar hablando o
    // pensando) cualquier transcript se descarta.
    const ph = phaseRef.current;
    if (ph !== "listening" && ph !== "confirming") return;

    const alt = msg.channel?.alternatives?.[0];
    const text: string = alt?.transcript || "";
    if (!text) return;
    const isFinal = !!msg.is_final;

    lastSpeechAtRef.current = Date.now();

    // Habla nueva durante la espera de cierre → todavía no terminó: volver a
    // escuchar (sin resetear la respuesta acumulada).
    if (ph === "confirming") {
      clearTurnTimers();
      setPhaseBoth("listening");
      startWatchdog();
    }

    setLines((prev) => {
      const next = [...prev];
      if (next.length && !next[next.length - 1].final) {
        next[next.length - 1] = { id: next[next.length - 1].id, text, final: isFinal };
      } else {
        next.push({ id: ++lineId.current, text, final: isFinal });
      }
      return next.slice(-40);
    });

    if (isFinal) {
      const acc = `${currentAnswerRef.current} ${text}`.trim();
      currentAnswerRef.current = acc;
      setCurrentAnswer(acc);
      // Respaldo por si Deepgram nunca emite UtteranceEnd: 1.6s sin habla
      // nueva después de un final dispara el cierre.
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (phaseRef.current === "listening" && currentAnswerRef.current.trim().length >= MIN_ANSWER_CHARS) {
          enterConfirming();
        }
      }, 1200);
    } else if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };
  dgMessageRef.current = onDgMessage;

  const scheduleReconnect = () => {
    if (intentionalCloseRef.current) return;
    const ph = phaseRef.current;
    if (ph === "setup" || ph === "feedback") return;
    if (reconnectAttemptsRef.current >= 3) {
      setError("Se perdió la conexión de audio. Podés finalizar y ver el feedback de lo respondido.");
      return;
    }
    const delay = 600 * 2 ** reconnectAttemptsRef.current;
    reconnectAttemptsRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      connectWsRef.current(false).catch(() => scheduleReconnectRef.current());
    }, delay);
  };
  scheduleReconnectRef.current = scheduleReconnect;

  const connectWs = async (first: boolean) => {
    const dgUrl = buildDgUrl(STT_LANG[sessionLangRef.current]);
    const tokRes = await fetch("/api/deepgram-token", { method: "POST" });
    if (!tokRes.ok) throw new Error("Error al obtener token de Deepgram.");
    const { token, scheme } = await tokRes.json();
    const ws = new WebSocket(dgUrl, [scheme || "token", token]);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      // Mientras el avatar habla no fluye PCM: sin KeepAlive Deepgram corta
      // el socket a ~10s de silencio.
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      keepAliveRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
      }, 7000);
      // Conexión estable 10s → renueva el presupuesto de reintentos.
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = setTimeout(() => {
        reconnectAttemptsRef.current = 0;
      }, 10_000);
      if (first) beginTurnRef.current([]);
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") dgMessageRef.current(e.data);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
      if (wsRef.current === ws) scheduleReconnectRef.current();
    };
  };
  connectWsRef.current = connectWs;

  // ---------- Turno: pregunta → voz → escucha ----------

  // Frame chico de la cámara (JPEG ~30KB) para que el entrevistador "vea" al
  // candidato en algunas preguntas. Avisado en el setup; si la cámara está
  // apagada devuelve null y no se manda nada.
  const captureFrame = (): string | null => {
    try {
      const v = videoRef.current;
      if (!cameraOn || !v || v.readyState < 2 || !v.videoWidth) return null;
      const canvas = document.createElement("canvas");
      const w = 320;
      canvas.width = w;
      canvas.height = Math.round((v.videoHeight / v.videoWidth) * w);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
      return null;
    }
  };

  const beginTurn = async (currentHistory: HistoryItem[]) => {
    setPhaseBoth("asking");
    setCurrentQuestion("");
    questionRef.current = "";
    clearRevealTimer();
    setSpokenQuestion("");
    spokenBaseRef.current = "";

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    ttsRef.current?.stop();
    const queue = new TtsQueue(ctx, sessionLangRef.current);
    queue.setMuted(mutedRef.current);
    ttsRef.current = queue;
    setAnalyser(queue.analyser);

    let ttsFailed = false;
    queue.onStart = () => {
      if (phaseRef.current === "asking") setPhaseBoth("speaking");
    };
    queue.onChunkStart = (text, durationSec) => startReveal(text, durationSec);
    queue.onError = () => {
      ttsFailed = true;
      track("sim_tts_error");
      // Sin voz no hay ritmo que seguir: mostrar el texto completo.
      clearRevealTimer();
      setSpokenQuestion(questionRef.current);
      spokenBaseRef.current = questionRef.current;
    };
    const armSpeakFailsafe = (ms: number) => {
      if (speakFailsafeRef.current) clearTimeout(speakFailsafeRef.current);
      speakFailsafeRef.current = setTimeout(() => {
        speakFailsafeRef.current = null;
        if (phaseRef.current === "asking" || phaseRef.current === "speaking") {
          queue.stop();
          clearRevealTimer();
          setSpokenQuestion(questionRef.current);
          track("session_error", { where: "sim_speak_failsafe" });
          enterListening();
        }
      }, ms);
    };
    // Tope inicial generoso por si el stream del LLM nunca termina.
    armSpeakFailsafe(45_000);

    queue.onAllEnded = () => {
      // Terminó el audio: asegurar el texto completo en pantalla.
      clearRevealTimer();
      setSpokenQuestion(questionRef.current);
      spokenBaseRef.current = questionRef.current;
      // Si el TTS falló, dar tiempo a leer la pregunta en pantalla en vez de
      // pasar a escuchar de inmediato. El margen de 300ms deja drenar el
      // parlante antes de reabrir el mic (anti-eco).
      const delay = ttsFailed ? Math.max(1800, questionRef.current.length * 45) : 300;
      setTimeout(() => {
        if (phaseRef.current === "asking" || phaseRef.current === "speaking") enterListening();
      }, delay);
    };

    try {
      const questionIndex = currentHistory.length + 1;
      const withVision = questionIndex === 1 || questionIndex === visionQuestionRef.current;
      const image = withVision ? captureFrame() : null;
      const res = await fetch("/api/simulador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next-question",
          profile,
          company,
          role,
          interviewType,
          answerLang: sessionLangRef.current,
          provider: selectedModel.provider,
          model: selectedModel.model,
          history: currentHistory,
          questionIndex,
          questionsCount,
          ...(image ? { image } : {}),
        }),
      });
      if (!res.ok || !res.body) throw new Error("Error al obtener la pregunta.");
      track("sim_question_asked", { question_index: questionIndex, model: selectedModel.model, with_image: !!image });

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let questionText = "";
      // Troceo incremental: cada oración completa entra a la cola TTS mientras
      // el LLM sigue streameando, para que la voz arranque con la primera.
      let pending = "";
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (firstChunk) {
          firstChunk = false;
          setConnectStep(3);
        }
        const chunk = dec.decode(value, { stream: true });
        questionText += chunk;
        questionRef.current = questionText;
        setCurrentQuestion(questionText);

        pending += chunk;
        const { complete, rest } = extractSentences(pending);
        // Oraciones muy cortas ("Bien.") se fusionan con la siguiente para no
        // pagar un round-trip de TTS por dos palabras.
        let hold = "";
        for (const sentence of complete) {
          hold = hold ? `${hold} ${sentence}` : sentence;
          if (hold.length >= 25) {
            queue.enqueue(hold);
            hold = "";
          }
        }
        pending = hold ? `${hold} ${rest}` : rest;
      }
      if (pending.trim()) queue.enqueue(pending.trim());
      queue.finishInput();
      // Con el texto completo, ajustar el tope a la duración esperada del habla.
      armSpeakFailsafe(Math.max(15_000, questionText.length * 120));

      if (!questionText.trim()) throw new Error("El entrevistador no devolvió pregunta.");
    } catch (err: any) {
      queue.stop();
      endSession();
      setError(err?.message || "Error al conectar con la IA.");
    }
  };
  beginTurnRef.current = (h) => {
    void beginTurn(h);
  };

  const closeAnswer = (auto: boolean) => {
    const ph = phaseRef.current;
    if (ph !== "listening" && ph !== "confirming") return;
    clearTurnTimers();

    const answer = currentAnswerRef.current.trim();
    if (!answer) {
      setPhaseBoth("listening");
      return;
    }

    const updated = [...historyRef.current, { question: questionRef.current, answer }];
    historyRef.current = updated;
    setHistory(updated);
    currentAnswerRef.current = "";
    setCurrentAnswer("");
    setLines([]);
    track("sim_answer_closed", { auto, question_index: updated.length });

    if (updated.length >= questionsCount) {
      finishToFeedback(updated);
    } else {
      beginTurnRef.current(updated);
    }
  };
  closeAnswerRef.current = closeAnswer;

  // ---------- Fin de entrevista / feedback ----------

  const cleanupMedia = () => {
    intentionalCloseRef.current = true;
    clearTurnTimers();
    clearRevealTimer();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (stabilityTimerRef.current) {
      clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = null;
    }
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    ttsRef.current?.stop();
    ttsRef.current = null;
    setAnalyser(null);
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
      }
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
      wakeLockRef.current?.release();
    } catch {}
    wakeLockRef.current = null;
    wsRef.current = null;
    workletRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
    setCameraOn(false);
    setCamAvailable(false);
  };

  const finishToFeedback = (finalHistory: HistoryItem[]) => {
    cleanupMedia();
    track("sim_session_finished", { questions: finalHistory.length, duration_s: elapsedNow() });
    void fetchFeedback(finalHistory);
  };

  const elapsedNow = () =>
    startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0;

  // Botón "Finalizar": corta donde esté. Si hay al menos una respuesta (o una
  // en curso con contenido), va al feedback; si no, vuelve al setup.
  const endInterview = () => {
    const ph = phaseRef.current;
    if (ph === "listening" || ph === "confirming") {
      const a = currentAnswerRef.current.trim();
      if (a.length >= MIN_ANSWER_CHARS) {
        const updated = [...historyRef.current, { question: questionRef.current, answer: a }];
        historyRef.current = updated;
        setHistory(updated);
      }
    }
    if (historyRef.current.length > 0) {
      finishToFeedback(historyRef.current);
    } else {
      endSession();
      track("session_stopped");
    }
  };

  const endSession = () => {
    cleanupMedia();
    setPhaseBoth("setup");
  };

  const fetchFeedback = async (finalHistory: HistoryItem[]) => {
    setIsGeneratingFeedback(true);
    setError("");
    setPhaseBoth("feedback");
    // Un reintento automático: la generación es larga y en mobile la red es
    // menos estable.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/simulador", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "feedback",
            profile,
            company,
            role,
            interviewType,
            answerLang: sessionLangRef.current,
            provider: selectedModel.provider,
            model: selectedModel.model,
            history: finalHistory,
          }),
        });
        if (!res.ok) throw new Error("No se pudo obtener el reporte de feedback.");
        const report: FeedbackReport = await res.json();
        setFeedbackReport(report);
        setIsGeneratingFeedback(false);
        track("sim_feedback_shown", { score: report?.score ?? 0 });
        return;
      } catch (err: any) {
        if (attempt === 0) continue;
        setIsGeneratingFeedback(false);
        setError(err?.message || "Error al procesar el feedback.");
        track("session_error", { where: "sim_feedback" });
      }
    }
  };

  // ---------- Inicio de sesión ----------

  // El simulador es gratis e ilimitado a propósito (motor de adquisición):
  // acá no se consume la cuota de sesiones de /app.
  const startSimulation = async () => {
    setError("");
    setHistory([]);
    historyRef.current = [];
    setLines([]);
    setCurrentAnswer("");
    currentAnswerRef.current = "";
    setCurrentQuestion("");
    questionRef.current = "";
    setFeedbackReport(null);
    setElapsed(0);
    setMicOn(true);
    setConnectStep(0);
    // Además de la primera, una pregunta al azar (2..5) lleva frame de cámara.
    visionQuestionRef.current = 2 + Math.floor(Math.random() * Math.max(1, questionsCount - 1));
    sessionLangRef.current = lang;
    intentionalCloseRef.current = false;
    reconnectAttemptsRef.current = 0;
    setPhaseBoth("connecting");

    try {
      // Un solo prompt de permisos con mic + cámara; si la cámara falla se
      // reintenta solo audio (la cámara es local y opcional, nunca se sube).
      const audioConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      let stream: MediaStream;
      let camDenied = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: { facingMode: "user", width: { ideal: 640 } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        camDenied = true;
        track("sim_camera_denied");
      }
      streamRef.current = stream;
      const hasCam = !camDenied && stream.getVideoTracks().length > 0;
      setCamAvailable(hasCam);
      setCameraOn(hasCam);
      setConnectStep(1);

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();
      await audioCtx.audioWorklet.addModule("/pcm-worklet.js");

      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, "pcm-worklet");
      workletRef.current = worklet;

      worklet.port.onmessage = (e) => {
        // Gating anti-eco: solo fluye PCM cuando es el turno del usuario.
        const ph = phaseRef.current;
        if (ph !== "listening" && ph !== "confirming") return;
        const w = wsRef.current;
        if (w && w.readyState === WebSocket.OPEN) w.send(e.data);
      };
      source.connect(worklet);

      await connectWs(true);
      setConnectStep(2);

      track("sim_session_start", { model: selectedModel.model, questions: questionsCount, lang });

      // Wake lock: que no se apague la pantalla en el celular a mitad de entrevista.
      try {
        wakeLockRef.current = await (navigator as any).wakeLock?.request("screen");
      } catch {}

      startedAtRef.current = Date.now();
      timerIntervalRef.current = setInterval(() => setElapsed(elapsedNow()), 1000);
    } catch (err: any) {
      cleanupMedia();
      setError(err?.message || "No se pudo iniciar el simulador. Revisá los permisos de micrófono.");
      setPhaseBoth("setup");
    }
  };

  // Re-adquirir wake lock al volver de background durante la entrevista.
  useEffect(() => {
    const onVis = () => {
      const ph = phaseRef.current;
      if (document.visibilityState === "visible" && ph !== "setup" && ph !== "feedback") {
        (navigator as any).wakeLock
          ?.request("screen")
          .then((wl: any) => {
            wakeLockRef.current = wl;
          })
          .catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Conectar el stream de la cámara al <video> cuando el PiP está montado.
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn, phase]);

  // Cleanup al desmontar la página.
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      cleanupMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = () => {
    const m = !isVoiceMuted;
    setIsVoiceMuted(m);
    mutedRef.current = m;
    ttsRef.current?.setMuted(m);
  };

  const toggleCamera = () => {
    const t = streamRef.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCameraOn(t.enabled);
    track("sim_camera_toggled", { on: t.enabled });
  };

  const toggleMic = () => {
    const t = streamRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
    track("sim_mic_toggled", { on: t.enabled });
  };

  const copyOptimalAnswer = useCallback(
    (index: number, text: string) => {
      navigator.clipboard?.writeText(text).then(() => {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1500);
        track("answer_copied", { model: selectedModel.model });
      });
    },
    [selectedModel]
  );

  const inInterview = phase !== "setup" && phase !== "feedback";
  const connecting = phase === "connecting";

  const avatarState: AvatarState =
    phase === "asking"
      ? "thinking"
      : phase === "speaking"
        ? "speaking"
        : phase === "listening" || phase === "confirming"
          ? "listening"
          : "idle";

  const interim = lines.length > 0 && !lines[lines.length - 1].final ? lines[lines.length - 1].text : "";
  const isListening = phase === "listening" || phase === "confirming";

  // Autoscroll del chat: el volumen de mensajes es bajo, forzarlo siempre es
  // más simple que detectar scroll manual.
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chatBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, currentQuestion, spokenQuestion, currentAnswer, lines, phase, connectStep]);

  const CONNECT_STEPS = ["Preparando tu sala de entrevista", "Cargando tu contexto y CV", "Generando la primera pregunta"];
  const showSteps = phase === "connecting" || (phase === "asking" && history.length === 0 && !currentQuestion);

  const interviewTypeLabel =
    interviewType === "technical"
      ? "Técnica / Hard Skills"
      : interviewType === "behavioral"
        ? "De Comportamiento (STAR)"
        : interviewType === "hr"
          ? "Inicial / RRHH"
          : "General / Fit Cultural";

  return (
    <main className={`app-container ${inInterview ? "sim-wide" : ""}`}>
      {!inInterview && (
        <header className="brand-header">
          <div className="brand">
            <span className="brand-title">Loreado.IA 🦜</span>
          </div>
          {phase === "setup" && practicing > 0 && (
            <div className="sim-social-pill">
              <span className="sim-social-dot" aria-hidden="true" />
              {practicing} personas practicando ahora
            </div>
          )}
        </header>
      )}

      {phase === "setup" && (
        <>
          <p className="tagline">
            Practicá entrevistas de trabajo gratis con el Loro simulador de entrevistas. Recibí feedback al instante,
            mejorá tus respuestas y ganá confianza para cualquier entrevista.
          </p>

          <div className="selectors-row" style={{ marginTop: 8 }}>
            <div className="field">
              <label className="mono form-label">Idioma</label>
              <Dropdown
                value={lang}
                onChange={(id) => setLang(id as Lang)}
                ariaLabel="Idioma de la simulación"
                options={[
                  { id: "es", label: "Español", icon: <span className="dd-flag">🇪🇸</span> },
                  { id: "en", label: "English", icon: <span className="dd-flag">🇺🇸</span> },
                ]}
              />
            </div>
            <div className="field">
              <label className="mono form-label">Modelo de IA</label>
              <Dropdown
                value={modelId}
                onChange={(id) => setModelId(id)}
                ariaLabel="Modelo de IA"
                alignRight
                options={MODELS.map((m) => ({
                  id: m.id,
                  label: m.label,
                  icon: <ProviderIcon provider={m.provider} />,
                  tag: m.tag === "Recomendado" ? undefined : m.tag,
                  badge: m.tag === "Recomendado" ? "Recomendado" : undefined,
                }))}
              />
            </div>
          </div>

          <div className="selectors-row" style={{ marginTop: 8 }}>
            <div className="field">
              <label className="mono form-label">Tipo de Entrevista</label>
              <Dropdown
                value={interviewType}
                onChange={(id) => setInterviewType(id as InterviewType)}
                ariaLabel="Tipo de Entrevista"
                options={[
                  { id: "general", label: "General / Fit Cultural" },
                  { id: "technical", label: "Técnica / Hard Skills" },
                  { id: "behavioral", label: "De Comportamiento (STAR)" },
                  { id: "hr", label: "Inicial / Recursos Humanos" },
                ]}
              />
            </div>
          </div>

          {error && <div className="mono sim-error-box" style={{ marginTop: 10 }}>⚠️ {error}</div>}

          <div className="panel" style={{ marginTop: 12 }}>
            <label className="mono form-label">Contexto del Puesto</label>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="mono form-mini-label">
                <BriefcaseIcon /> Empresa
                <InfoTip text="La empresa que simulará la entrevista. Ayuda a personalizar las preguntas y el fit." />
              </label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Ej: Mercado Libre"
                className="form-input"
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <label className="mono form-mini-label">
                <DocIcon /> Descripción del puesto
                <InfoTip text="Descripción del rol para el que te simularás. Ayuda a definir las preguntas técnicas o de comportamiento." />
              </label>
              <textarea
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Pegá la descripción del puesto, seniority, requisitos o tecnologías."
                className="form-textarea form-textarea-sm"
              />
            </div>

            <label className="mono form-mini-label" style={{ marginTop: 4 }}>
              <UserIcon /> Tu perfil / CV
              <InfoTip text="Tu experiencia y habilidades. La IA las usará para hacer preguntas más específicas a tu caso o evaluar si aprovechás tu background." />
            </label>
            <textarea
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder="Pegá tu CV, experiencia previa o notas de tu perfil laboral."
              className="form-textarea"
            />
          </div>

          <footer style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <button onClick={() => void startSimulation()} className="btn-action btn-primary">
              ▶ Generar Sala de Entrevista
            </button>
          </footer>
        </>
      )}

      {inInterview && (
        <div className="sim-room">
          <header className="sim-room-header">
            <div className="sim-room-header-left">
              <button className="sim-back-btn" onClick={endInterview} aria-label="Volver">
                <BackIcon />
              </button>
              <h1 className="sim-room-title">Sala de Entrevista</h1>
              <span className="sim-room-meta mono">
                {fmtElapsed(elapsed)} · Pregunta {Math.min(history.length + 1, questionsCount)} de {questionsCount}
              </span>
            </div>
            <div className="sim-room-header-right">
              <button
                className={`sim-ctl-btn ${cameraOn ? "sim-ctl-on" : ""}`}
                onClick={toggleCamera}
                disabled={!camAvailable}
                aria-label={cameraOn ? "Apagar cámara" : "Prender cámara"}
                title={!camAvailable ? "Cámara no autorizada" : cameraOn ? "Apagar cámara" : "Prender cámara"}
              >
                <CamIcon off={!cameraOn} />
              </button>
              <button
                className={`sim-ctl-btn ${micOn ? "sim-ctl-on" : ""}`}
                onClick={toggleMic}
                aria-label={micOn ? "Silenciar micrófono" : "Activar micrófono"}
                title={micOn ? "Silenciar micrófono" : "Activar micrófono"}
              >
                <MicIcon off={!micOn} />
              </button>
              <button
                className="sim-ctl-btn"
                onClick={toggleMute}
                aria-label={isVoiceMuted ? "Activar voz del entrevistador" : "Silenciar voz del entrevistador"}
                title={isVoiceMuted ? "Activar voz del entrevistador" : "Silenciar voz del entrevistador"}
              >
                <SpeakerIcon off={isVoiceMuted} />
              </button>
              <button className="sim-finish-btn" onClick={endInterview}>
                <PhoneIcon /> Finalizar
              </button>
            </div>
          </header>

          {error && <div className="mono sim-error-box">⚠️ {error}</div>}

          <div className="sim-room-grid">
            <section className="sim-room-left">
              <div className="sim-stage">
                <Avatar state={avatarState} analyser={analyser} />

                <span className={`sim-stage-badge ${connecting ? "sim-stage-badge-connecting" : ""}`}>
                  <span className="sim-stage-badge-dot" aria-hidden="true" />
                  {connecting ? "Conectando…" : "Entrevistador IA conectado"}
                </span>

                <div className="sim-pip">
                  {cameraOn ? (
                    <video ref={videoRef} muted playsInline autoPlay />
                  ) : (
                    <div className="sim-pip-off">
                      <span className="sim-pip-off-emoji">📷</span>
                      <span>Cámara desactivada</span>
                    </div>
                  )}
                </div>
              </div>

              <details className="sim-context-panel">
                <summary>Contexto de la entrevista</summary>
                <div className="sim-context-rows">
                  <div className="sim-context-row">
                    <span>Empresa</span>
                    <b>{company || "—"}</b>
                  </div>
                  <div className="sim-context-row">
                    <span>Puesto</span>
                    <b>{role ? `${role.slice(0, 80)}${role.length > 80 ? "…" : ""}` : "—"}</b>
                  </div>
                  <div className="sim-context-row">
                    <span>Tipo</span>
                    <b>{interviewTypeLabel}</b>
                  </div>
                  <div className="sim-context-row">
                    <span>Idioma</span>
                    <b>{sessionLangRef.current === "en" ? "English" : "Español"}</b>
                  </div>
                  <div className="sim-context-row">
                    <span>Modelo</span>
                    <b>{selectedModel.label}</b>
                  </div>
                  <div className="sim-context-row">
                    <span>Preguntas</span>
                    <b>{questionsCount}</b>
                  </div>
                </div>
              </details>
            </section>

            <aside className="sim-chat">
              <div className="sim-chat-header">
                <span className="sim-chat-title">Entrevista</span>
                <span className={`sim-chat-chip ${connecting ? "sim-chat-chip-prep" : ""}`}>
                  <span className="sim-chat-chip-dot" aria-hidden="true" />
                  {connecting ? "Preparando" : "En vivo"}
                </span>
              </div>

              <div className="sim-chat-body" ref={chatBodyRef}>
                {showSteps && (
                  <ol className="sim-steps">
                    {CONNECT_STEPS.map((label, i) => (
                      <li
                        key={i}
                        className={i < connectStep ? "sim-step-done" : i === connectStep ? "sim-step-active" : ""}
                      >
                        <span className="sim-step-mark" aria-hidden="true">
                          {i < connectStep ? "✓" : i === connectStep ? <span className="sim-step-spinner" /> : "·"}
                        </span>
                        {label}
                      </li>
                    ))}
                  </ol>
                )}

                {history.map((h, i) => (
                  <div key={i} className="sim-turn">
                    <div className="sim-bubble sim-bubble-q">{h.question}</div>
                    <div className="sim-bubble sim-bubble-a">{h.answer}</div>
                  </div>
                ))}

                {(phase === "asking" || phase === "speaking") && !spokenQuestion && !showSteps && (
                  <div className="sim-bubble sim-bubble-q sim-bubble-typing" aria-label="El entrevistador está por hablar">
                    <span />
                    <span />
                    <span />
                  </div>
                )}

                {/* Mientras habla, el texto se revela al ritmo de la voz; después queda completo. */}
                {(phase === "asking" || phase === "speaking" ? spokenQuestion : currentQuestion) && (
                  <div className="sim-bubble sim-bubble-q">
                    {phase === "asking" || phase === "speaking" ? spokenQuestion : currentQuestion}
                  </div>
                )}

                {isListening && (currentAnswer || interim) && (
                  <div className="sim-bubble sim-bubble-a">
                    {currentAnswer}
                    {interim && <em className="sim-bubble-interim"> {interim}</em>}
                  </div>
                )}

                {phase === "listening" && !micOn && (
                  <div className="sim-chat-hint">Micrófono silenciado — activalo para responder</div>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      {phase === "feedback" && (
        <div className="sim-feedback-container">
          {isGeneratingFeedback ? (
            <div className="sim-loading-feedback">
              <div className="sim-loading-spinner" />
              <h2 className="mono" style={{ fontSize: 16, fontWeight: 700 }}>Generando reporte de feedback…</h2>
              <p className="tagline" style={{ maxWidth: 360 }}>
                El Loro de IA está evaluando tus respuestas en base a la señal, fit cultural y claridad de
                comunicación. Esto demora unos segundos.
              </p>
            </div>
          ) : error && !feedbackReport ? (
            <div className="sim-loading-feedback">
              <div className="mono sim-error-box">⚠️ {error}</div>
              <button
                onClick={() => void fetchFeedback(historyRef.current)}
                className="btn-action btn-primary"
              >
                🔄 Reintentar reporte
              </button>
              <button onClick={() => setPhaseBoth("setup")} className="clear-pill mono">
                Volver al inicio
              </button>
            </div>
          ) : (
            <>
              <div className="sim-score-circle-wrapper">
                <ScoreGauge score={feedbackReport?.score ?? 0} />
              </div>

              {feedbackReport?.indicators && feedbackReport.indicators.length > 0 && (
                <div className="sim-indicators">
                  {feedbackReport.indicators.map((ind, i) => {
                    const s = Math.max(0, Math.min(100, Math.round(ind.score)));
                    return (
                      <div className="sim-ind-card" key={i}>
                        <div className="sim-ind-top">
                          <span className="sim-ind-name">{ind.name}</span>
                          <TrafficLight score={s} />
                        </div>
                        <div className="sim-ind-score" style={{ color: scoreColor(s) }}>{s}</div>
                        <div className="sim-ind-bar">
                          <div className="sim-ind-bar-fill" style={{ width: `${s}%`, background: scoreColor(s) }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="sim-card">
                <div className="sim-card-header">📊 Resumen del Loro</div>
                <div className="sim-card-body">
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink)" }}>{feedbackReport?.summary}</p>
                </div>
              </div>

              <div className="sim-columns-layout">
                <div className="sim-feedback-card" style={{ borderColor: "#a7f3d0" }}>
                  <div className="sim-feedback-card-title" style={{ color: "var(--loro-green-bright)" }}>
                    👍 Fortalezas
                  </div>
                  <ul className="sim-strengths-list">
                    {feedbackReport?.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="sim-feedback-card" style={{ borderColor: "#fde68a" }}>
                  <div className="sim-feedback-card-title" style={{ color: "#d97706" }}>
                    💡 Áreas de Mejora
                  </div>
                  <ul className="sim-improvements-list">
                    {feedbackReport?.improvements.map((imp, i) => (
                      <li key={i}>{imp}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <h3 className="mono" style={{ fontSize: 14, fontWeight: 700, marginTop: 12, color: "var(--loro-green-deep)" }}>
                ANÁLISIS PREGUNTA POR PREGUNTA
              </h3>

              <div>
                {feedbackReport?.questions.map((q, i) => (
                  <div key={i} className="sim-question-report-card">
                    <div className="sim-report-q-header">
                      <span>
                        Pregunta {i + 1}: {q.question}
                      </span>
                      {typeof q.score === "number" && (
                        <span
                          className="sim-qscore"
                          style={{ color: scoreColor(q.score), borderColor: scoreColor(q.score) }}
                        >
                          {Math.round(q.score)}
                        </span>
                      )}
                    </div>
                    <div className="sim-report-row">
                      <span className="sim-report-label">Tu Respuesta</span>
                      <p className="sim-report-val" style={{ color: "var(--ink-dim)" }}>{q.answer}</p>
                    </div>
                    <div className="sim-report-row">
                      <span className="sim-report-label">Análisis del Loro</span>
                      <p className="sim-report-val">{q.analysis}</p>
                    </div>
                    <div className="sim-report-row">
                      <span className="sim-report-label">Sugerencia del Loro (Cómo responder mejor)</span>
                      <div className="sim-report-val-suggestion">
                        <p>{q.suggestion}</p>
                        <button
                          className="sim-copy-suggested-btn"
                          onClick={() => copyOptimalAnswer(i, q.suggestion)}
                          aria-label="Copiar sugerencia"
                          title="Copiar sugerencia"
                        >
                          {copiedIndex === i ? <CheckIcon /> : <CopyIcon />}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => setPhaseBoth("setup")} className="btn-action btn-primary" style={{ marginTop: 10 }}>
                🔄 Iniciar Nueva Simulación
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
