"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { track } from "../lib/track";

type Status = "idle" | "connecting" | "live" | "error";
type Mode = "mic" | "tab";
type Line = { id: number; text: string; final: boolean };
type Feedback = "up" | "down" | null;
type Answer = { id: number; question: string; text: string; done: boolean; ts: number; feedback: Feedback };

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString("es-AR", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Ícono "mágico" (sparkle / auto-awesome) del botón de respuesta, como Parakeet.
function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l1.9 4.9 4.9 1.9-4.9 1.9L12 16l-1.9-4.8L5.2 9.3l4.9-1.9L12 2.5z" />
      <path d="M18.5 14.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z" />
    </svg>
  );
}

// Logos de proveedor para el selector de modelo (como Parakeet).
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

// Iconos de los campos de contexto (estilo Parakeet: outline al lado del label).
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
function ThumbUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a2.5 2.5 0 0 1 3 3z" />
    </svg>
  );
}
function ThumbDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a2.5 2.5 0 0 1-3-3z" />
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
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// Tooltip de ayuda (ⓘ) tap-to-toggle, apto mobile (el title nativo no aparece
// al tocar en el celular).
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

// Tira en vivo: muestra las últimas palabras oídas y resalta la más reciente
// (cue de "te estoy escuchando ahora"), como el marcado de Parakeet.
function ListenText({ text }: { text: string }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  // El contenedor trunca a la izquierda (direction: rtl) para que la palabra
  // más reciente quede siempre visible a la derecha; el <bdi> mantiene el orden
  // de lectura normal (izq→der) del texto latino.
  if (words.length === 0) return <bdi>escuchando…</bdi>;
  const last = words[words.length - 1];
  const head = words.slice(Math.max(0, words.length - 9), words.length - 1).join(" ");
  return (
    <bdi>
      {head && <>{head} </>}
      <span className="active-word">{last}</span>
    </bdi>
  );
}

// Dropdown custom (con icono, tag y badge) — el <select> nativo no lo permite.
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
// Misma lista que Parakeet (mismo orden y tags). Los `model` son los IDs reales
// de API: para Claude va el ID canónico (claude-haiku-4-5) y para Gemini los IDs
// que funcionan con la key actual; el resto usa el ID que matchea el nombre.
// Cualquiera se puede pisar por env en el backend (OPENAI_MODEL/ANTHROPIC_MODEL/GEMINI_MODEL).
// IDs reales de la API de Gemini (los que responden con la key actual). El
// backend igual cae a un modelo estable si alguno fallara, así nunca queda sin
// respuesta. Por ahora solo Gemini (OpenAI/Claude ocultos); el backend soporta
// los tres proveedores: para reactivarlos, descomentar sus líneas y cargar la key.
const MODELS: ModelOption[] = [
  // { id: "gpt-4.1", label: "GPT-4.1", provider: "openai", model: "gpt-4.1", tag: "Smart" },
  // { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai", model: "gpt-4.1-mini", tag: "Rápido" },
  // { id: "claude-haiku", label: "Claude 4.5 Haiku", provider: "anthropic", model: "claude-haiku-4-5", tag: "Lento" },
  { id: "gemini-flash", label: "Gemini 2.5 Flash", provider: "gemini", model: "gemini-2.5-flash", tag: "Recomendado" },
  { id: "gemini-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "gemini", model: "gemini-2.5-flash-lite", tag: "Rápido" },
];
const DEFAULT_MODEL_ID = "gemini-flash";

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

// ---------- Cuota gratuita (100% client-side, sin backend) ----------
// Cada navegador arranca con FREE_SESSIONS sesiones de hasta SESSION_MAX_MS.
// Se descuenta 1 al arrancar. Al agotarse, se muestra el modal de lista de
// espera. Es escasez percibida, no protección de costos (se saltea borrando
// storage / incógnito — a propósito en esta fase de guerrilla).
const SESSIONS_KEY = "loreado:sessions:v1";
const BONUS_KEY = "loreado:bonus:v1";
const FREE_SESSIONS = 5;
// Sesiones extra que se ganan compartiendo (loop viral). Tope para que no sea
// infinito.
const MAX_BONUS = 3;
const SESSION_MAX_MS = 10 * 60 * 1000;

// ---------- Endpointing semántico ----------
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
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // Cuota gratuita
  const [sessionsUsed, setSessionsUsed] = useState(0);
  const sessionsUsedRef = useRef(0);
  // Sesiones extra ganadas por compartir (loop viral).
  const [bonus, setBonus] = useState(0);
  const bonusRef = useRef(0);
  const [showPaywall, setShowPaywall] = useState(false);
  // Por qué se muestra el paywall: "quota" = se acabaron las sesiones gratis
  // del navegador; "capacity" = kill switch global del server (CAPACITY_CLOSED),
  // donde compartir no destraba nada — solo queda la lista de espera.
  const [paywallReason, setPaywallReason] = useState<"quota" | "capacity">("quota");
  const [shareDone, setShareDone] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [sending, setSending] = useState(false);
  // Total de sesiones disponibles (base + bonus) y cuántas quedan.
  const freeSessions = FREE_SESSIONS + bonus;
  const sessionsLeft = Math.max(0, freeSessions - sessionsUsed);
  // Countdown de la sesión (10 min gratis), estilo Parakeet.
  const [remainingSec, setRemainingSec] = useState(Math.round(SESSION_MAX_MS / 1000));

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const wakeLockRef = useRef<any>(null);
  const keepAliveRef = useRef<any>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const transcriptRef = useRef(""); // todo lo transcripto (contexto para el LLM)
  const questionBufRef = useRef(""); // último tramo dicho, para "Responder ahora"
  const lineId = useRef(0);
  const ansId = useRef(0);
  // Respuesta en curso: permite abortarla si se pide otra o se limpia.
  const turnRef = useRef<{ id: number; sentText: string; controller: AbortController | null } | null>(null);

  const scrollT = useRef<HTMLDivElement | null>(null);
  const scrollA = useRef<HTMLDivElement | null>(null);

  // Modelo elegido, siempre fresco (evita closures viejas en runGenerate).
  const selectedModel = MODELS.find((m) => m.id === modelId) || MODELS[0];
  const modelRef = useRef(selectedModel);
  modelRef.current = selectedModel;

  // ---------- Detección de mobile / Safari ----------
  // "Pestaña" (captura de audio vía getDisplayMedia) no tiene sentido en dos
  // casos: en mobile (iOS y Android) no hay pestañas de Meet/Zoom que
  // compartir desde el propio celular; y en Safari —incluso de escritorio,
  // en Mac— getDisplayMedia no soporta capturar audio (solo video), así que
  // ahí "Pestaña" siempre termina en el error de "no se compartió audio". En
  // ambos casos se usa directo micrófono.
  const [noTabCapture, setNoTabCapture] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const mobile = iOS || /Android|Mobi/.test(ua);
    const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
    const noTab = mobile || isSafari;
    setNoTabCapture(noTab);
    if (noTab) setMode("mic");
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

  // Funnel: el usuario llegó a la app.
  useEffect(() => {
    track("enter_app");
  }, []);

  // Carga la cuota gratuita usada + bonus (persistidos en el navegador).
  useEffect(() => {
    try {
      const n = parseInt(localStorage.getItem(SESSIONS_KEY) || "0", 10);
      const used = Number.isFinite(n) ? Math.max(0, n) : 0;
      sessionsUsedRef.current = used;
      setSessionsUsed(used);
      const b = parseInt(localStorage.getItem(BONUS_KEY) || "0", 10);
      const earned = Number.isFinite(b) ? Math.min(MAX_BONUS, Math.max(0, b)) : 0;
      bonusRef.current = earned;
      setBonus(earned);
    } catch {}
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
      // Idioma: se restaura la última preferencia (es/en).
      if (saved.lang === "es" || saved.lang === "en") setLang(saved.lang);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ company, role, profile, modelId, lang }));
    } catch {}
  }, [company, role, profile, modelId, lang]);

  // ---------- Generación ----------
  // Ejecuta el fetch/stream para una tarjeta ya asignada (id + controller ya
  // decididos por fireIfNew). Si un fireIfNew posterior cancela este
  // controller, el AbortError se ignora en silencio: ya hay una versión
  // mejor en camino para la misma tarjeta.
  const runGenerate = useCallback(
    async (id: number, question: string, controller: AbortController, attempt = 0) => {
      // Crea/resetea la tarjeta (en un reintento la vaciamos para re-streamear).
      setAnswers((prev) => {
        const card: Answer = { id, question, text: "", done: false, ts: Date.now(), feedback: null };
        return prev.some((a) => a.id === id)
          ? prev.map((a) => (a.id === id ? card : a))
          : [...prev, card].slice(-20); // cronológico: nuevas abajo
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
          let detail = (await res.text().catch(() => "")).slice(0, 300);
          // El kill switch (y otros errores JSON) devuelven { error }: mostramos
          // el mensaje limpio en vez del JSON crudo.
          try {
            const j = JSON.parse(detail);
            if (j?.error) detail = j.error;
          } catch {}
          setAnswers((prev) =>
            prev.map((a) =>
              a.id === id
                ? { ...a, text: detail ? `⚠️ ${detail}` : "· Error generando respuesta.", done: true }
                : a
            )
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
        // El modelo a veces devuelve el placeholder "(esperando pregunta)" (o
        // texto vacío) en la primera respuesta, aunque la pregunta sea real.
        // Reintentamos UNA vez automáticamente en vez de dejar la tarjeta así.
        const finalText = acc.trim();
        const isPlaceholder =
          !finalText || /esperando pregunta|ninguna a[uú]n/i.test(finalText);
        if (isPlaceholder && attempt < 1 && !controller.signal.aborted) {
          return runGenerate(id, question, controller, attempt + 1);
        }
        setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, done: true } : a)));
        track("answer_generated", { model: modelRef.current.model });
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setAnswers((prev) =>
          prev.map((a) => (a.id === id ? { ...a, text: "· Error de red.", done: true } : a))
        );
      }
    },
    [profile, company, role, lang]
  );


  // Disparo manual (ÚNICA forma de responder, como Parakeet): al tocar
  // "Responder ahora" se genera una respuesta sobre lo último dicho. La app
  // NO responde sola mientras la persona habla; solo transcribe.
  const answerNow = useCallback(() => {
    track("answer_requested");
    // Aborta una respuesta en curso para no encimar dos generaciones. Si esa
    // respuesta todavía estaba vacía (no llegó ni el primer token), sacamos su
    // tarjeta para que no quede colgada en pantalla al reintentar.
    const prev = turnRef.current;
    prev?.controller?.abort();
    turnRef.current = null;
    if (prev) {
      setAnswers((list) => list.filter((a) => !(a.id === prev.id && !a.done && !a.text)));
    }
    const q = questionBufRef.current.trim() || transcriptRef.current.trim().slice(-500);
    questionBufRef.current = "";
    if (q.trim().length < 2) return;
    const id = ++ansId.current;
    const controller = new AbortController();
    // Registrar el turno en curso: así el próximo toque a "Responder" (o
    // clearAll/cleanup) puede abortar este stream de verdad.
    turnRef.current = { id, sentText: q, controller };
    runGenerate(id, q, controller);
  }, [runGenerate]);

  // Feedback 👍/👎 por respuesta. Togglea el estado visual y manda el evento a
  // analytics (única señal de calidad de respuestas que tenemos).
  const setFeedback = useCallback((id: number, fb: "up" | "down") => {
    setAnswers((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const next = a.feedback === fb ? null : fb;
        if (next) track("answer_feedback", { rating: next, model: modelRef.current.model });
        return { ...a, feedback: next };
      })
    );
  }, []);

  // Copia la respuesta al portapapeles con feedback breve.
  const copyAnswer = useCallback((id: number, text: string) => {
    const clean = text.replace(/\n{3,}/g, "\n\n").trim();
    navigator.clipboard
      ?.writeText(clean)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
        track("answer_copied", { model: modelRef.current.model });
      })
      .catch(() => {});
  }, []);

  // Limpia respuestas y transcripción en pantalla (como el "Clear" de Parakeet),
  // sin cortar la sesión: el Loro sigue escuchando.
  const clearAll = useCallback(() => {
    turnRef.current?.controller?.abort();
    turnRef.current = null;
    questionBufRef.current = "";
    setAnswers([]);
    setLines([]);
  }, []);

  // Lista de espera: manda el email a /api/waitlist, que reenvía al Google Form
  // desde el servidor y reporta éxito/fallo REAL (no el submit opaco no-cors).
  const submitWaitlist = useCallback(async () => {
    const em = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setEmailError("Poné un email válido.");
      return;
    }
    setSending(true);
    setEmailError("");
    try {
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        setEmailSent(true);
        track("waitlist_submit");
      } else {
        setEmailError(j.error || "No se pudo enviar. Probá de nuevo.");
      }
    } catch {
      setEmailError("Error de red. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }, [email]);

  // Loop viral: compartir por WhatsApp otorga +1 sesión (hasta MAX_BONUS).
  // Honesto con la fase actual: no verifica que el amigo entre (igual que la
  // cuota client-side), pero convierte a cada usuario en distribuidor.
  const shareForBonus = useCallback(() => {
    const url =
      typeof window !== "undefined" ? window.location.origin : "https://copiloto-mvp.vercel.app";
    const msg = `Mira esto… me voló la cabeza.\nLoreado.IA: una IA que te sopla las respuestas en las entrevistas, en tiempo real 🦜\nProbalo gratis 👉 ${url}`;
    try {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    } catch {}
    track("share_whatsapp");
    if (bonusRef.current < MAX_BONUS) {
      const b = bonusRef.current + 1;
      bonusRef.current = b;
      setBonus(b);
      try {
        localStorage.setItem(BONUS_KEY, String(b));
      } catch {}
    }
    setShareDone(true);
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

      // Modo manual: NO se dispara solo por fin de intervención.
      if (msg.type === "UtteranceEnd") return;
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

      // Solo acumulamos texto (contexto + buffer para "Responder ahora"). La
      // generación ocurre EXCLUSIVAMENTE al tocar el botón, así la conversación
      // no avanza sola con respuestas nuevas mientras la persona habla.
      if (isFinal) {
        transcriptRef.current = (transcriptRef.current + " " + text).slice(-8000);
        questionBufRef.current = (questionBufRef.current + " " + text).slice(-1500);
      }
    },
    []
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
    // Cuota gratuita: si no quedan sesiones, mostramos la lista de espera.
    if (sessionsUsedRef.current >= FREE_SESSIONS + bonusRef.current) {
      setPaywallReason("quota");
      setShowPaywall(true);
      track("paywall_shown");
      return;
    }
    setError("");
    setStatus("connecting");
    questionBufRef.current = "";
    intentionalCloseRef.current = false;
    reconnectAttemptsRef.current = 0;
    turnRef.current?.controller?.abort();
    turnRef.current = null;
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
          // Kill switch global del server: no es un error de conexión, es
          // "no hay más cupo hoy" → lo maneja el catch de start() con paywall.
          if (tokRes.status === 503 && e.closed) {
            const err = new Error(e.error || "Cupos agotados por hoy.");
            err.name = "CapacityClosed";
            throw err;
          }
          throw new Error(e.error || "No se pudo obtener token de Deepgram.");
        }
        const { token, scheme } = await tokRes.json();

        // Token temporal de Deepgram (grant): usa esquema "bearer". Fallback a
        // "token" por compatibilidad si el backend no mandara scheme.
        const ws = new WebSocket(dgUrl, [scheme || "token", token]);
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

      // La sesión arrancó de verdad (audio + socket): descontamos 1 y armamos
      // el corte automático a los 10 minutos.
      const used = sessionsUsedRef.current + 1;
      sessionsUsedRef.current = used;
      setSessionsUsed(used);
      track("session_start", { mode, model: modelRef.current.model });
      try {
        localStorage.setItem(SESSIONS_KEY, String(used));
      } catch {}
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = setTimeout(() => stop(), SESSION_MAX_MS);
      // Countdown visible (pill "X min (Free)"), tick cada segundo.
      const startedAt = Date.now();
      setRemainingSec(Math.round(SESSION_MAX_MS / 1000));
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((SESSION_MAX_MS - (Date.now() - startedAt)) / 1000));
        setRemainingSec(left);
        if (left <= 0 && countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      }, 1000);

      stream.getAudioTracks()[0].onended = () => stop();

      // Wake lock: evita que el celular apague la pantalla en modo mic.
      try {
        // @ts-ignore
        if (navigator.wakeLock) wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {}
    } catch (err: any) {
      cleanup();
      if (err?.name === "CapacityClosed") {
        // Sin cupo global: se ve como escasez (paywall + waitlist), no como
        // una app rota con un error técnico en rojo.
        setStatus("idle");
        setPaywallReason("capacity");
        setShowPaywall(true);
        track("capacity_closed_shown");
        return;
      }
      track("session_error", { error: err?.name || "unknown" });
      setError(err?.message || "Error al iniciar.");
      setStatus("error");
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
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    sessionTimerRef.current = null;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
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
    track("session_stopped");
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
  // Al aparecer/llenarse una respuesta nueva, bajamos el scroll hasta que su
  // parte de arriba quede al tope del área, dejando la Q&A anterior arriba
  // (como Parakeet). Depende también del texto de la última: cuando la card
  // arranca vacía el contenedor todavía no es scrolleable; al llenarse, se
  // reintenta. NO depende de `feedback`, así tocar 👍/👎 no mueve el scroll.
  const lastAnswerText = answers.length ? answers[answers.length - 1].text : "";
  useEffect(() => {
    const container = scrollA.current;
    if (!container || answers.length === 0) return;
    const last = container.lastElementChild as HTMLElement | null;
    if (!last) return;
    const cRect = container.getBoundingClientRect();
    const lRect = last.getBoundingClientRect();
    const delta = lRect.top - cRect.top;
    if (delta > 1) container.scrollTo({ top: container.scrollTop + delta - 4, behavior: "smooth" });
  }, [answers.length, lastAnswerText]);

  const live = status === "live";
  const connecting = status === "connecting";

  return (
    <main className={`app-container ${live ? "app-live" : ""}`}>
      <header className="brand-header">
        <div className="brand">
          <span className="brand-title">Loreado.IA 🦜</span>
        </div>
        <div className="header-right">
          {live && (
            <div className="header-center">
              <span className="timer-pill sessions-pill" title="Sesiones gratis restantes">
                {sessionsLeft}/{freeSessions} Loros ~ {Math.ceil(remainingSec / 60)} mins (Free)
              </span>
            </div>
          )}
          {!live && connecting && <span className="status-chip">conectando…</span>}
          {!live && status === "error" && <span className="status-chip">error</span>}
          {live && (
            <button className="stop-x" onClick={stop} aria-label="Detener" title="Detener">
              ✕
            </button>
          )}
        </div>
      </header>

      {!live && (
        <p className="tagline">
          El Loro escucha tu entrevista en tiempo real y te sopla las respuestas. 🦜
        </p>
      )}

      {/* Selectores de idioma + modelo, en una misma línea (estilo Parakeet) */}
      {!live && (
        <div>
          <div className="selectors-row">
            <div className="field">
              <label className="mono form-label">Idioma</label>
              <Dropdown
                value={lang}
                onChange={(id) => { setLang(id as Lang); track("lang_changed", { lang: id }); }}
                disabled={connecting}
                ariaLabel="Idioma de la entrevista"
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
                onChange={(id) => { setModelId(id); const m = MODELS.find((m) => m.id === id); if (m) track("model_changed", { model: m.model, provider: m.provider }); }}
                disabled={connecting}
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
        </div>
      )}

      {/* Selector de modo: se oculta en mobile (iOS/Android) y en Safari
          —incluso de escritorio—, donde "Pestaña" no tiene sentido o no
          funciona; en esos casos se usa directamente el micrófono. */}
      {!live && !noTabCapture && (
        <div className={`grid-responsive`}>
          <button
            className={`btn-select ${mode === "mic" ? "btn-select-active" : ""}`}
            onClick={() => { setMode("mic"); track("mode_changed", { mode: "mic" }); }}
            disabled={connecting}
          >
            🎙️ Micrófono
            <span className="btn-select-sub">Escuchar la sala por mic</span>
          </button>
          <button
            className={`btn-select ${mode === "tab" ? "btn-select-active" : ""}`}
            onClick={() => { setMode("tab"); track("mode_changed", { mode: "tab" }); }}
            disabled={connecting}
          >
            🖥️ Pestaña
            <span className="btn-select-sub">Audio digital de Meet/Zoom</span>
          </button>
        </div>
      )}
      {error && (
        <div className="mono error-box" style={{
          fontSize: 13,
          color: "var(--loro-red-deep)",
          background: "rgba(239, 68, 68, 0.07)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
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
              <BriefcaseIcon /> Empresa
              <InfoTip text="La empresa donde estás entrevistando. Ayuda a que las respuestas suenen específicas de ese lugar." />
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
              <DocIcon /> Descripción del puesto
              <InfoTip text="Pegá el aviso o el rol al que aplicás: responsabilidades, requisitos, seniority. Cuanto más completo, mejores las respuestas." />
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
            <UserIcon /> Tu perfil / CV
            <InfoTip text="Pegá tu CV, experiencia y logros. El Loro usa esto para responder en tu nombre con datos reales, sin inventar." />
          </label>
          <textarea
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="Pegá tu CV, experiencia o notas. El Loro usará esto para responder."
            className="form-textarea"
            disabled={connecting}
          />
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
              <span className="listen-text listen-text-live">
                <ListenText text={lines.length ? lines[lines.length - 1].text : ""} />
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
        {live && tab === "answer" && (
          <div className="panel" style={{ flex: 1, minHeight: 0 }}>
            <div ref={scrollA} className="answers-container">
              {answers.length === 0 ? (
                <p className="placeholder" style={{ fontSize: 13.5, color: "var(--ink-dim)", lineHeight: 1.6, textAlign: "center", fontStyle: "italic", padding: "8px" }}>
                  Tocá “Responder” cuando termine la pregunta y tu respuesta aparece acá.
                </p>
              ) : (
                answers.map((a, index) => (
                  <div key={a.id} className={`answer-card ${index === answers.length - 1 ? "answer-card-current" : ""}`}>
                    {a.text && (
                      <div className="card-actions">
                        <button
                          className={`card-btn ${copiedId === a.id ? "card-btn-done" : ""}`}
                          onClick={() => copyAnswer(a.id, a.text)}
                          aria-label="Copiar respuesta"
                          title="Copiar respuesta"
                        >
                          {copiedId === a.id ? <CheckIcon /> : <CopyIcon />}
                        </button>
                      </div>
                    )}
                    <div className="answer-card-q-row">
                      <span className="answer-card-label answer-card-label-q">💬 Pregunta</span>
                      <span className="answer-card-question">{a.question}</span>
                    </div>
                    <div className="answer-card-a-row">
                      <span className="answer-card-label answer-card-label-a">⭐ Respuesta</span>
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
                    {a.text && (
                      <div className="answer-footer">
                        <span className="answer-footer-meta mono">Respuesta · {fmtTime(a.ts)}</span>
                        <div className="fb-btns">
                          <button
                            className={`fb-btn ${a.feedback === "up" ? "fb-up" : ""}`}
                            onClick={() => setFeedback(a.id, "up")}
                            aria-label="Respuesta útil"
                          >
                            <ThumbUpIcon />
                          </button>
                          <button
                            className={`fb-btn ${a.feedback === "down" ? "fb-down" : ""}`}
                            onClick={() => setFeedback(a.id, "down")}
                            aria-label="Respuesta no útil"
                          >
                            <ThumbDownIcon />
                          </button>
                        </div>
                      </div>
                    )}
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
            <div className="clear-row">
              <button onClick={clearAll} className="clear-pill mono">
                ✕ Limpiar
              </button>
            </div>
            <button onClick={answerNow} className="btn-action btn-primary btn-answer">
              <span className="btn-answer-inner">
                <SparkleIcon />
                Responder
              </span>
            </button>
          </div>
        )}
        {!live && (
          <p className="mono btn-hint">
            {mode === "mic"
              ? "Apoyá el celular cerca de los parlantes; sin auriculares el micrófono tiene que oír al entrevistador."
              : "Elegí la pestaña del Meet y activá “Compartir audio de la pestaña”."}
          </p>
        )}
      </footer>

      {showPaywall && (
        <div className="paywall-overlay" onClick={() => setShowPaywall(false)}>
          <div className="paywall" onClick={(e) => e.stopPropagation()}>
            {paywallReason === "capacity" ? (
              <>
                <div className="paywall-title">🛑 CUPOS AGOTADOS POR HOY</div>
                <p className="paywall-text">
                  Las APIs son caras y el acceso gratis se abre de a tandas para no fundirme.
                  El cupo de hoy ya se usó entero.
                </p>
              </>
            ) : (
              <>
                <div className="paywall-title">🛑 BETA PAUSADA POR COSTOS</div>
                <p className="paywall-text">
                  Llegaste al límite de {freeSessions} sesiones. Las APIs son caras y tuve que frenar
                  el acceso gratuito para no fundirme.
                </p>
              </>
            )}

            {/* Loop viral: compartir = +1 sesión. Es la vía primaria de salida
                cuando el límite es la cuota del navegador; con el server cerrado
                (capacity) compartir no destraba nada, así que no se ofrece. */}
            {paywallReason === "capacity" ? null : shareDone && sessionsLeft > 0 ? (
              <div className="paywall-share paywall-share-done">
                <div className="paywall-share-title">🦜 ¡Ganaste 1 sesión más!</div>
                <button
                  className="btn-action btn-primary"
                  onClick={() => setShowPaywall(false)}
                >
                  Seguir gratis →
                </button>
              </div>
            ) : bonusRef.current < MAX_BONUS ? (
              <div className="paywall-share">
                <div className="paywall-share-title">🦜 Regalale un Loro a un amigo</div>
                <p className="paywall-text">Compartís y te ganás +1 sesión gratis al toque.</p>
                <button className="btn-action btn-whatsapp" onClick={shareForBonus}>
                  Lorealo por WhatsApp
                </button>
              </div>
            ) : null}

            <p className="paywall-text paywall-cta">
              {paywallReason === "capacity"
                ? "Dejá tu email y te avisamos apenas abra la próxima tanda."
                : "O sumate a la lista de espera para acceso sin límites."}
            </p>
            {emailSent ? (
              <div className="paywall-sent">Enviado ✔ Te avisamos cuando abramos cupos.</div>
            ) : (
              <div className="paywall-form">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && submitWaitlist()}
                  placeholder="tu@email.com"
                  className="form-input"
                />
                <button
                  className="btn-action btn-primary"
                  onClick={submitWaitlist}
                  disabled={!email.trim() || sending}
                >
                  {sending ? "Enviando…" : "Entregá al Loro"}
                </button>
                {emailError && <div className="paywall-error">{emailError}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
