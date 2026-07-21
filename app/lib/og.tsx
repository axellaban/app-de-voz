import { ImageResponse } from "next/og";
import { ParrotSvg } from "./parrot";

// Tamaño estándar de Open Graph / Twitter card.
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

// Paleta "loro" (la del glow del botón Responder): verde → lima → amarillo →
// naranja → rosa → cian. Se reusa en el marco, el título y la pill.
const LORO_GRADIENT =
  "linear-gradient(90deg,#10b981,#34d399,#a3e635,#fbbf24,#f59e0b,#fb7185,#22d3ee,#10b981)";
const LORO_TEXT_GRADIENT =
  "linear-gradient(90deg,#34d399,#a3e635,#fbbf24,#f59e0b,#fb7185,#22d3ee)";

// Card compartible (WhatsApp/Twitter/etc.), psicodélica: marco de degradado,
// glows de color de fondo y tipografía con los colores del loro. Sin fetch
// externo (fuente del sistema) para renderizar en el edge.
// Parametrizable por página; los defaults son la card del copiloto (home).
export function ogImage(opts?: { title?: string; pill?: string; claim?: string }) {
  const title = opts?.title ?? "El copiloto de IA que RRHH no quiere que uses.";
  const pill = opts?.pill ?? "Entrevistas en tiempo real";
  const claim = opts?.claim ?? "Gratis · sin instalar nada";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          // El div externo es el MARCO de degradado (padding = grosor del marco).
          background: LORO_GRADIENT,
          padding: 16,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "#0a0a0f",
            borderRadius: 28,
            padding: "64px 72px",
            overflow: "hidden",
            fontFamily: "sans-serif",
          }}
        >
          {/* Capa de glows psicodélicos de fondo (radiales de color). */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              background:
                "radial-gradient(circle at 12% 18%, rgba(16,185,129,0.45), transparent 42%)," +
                "radial-gradient(circle at 88% 12%, rgba(34,211,238,0.40), transparent 40%)," +
                "radial-gradient(circle at 80% 92%, rgba(251,113,133,0.42), transparent 42%)," +
                "radial-gradient(circle at 22% 95%, rgba(251,191,36,0.35), transparent 45%)," +
                "radial-gradient(circle at 55% 50%, rgba(163,230,53,0.18), transparent 55%)",
            }}
          />

          {/* Marca */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, zIndex: 1 }}>
            <ParrotSvg size={58} />
            <div
              style={{
                display: "flex",
                fontSize: 36,
                fontWeight: 800,
                letterSpacing: 1,
                backgroundImage: LORO_TEXT_GRADIENT,
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
              }}
            >
              Loreado.IA
            </div>
          </div>

          {/* Título con degradado */}
          <div
            style={{
              display: "flex",
              fontSize: 78,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: -1,
              backgroundImage: LORO_TEXT_GRADIENT,
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
              zIndex: 1,
            }}
          >
            {title}
          </div>

          {/* Pie: pill de degradado + claim */}
          <div style={{ display: "flex", alignItems: "center", gap: 22, zIndex: 1 }}>
            <div
              style={{
                display: "flex",
                background: LORO_GRADIENT,
                color: "#06231a",
                fontSize: 30,
                fontWeight: 800,
                padding: "13px 30px",
                borderRadius: 999,
              }}
            >
              {pill}
            </div>
            <div style={{ display: "flex", color: "#c7ccd1", fontSize: 30, fontWeight: 600 }}>
              {claim}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...ogSize }
  );
}
