"use client";

import Link from "next/link";
import { ParrotSvg } from "./lib/parrot";
import { track } from "./lib/track";

// Banderita tipo Final Round con el texto "IA"
function IaFlag() {
  return (
    <svg
      width="35"
      height="30"
      viewBox="0 0 35 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <path
        d="M6 2h24a4 4 0 0 1 4 4v2a2 2 0 0 1-.4 1.2L29.5 14l4.1 4.8a2 2 0 0 1 .4 1.2v2a4 4 0 0 1-4 4H9.5L4.5 29.5c-.6.5-1.5.1-1.5-.7V26H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h2z"
        fill="#ff4f12"
      />
      <text
        x="16.5"
        y="14"
        fill="#ffffff"
        fontSize="11"
        fontWeight="bold"
        fontFamily="system-ui, -apple-system, sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        IA
      </text>
    </svg>
  );
}

// Cápsula 3D realista idéntica a la imagen de referencia Matrix
function MatrixPill3D({ type }: { type: "blue" | "red" }) {
  const isRed = type === "red";
  const idSuffix = isRed ? "Red" : "Blue";

  return (
    <svg
      width="140"
      height="58"
      viewBox="0 0 140 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="hub-3d-pill-svg"
      aria-hidden="true"
    >
      <defs>
        <filter id={`pillShadow${idSuffix}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>

        <linearGradient id={`gelBody${idSuffix}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={isRed ? "#f87171" : "#38bdf8"} />
          <stop offset="30%" stopColor={isRed ? "#ef4444" : "#0284c7"} />
          <stop offset="75%" stopColor={isRed ? "#b91c1c" : "#0369a1"} />
          <stop offset="100%" stopColor={isRed ? "#7f1d1d" : "#075985"} />
        </linearGradient>
      </defs>

      {/* Sombra de cáustica de color sobre el suelo */}
      <ellipse
        cx="70"
        cy="52"
        rx="52"
        ry="6"
        fill={isRed ? "#ef4444" : "#0284c7"}
        opacity="0.55"
        filter={`url(#pillShadow${idSuffix})`}
      />

      {/* Cuerpo principal de la cápsula */}
      <rect
        x="15"
        y="10"
        width="110"
        height="38"
        rx="19"
        fill={`url(#gelBody${idSuffix})`}
        stroke={isRed ? "rgba(248, 113, 113, 0.6)" : "rgba(56, 189, 248, 0.6)"}
        strokeWidth="1.5"
      />

      {/* Refracción translúcida interna */}
      <rect
        x="22"
        y="14"
        width="96"
        height="30"
        rx="15"
        fill={isRed ? "#f87171" : "#38bdf8"}
        opacity="0.25"
      />

      {/* Costura divisoria central de la cápsula */}
      <line x1="68" y1="10" x2="68" y2="48" stroke={isRed ? "#7f1d1d" : "#0369a1"} strokeWidth="1.5" opacity="0.8" />
      <line x1="70" y1="10" x2="70" y2="48" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

      {/* Reflejos de cristal tipo ventana (especular alto) */}
      <ellipse cx="55" cy="18" rx="28" ry="3" fill="white" opacity="0.85" />
      <path d="M 32 14 H 108 C 114 14 120 17 120 22 C 120 18 114 14 108 14 H 32 Z" fill="white" opacity="0.9" />

      {/* Borde de luz inferior */}
      <path
        d="M 30 44 C 50 47 90 47 110 44"
        stroke={isRed ? "#fee2e2" : "#e0f2fe"}
        strokeWidth="1.5"
        opacity="0.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Hub minimal (Luhmann): un solo mensaje y dos puertas.
export default function Hub() {
  return (
    <div className="hub">
      <main className="hub-main">
        <div className="hub-brand" aria-hidden="true">
          <ParrotSvg size={44} />
          <span className="hub-brand-text">Loreado</span>
          <IaFlag />
        </div>

        <h1 className="hub-h1">Metele el Loro a tus entrevistas</h1>

        <span className="hub-tagline-pill">Asistente de IA en Tiempo Real</span>

        <div className="hub-doors-pills">
          <Link
            href="/simulador"
            className="hub-option-btn hub-option-blue"
            onClick={() => track("hub_practice_click")}
          >
            <span className="hub-glow-blue" />
            <div className="hub-pill-wrapper">
              <MatrixPill3D type="blue" />
            </div>
            <span className="hub-option-label hub-label-blue">Simulador</span>
            <span className="hub-option-sub">Practicá con simulacros de entrevistas con IA</span>
          </Link>

          <Link
            href="/app?ref=copiloto"
            className="hub-option-btn hub-option-red"
            onClick={() => track("hub_copilot_click")}
          >
            <span className="hub-glow-red" />
            <div className="hub-pill-wrapper">
              <MatrixPill3D type="red" />
            </div>
            <span className="hub-option-label hub-label-red">Copiloto</span>
            <span className="hub-option-sub">Respuestas instantáneas e indetectables durante entrevistas en vivo</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
