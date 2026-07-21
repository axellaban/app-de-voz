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

// Mano de Morfeo en perspectiva frontal emergiendo del fondo negro — yemas de dedos mirando al frente
function HandSvg({ side }: { side: "left" | "right" }) {
  const isRight = side === "right";
  const id = isRight ? "R" : "L";

  return (
    <div className="hub-morpheus-hand-wrap" aria-hidden="true">
      <svg
        width="220"
        height="160"
        viewBox="0 0 220 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ transform: isRight ? "scaleX(-1)" : "none" }}
      >
        <defs>
          {/* Gradiente de piel oscura/cuero Morfeo en escena cinematográfica */}
          <radialGradient id={`handSkin${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#58463a" />
            <stop offset="45%" stopColor="#3a2c23" />
            <stop offset="80%" stopColor="#1e150f" />
            <stop offset="100%" stopColor="#080504" />
          </radialGradient>

          {/* Brillo en las yemas de los dedos que apuntan al frente */}
          <linearGradient id={`padHighlight${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,215,185,0.6)" />
            <stop offset="100%" stopColor="rgba(255,215,185,0.15)" />
          </linearGradient>

          {/* Resplandor suave en el cuenco de la palma */}
          <radialGradient id={`palmGlow${id}`} cx="50%" cy="55%" r="40%">
            <stop offset="0%" stopColor="rgba(255,200,160,0.35)" />
            <stop offset="100%" stopColor="rgba(255,200,160,0)" />
          </radialGradient>
        </defs>

        {/* ====== MUÑECA Y ANTEBRAZO (viniendo desde el fondo oscuro) ====== */}
        <path
          d="M 75 160 C 70 135 75 115 85 105 L 135 105 C 145 115 150 135 145 160 Z"
          fill={`url(#handSkin${id})`}
        />

        {/* ====== PALMA CENTRAL VISTA DE FRENTE ====== */}
        <path
          d="M 45 95 C 40 85 45 70 55 65 C 65 60 85 58 110 58 C 135 58 155 60 165 65 C 175 70 180 85 175 95 C 165 110 145 120 110 120 C 75 120 55 110 45 95 Z"
          fill={`url(#handSkin${id})`}
          stroke="rgba(255,190,150,0.22)"
          strokeWidth="1"
        />

        {/* ====== PULGAR EXTENDIDO HACIA EL COSTADO ====== */}
        <path
          d="M 50 82 C 35 78 20 72 12 62 C 6 54 10 44 20 44 C 30 44 42 55 52 68 Z"
          fill={`url(#handSkin${id})`}
          stroke="rgba(255,190,150,0.25)"
          strokeWidth="1"
        />
        {/* Yema del pulgar */}
        <ellipse cx="16" cy="54" rx="7" ry="9" fill={`url(#padHighlight${id})`} opacity="0.75" />

        {/* ====== LOS 4 DEDOS CON LAS YEMAS APUNTANDO AL FRENTE (HACIA LA CÁMARA) ====== */}
        {/* 1. Dedo Índice */}
        <path
          d="M 58 66 C 56 75 58 92 62 108 C 65 122 75 128 84 126 C 90 124 92 112 88 100 C 82 85 76 68 74 62 Z"
          fill={`url(#handSkin${id})`}
          stroke="rgba(255,190,150,0.25)"
          strokeWidth="1"
        />
        {/* Yema del Índice (frente a la cámara) */}
        <ellipse cx="73" cy="116" rx="10" ry="8" fill={`url(#padHighlight${id})`} />

        {/* 2. Dedo Medio (el más frontal) */}
        <path
          d="M 82 60 C 82 72 85 92 90 112 C 94 128 106 134 114 132 C 122 130 122 116 116 100 C 108 82 102 65 98 58 Z"
          fill={`url(#handSkin${id})`}
          stroke="rgba(255,190,150,0.25)"
          strokeWidth="1"
        />
        {/* Yema del Medio (frente a la cámara) */}
        <ellipse cx="102" cy="120" rx="11" ry="9" fill={`url(#padHighlight${id})`} />

        {/* 3. Dedo Anular */}
        <path
          d="M 106 60 C 108 72 112 90 118 108 C 122 122 132 128 140 124 C 146 120 144 108 138 94 C 130 78 124 64 120 60 Z"
          fill={`url(#handSkin${id})`}
          stroke="rgba(255,190,150,0.25)"
          strokeWidth="1"
        />
        {/* Yema del Anular */}
        <ellipse cx="128" cy="114" rx="10" ry="8" fill={`url(#padHighlight${id})`} />

        {/* 4. Meñique */}
        <path
          d="M 128 64 C 132 75 138 90 144 102 C 148 112 156 116 162 112 C 168 108 166 98 158 86 C 150 72 142 64 138 64 Z"
          fill={`url(#handSkin${id})`}
          stroke="rgba(255,190,150,0.2)"
          strokeWidth="1"
        />
        {/* Yema del Meñique */}
        <ellipse cx="151" cy="103" rx="8" ry="7" fill={`url(#padHighlight${id})`} opacity="0.85" />

        {/* ====== PLIEGUES Y SOMBRAS DE ANATOMÍA ====== */}
        {/* Pliegues de las yemas */}
        <path d="M 64 106 C 72 110 82 108 86 102" stroke="rgba(0,0,0,0.6)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M 91 108 C 101 114 112 112 115 104" stroke="rgba(0,0,0,0.6)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M 118 102 C 127 108 136 106 139 98" stroke="rgba(0,0,0,0.6)" strokeWidth="1.5" strokeLinecap="round" />

        {/* Pliegue principal de la palma */}
        <path d="M 52 82 C 80 92 130 90 162 76" stroke="rgba(0,0,0,0.7)" strokeWidth="2" strokeLinecap="round" />

        {/* ====== LUZ ESPECULAR EN LA PALMA ====== */}
        <ellipse cx="108" cy="82" rx="38" ry="16" fill={`url(#palmGlow${id})`} />
      </svg>
    </div>
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

        <h1 className="hub-h1">Metele el Loro (IA) a tus entrevistas</h1>

        <div className="hub-doors-pills">
          <Link
            href="/simulador"
            className="hub-option-btn hub-option-blue"
            onClick={() => track("hub_practice_click")}
          >
            <span className="hub-glow-blue" />
            <div className="hub-pill-wrapper">
              <MatrixPill3D type="blue" />
              <HandSvg side="left" />
            </div>
            <span className="hub-option-label hub-label-blue">Simulador</span>
            <span className="hub-option-sub">practicá con un entrevistador muy simpático</span>
          </Link>

          <Link
            href="/app?ref=copiloto"
            className="hub-option-btn hub-option-red"
            onClick={() => track("hub_copilot_click")}
          >
            <span className="hub-glow-red" />
            <div className="hub-pill-wrapper">
              <MatrixPill3D type="red" />
              <HandSvg side="right" />
            </div>
            <span className="hub-option-label hub-label-red">Copiloto</span>
            <span className="hub-option-sub">te acompaña durante tu entrevista en tiempo real</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
