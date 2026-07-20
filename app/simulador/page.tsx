"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { track, identify } from "../lib/track";

type Status = "idle" | "connecting" | "live" | "error";
type Mode = "mic";
type Line = { id: number; text: string; final: boolean };
type Lang = "es" | "en";
type Provider = "gemini" | "anthropic" | "openai";
type ModelOption = { id: string; label: string; provider: Provider; model: string; tag: string };

type InterviewType = "general" | "technical" | "behavioral" | "hr";

type HistoryItem = {
  question: string;
  answer: string;
};

type FeedbackQuestion = {
  question: string;
  answer: string;
  analysis: string;
  suggestion: string;
};

type FeedbackReport = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  questions: FeedbackQuestion[];
};

const STT_LANG: Record<Lang, string> = { es: "es", en: "en" };

const MODELS: ModelOption[] = [
  { id: "gemini-flash", label: "Gemini 2.5 Flash", provider: "gemini", model: "gemini-2.5-flash", tag: "Recomendado" },
  { id: "gemini-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "gemini", model: "gemini-2.5-flash-lite", tag: "Rápido" },
];
const DEFAULT_MODEL_ID = "gemini-flash";

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString("es-AR", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Sparkle Icon
function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l1.9 4.9 4.9 1.9-4.9 1.9L12 16l-1.9-4.8L5.2 9.3l4.9-1.9L12 2.5z" />
      <path d="M18.5 14.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z" />
    </svg>
  );
}

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

const LS_KEY_CONTEXT = "simulador:context:v1";
const SESSIONS_KEY = "loreado:sessions:v1";
const BONUS_KEY = "loreado:bonus:v1";
const FREE_SESSIONS = 5;
const MAX_BONUS = 3;

export default function SimuladorPage() {
  const [stage, setStage] = useState<"setup" | "interview" | "feedback">("setup");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  // Setup form states
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [profile, setProfile] = useState("");
  const [lang, setLang] = useState<Lang>("es");
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [interviewType, setInterviewType] = useState<InterviewType>("general");
  const [questionsCount, setQuestionsCount] = useState<number>(5);

  // Voice Speech states
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);

  // Interview state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);

  // Feedback state
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [feedbackReport, setFeedbackReport] = useState<FeedbackReport | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Session limits (same system as /app)
  const [sessionsUsed, setSessionsUsed] = useState(0);
  const sessionsUsedRef = useRef(0);
  const [bonus, setBonus] = useState(0);
  const bonusRef = useRef(0);
  const freeSessions = FREE_SESSIONS + bonus;
  const sessionsLeft = Math.max(0, freeSessions - sessionsUsed);

  // Refs for audio and websocket
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const lineId = useRef(0);
  const reconnectAttemptsRef = useRef(0);

  // Selected AI Model
  const selectedModel = MODELS.find((m) => m.id === modelId) || MODELS[0];

  // TTS Helper
  const speakText = useCallback((text: string, language: Lang) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    if (isVoiceMuted) return;

    const utterance = new SpeechSynthesisUtterance(text);
    const langCode = language === "en" ? "en-US" : "es-ES";
    utterance.lang = langCode;

    // Grab voices and find a natural one
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.lang.startsWith(langCode) && (v.name.includes("Google") || v.name.includes("Natural"))
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    } else {
      const backupVoice = voices.find((v) => v.lang.startsWith(langCode));
      if (backupVoice) utterance.voice = backupVoice;
    }

    window.speechSynthesis.speak(utterance);
  }, [isVoiceMuted]);

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
      if (saved.questionsCount) setQuestionsCount(saved.questionsCount);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY_CONTEXT,
        JSON.stringify({ company, role, profile, modelId, lang, interviewType, questionsCount })
      );
    } catch {}
  }, [company, role, profile, modelId, lang, interviewType, questionsCount]);

  // Load Session counter
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

  // Web Speech synthesis load voices guard
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // Handle live transcription messages from Deepgram
  const onDgMessage = useCallback((raw: string) => {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
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
      return next.slice(-40);
    });

    if (isFinal) {
      setCurrentAnswer((prev) => `${prev} ${text}`.trim());
    }
  }, []);

  // Set up microphone capture
  const acquireStream = useCallback(async (): Promise<MediaStream> => {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }, []);

  // Disconnect WebSocket and audio streams
  const cleanup = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
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

    wsRef.current = null;
    workletRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
  }, []);

  // Request the next question from backend
  const fetchNextQuestion = useCallback(async (currentHistory: HistoryItem[]) => {
    setIsGeneratingQuestion(true);
    setCurrentQuestion("");
    try {
      const res = await fetch("/api/simulador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next-question",
          profile,
          company,
          role,
          interviewType,
          answerLang: lang,
          provider: selectedModel.provider,
          model: selectedModel.model,
          history: currentHistory,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Error al obtener la pregunta.");
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let questionText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        questionText += chunk;
        setCurrentQuestion(questionText);
      }

      setIsGeneratingQuestion(false);
      speakText(questionText, lang);
    } catch (err: any) {
      setIsGeneratingQuestion(false);
      setError(err?.message || "Error al conectar con la IA.");
    }
  }, [profile, company, role, interviewType, lang, selectedModel, speakText]);

  // Request final feedback report from backend
  const fetchFeedback = useCallback(async (finalHistory: HistoryItem[]) => {
    setIsGeneratingFeedback(true);
    setStage("feedback");
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
          answerLang: lang,
          provider: selectedModel.provider,
          model: selectedModel.model,
          history: finalHistory,
        }),
      });

      if (!res.ok) {
        throw new Error("No se pudo obtener el reporte de feedback.");
      }

      const report: FeedbackReport = await res.json();
      setFeedbackReport(report);
      setIsGeneratingFeedback(false);
    } catch (err: any) {
      setIsGeneratingFeedback(false);
      setError(err?.message || "Error al procesar el feedback.");
    }
  }, [profile, company, role, interviewType, lang, selectedModel]);

  // Start the interview simulation (connect socket + load first question)
  const startSimulation = useCallback(async () => {
    // 1. Session control check
    if (sessionsUsedRef.current >= freeSessions) {
      setError("Beta pausada: Límite de sesiones gratuitas alcanzado.");
      return;
    }

    setError("");
    setStatus("connecting");
    setHistory([]);
    setLines([]);
    setCurrentAnswer("");
    setFeedbackReport(null);
    setStage("interview");

    const dgUrl = buildDgUrl(STT_LANG[lang]);

    try {
      // Setup Web Audio API and AudioWorklet
      const stream = await acquireStream();
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();
      await audioCtx.audioWorklet.addModule("/pcm-worklet.js");
      
      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, "pcm-worklet");
      workletRef.current = worklet;

      worklet.port.onmessage = (e) => {
        const w = wsRef.current;
        if (w && w.readyState === WebSocket.OPEN) w.send(e.data);
      };
      source.connect(worklet);

      // Connect to Deepgram WS
      const tokRes = await fetch("/api/deepgram-token", { method: "POST" });
      if (!tokRes.ok) {
        throw new Error("Error al obtener token de Deepgram.");
      }
      const { token, scheme } = await tokRes.json();
      const ws = new WebSocket(dgUrl, [scheme || "token", token]);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("live");
        // Start interview loop: fetch first question
        fetchNextQuestion([]);
      };
      ws.onmessage = (e) => onDgMessage(e.data);
      ws.onerror = (err) => {
        console.error("Deepgram WS error:", err);
      };
      ws.onclose = () => {
        setStatus("idle");
      };

      // Count session used
      const used = sessionsUsedRef.current + 1;
      sessionsUsedRef.current = used;
      setSessionsUsed(used);
      try {
        localStorage.setItem(SESSIONS_KEY, String(used));
      } catch {}
      track("session_start", { mode: "mic", model: selectedModel.model });
    } catch (err: any) {
      cleanup();
      setError(err?.message || "No se pudo iniciar el simulador.");
      setStatus("error");
      setStage("setup");
    }
  }, [lang, acquireStream, onDgMessage, fetchNextQuestion, cleanup, freeSessions, selectedModel]);

  // Stop / Cancel simulation
  const stopSimulation = useCallback(() => {
    cleanup();
    setStatus("idle");
    setStage("setup");
    track("session_stopped");
  }, [cleanup]);

  // Submit answer and move forward
  const submitAnswer = useCallback(() => {
    const finalAnswer = currentAnswer.trim();
    if (!finalAnswer) return;

    const updatedHistory = [...history, { question: currentQuestion, answer: finalAnswer }];
    setHistory(updatedHistory);
    setCurrentAnswer("");
    setLines([]);

    if (updatedHistory.length >= questionsCount) {
      // Finished all questions: stop listening and fetch feedback
      cleanup();
      setStatus("idle");
      fetchFeedback(updatedHistory);
      track("answer_generated", { model: selectedModel.model, questions: String(updatedHistory.length) });
    } else {
      // Fetch next question
      fetchNextQuestion(updatedHistory);
    }
  }, [currentAnswer, currentQuestion, history, questionsCount, fetchNextQuestion, fetchFeedback, cleanup, selectedModel]);

  // Copy optimal answers to clipboard
  const copyOptimalAnswer = useCallback((index: number, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1500);
      track("answer_copied", { model: selectedModel.model });
    });
  }, [selectedModel]);

  const live = status === "live";
  const connecting = status === "connecting";

  return (
    <main className={`app-container ${live ? "app-live" : ""}`}>
      {/* Custom Styles block to keep everything 100% isolated from /app */}
      <style dangerouslySetInnerHTML={{ __html: `
        .sim-meta-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
          margin-bottom: 12px;
          border-radius: var(--radius);
        }
        .sim-badge {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: var(--loro-green-bright);
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 8px;
          font-size: 12px;
        }
        .sim-mute-btn {
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 500;
          color: var(--ink-dim);
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
        }
        .sim-mute-btn:hover {
          background: #f8fafc;
          border-color: var(--line-strong);
          color: var(--ink);
        }
        .sim-interview-box {
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
          min-height: 0;
        }
        .sim-card {
          border-radius: var(--radius);
          border: 1px solid var(--line);
          background: var(--panel);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
          overflow: hidden;
        }
        .sim-card-header {
          padding: 12px 16px;
          background: #f8fafc;
          border-bottom: 1px solid var(--line);
          font-weight: 600;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--ink-dim);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sim-card-body {
          padding: 20px;
        }
        .sim-question-text {
          font-size: 17px;
          line-height: 1.6;
          color: var(--ink);
          font-weight: 500;
        }
        .sim-pulse-animation {
          display: inline-flex;
          gap: 4px;
          align-items: center;
        }
        .sim-pulse-dot {
          width: 8px;
          height: 8px;
          background-color: var(--loro-green);
          border-radius: 50%;
          animation: simPulse 1.4s infinite ease-in-out both;
        }
        .sim-pulse-dot:nth-child(2) { animation-delay: 0.2s; }
        .sim-pulse-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes simPulse {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1.0); }
        }
        .sim-answer-textarea {
          width: 100%;
          min-height: 120px;
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 10px;
          font-size: 14.5px;
          line-height: 1.6;
          resize: none;
          background: #fdfdfd;
          outline: none;
          color: var(--ink);
          transition: border-color 0.2s;
        }
        .sim-answer-textarea:focus {
          border-color: var(--loro-green);
          background: #fff;
        }
        .sim-live-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--loro-green-bright);
          font-weight: 600;
          font-size: 12px;
        }
        .sim-live-dot {
          width: 8px;
          height: 8px;
          background: var(--loro-green);
          border-radius: 50%;
          animation: simBlink 1.5s infinite;
        }
        @keyframes simBlink {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
        .sim-feedback-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding-bottom: 30px;
        }
        .sim-score-circle-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.05) 0%, rgba(255,255,255,0) 70%);
        }
        .sim-score-circle {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: #fff;
          border: 8px solid var(--loro-green);
          box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          font-weight: 800;
          color: var(--loro-green-bright);
          margin-bottom: 12px;
          position: relative;
        }
        .sim-score-circle::after {
          content: '/100';
          font-size: 13px;
          color: var(--ink-dim);
          position: absolute;
          bottom: 24px;
        }
        .sim-score-label {
          font-weight: 700;
          font-size: 15px;
          color: var(--ink);
          letter-spacing: -0.01em;
        }
        .sim-columns-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 768px) {
          .sim-columns-layout {
            grid-template-columns: 1fr;
          }
        }
        .sim-feedback-card {
          padding: 16px;
          border-radius: var(--radius);
          border: 1px solid var(--line);
          background: #fff;
        }
        .sim-feedback-card-title {
          font-weight: 700;
          font-size: 14px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .sim-strengths-list, .sim-improvements-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sim-strengths-list li::before {
          content: '✓';
          color: var(--loro-green-bright);
          font-weight: bold;
          margin-right: 8px;
        }
        .sim-improvements-list li::before {
          content: '→';
          color: #f59e0b;
          font-weight: bold;
          margin-right: 8px;
        }
        .sim-strengths-list li, .sim-improvements-list li {
          font-size: 13.5px;
          line-height: 1.5;
          color: var(--ink-dim);
        }
        .sim-question-report-card {
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: #fff;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .sim-report-q-header {
          padding: 14px 16px;
          background: #f8fafc;
          border-bottom: 1px solid var(--line);
          font-weight: 600;
          font-size: 14px;
          color: var(--ink);
        }
        .sim-report-row {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 13.5px;
          line-height: 1.6;
        }
        .sim-report-row:last-child {
          border-bottom: none;
        }
        .sim-report-label {
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          color: var(--ink-dim);
          display: block;
          margin-bottom: 4px;
          letter-spacing: 0.05em;
        }
        .sim-report-val {
          color: var(--ink);
        }
        .sim-report-val-suggestion {
          background: #f0fdf4;
          border: 1px dashed #a7f3d0;
          padding: 12px;
          border-radius: 8px;
          color: var(--loro-green-deep);
          font-style: italic;
          position: relative;
          padding-right: 40px;
        }
        .sim-copy-suggested-btn {
          position: absolute;
          right: 10px;
          top: 10px;
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 6px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ink-dim);
          transition: all 0.15s;
        }
        .sim-copy-suggested-btn:hover {
          color: var(--loro-green-bright);
          border-color: #a7f3d0;
        }
        .sim-loading-feedback {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;
          gap: 16px;
        }
        .sim-loading-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid rgba(16, 185, 129, 0.1);
          border-radius: 50%;
          border-left-color: var(--loro-green);
          animation: simSpin 1s linear infinite;
        }
        @keyframes simSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      ` }} />

      <header className="brand-header">
        <div className="brand">
          <span className="brand-title">Loreado.IA 🦜</span>
          <span className="sim-badge">Simulador Beta</span>
        </div>
        <div className="header-right">
          {live && (
            <div className="header-center">
              <span className="timer-pill sessions-pill">
                Sesión en Vivo
              </span>
            </div>
          )}
          {!live && connecting && <span className="status-chip">conectando…</span>}
          {live && (
            <button className="stop-x" onClick={stopSimulation} aria-label="Detener" title="Detener">
              ✕
            </button>
          )}
        </div>
      </header>

      {stage === "setup" && (
        <>
          <p className="tagline">
            La IA te entrevista en tiempo real simulando un proceso real. Respondé hablando y obtené un reporte de feedback completo. 🦜
          </p>

          <div className="selectors-row" style={{ marginTop: 8 }}>
            <div className="field">
              <label className="mono form-label">Idioma</label>
              <Dropdown
                value={lang}
                onChange={(id) => setLang(id as Lang)}
                disabled={connecting}
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

          <div className="selectors-row" style={{ marginTop: 8 }}>
            <div className="field">
              <label className="mono form-label">Tipo de Entrevista</label>
              <Dropdown
                value={interviewType}
                onChange={(id) => setInterviewType(id as InterviewType)}
                disabled={connecting}
                ariaLabel="Tipo de Entrevista"
                options={[
                  { id: "general", label: "General / Fit Cultural" },
                  { id: "technical", label: "Técnica / Hard Skills" },
                  { id: "behavioral", label: "De Comportamiento (STAR)" },
                  { id: "hr", label: "Inicial / Recursos Humanos" },
                ]}
              />
            </div>
            <div className="field">
              <label className="mono form-label">Cantidad de Preguntas</label>
              <Dropdown
                value={String(questionsCount)}
                onChange={(id) => setQuestionsCount(Number(id))}
                disabled={connecting}
                ariaLabel="Cantidad de preguntas"
                alignRight
                options={[
                  { id: "3", label: "Corta (3 preguntas)" },
                  { id: "5", label: "Estándar (5 preguntas)" },
                  { id: "7", label: "Exhaustiva (7 preguntas)" },
                ]}
              />
            </div>
          </div>

          {error && (
            <div className="mono error-box" style={{
              fontSize: 13,
              color: "var(--loro-red-deep)",
              background: "rgba(239, 68, 68, 0.07)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 12,
              padding: "12px 16px",
              lineHeight: 1.5,
              marginTop: 10
            }}>
              ⚠️ {error}
            </div>
          )}

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
                disabled={connecting}
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
                disabled={connecting}
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
              disabled={connecting}
            />
          </div>

          <footer style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <button onClick={startSimulation} disabled={connecting} className="btn-action btn-primary">
              {connecting ? "Iniciando Simulador… 🦜" : "▶ Iniciar Simulación (requiere micrófono)"}
            </button>
            <p className="mono btn-hint" style={{ textAlign: "center" }}>
              Se consumirá 1 sesión de tu cuota de Loros ({sessionsLeft} restantes).
            </p>
          </footer>
        </>
      )}

      {stage === "interview" && (
        <div className="sim-interview-box">
          <div className="sim-meta-header">
            <span className="mono" style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-dim)" }}>
              Pregunta {history.length + 1} de {questionsCount}
            </span>
            
            <button
              onClick={() => {
                const nextMuted = !isVoiceMuted;
                setIsVoiceMuted(nextMuted);
                if (nextMuted) {
                  window.speechSynthesis?.cancel();
                } else if (currentQuestion) {
                  speakText(currentQuestion, lang);
                }
              }}
              className="sim-mute-btn"
            >
              {isVoiceMuted ? "🔇 Voz silenciada" : "🔊 Voz de IA activa"}
            </button>
          </div>

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

          <div className="sim-card">
            <div className="sim-card-header">
              <span>🎙️ Entrevistador (IA)</span>
              {isGeneratingQuestion && <span className="mono" style={{ fontSize: 11 }}>Pensando pregunta…</span>}
            </div>
            <div className="sim-card-body">
              {isGeneratingQuestion ? (
                <div className="sim-pulse-animation">
                  <div className="sim-pulse-dot" />
                  <div className="sim-pulse-dot" />
                  <div className="sim-pulse-dot" />
                </div>
              ) : (
                <p className="sim-question-text">{currentQuestion || "(esperando pregunta…)"}</p>
              )}
            </div>
          </div>

          <div className="sim-card" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div className="sim-card-header">
              <span>👤 Tu Respuesta</span>
              <div className="sim-live-badge">
                <span className="sim-live-dot" />
                <span>En Vivo</span>
              </div>
            </div>
            <div className="sim-card-body" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 12 }}>
              <textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                placeholder="El micrófono está encendido. Respondé hablando en voz alta, o podés escribir/editar tu respuesta acá directamente..."
                className="sim-answer-textarea"
                style={{ flex: 1 }}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-dim)", fontStyle: "italic", height: 18, overflow: "hidden" }}>
                {lines.length > 0 && `Transcribiendo: ${lines[lines.length - 1].text}`}
              </div>
            </div>
          </div>

          <footer style={{ display: "flex", flexDirection: "column", gap: 8, position: "sticky", bottom: 0, paddingTop: 4, background: "var(--bg)" }}>
            <button
              onClick={submitAnswer}
              disabled={!currentAnswer.trim() || isGeneratingQuestion}
              className="btn-action btn-primary"
            >
              {history.length + 1 === questionsCount ? "Enviar y Ver Feedback 🏆" : "Enviar y Siguiente Pregunta →"}
            </button>
            <button
              onClick={stopSimulation}
              className="clear-pill mono"
              style={{ alignSelf: "center" }}
            >
              ✕ Cancelar Simulación
            </button>
          </footer>
        </div>
      )}

      {stage === "feedback" && (
        <div className="sim-feedback-container">
          {isGeneratingFeedback ? (
            <div className="sim-loading-feedback">
              <div className="sim-loading-spinner" />
              <h2 className="mono" style={{ fontSize: 16, fontWeight: 700 }}>Generando reporte de feedback…</h2>
              <p className="tagline" style={{ maxWidth: 360 }}>
                El Coach de IA está evaluando tu respuesta en base a la señal, fit cultural y claridad de comunicación. Esto demora unos segundos.
              </p>
            </div>
          ) : (
            <>
              <div className="sim-score-circle-wrapper">
                <div className="sim-score-circle">
                  {feedbackReport?.score ?? 0}
                </div>
                <div className="sim-score-label">PUNTAJE GENERAL</div>
              </div>

              <div className="sim-card">
                <div className="sim-card-header">📊 Resumen del Coach</div>
                <div className="sim-card-body">
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink)" }}>
                    {feedbackReport?.summary}
                  </p>
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
                      Pregunta {i + 1}: {q.question}
                    </div>
                    <div className="sim-report-row">
                      <span className="sim-report-label">Tu Respuesta</span>
                      <p className="sim-report-val" style={{ color: "var(--ink-dim)" }}>{q.answer}</p>
                    </div>
                    <div className="sim-report-row">
                      <span className="sim-report-label">Análisis del Coach</span>
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

              <button
                onClick={() => setStage("setup")}
                className="btn-action btn-primary"
                style={{ marginTop: 10 }}
              >
                🔄 Iniciar Nueva Simulación
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
