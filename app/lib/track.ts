import { track as vercelTrack } from "@vercel/analytics";
import posthog from "posthog-js";

// Wrapper de tracking a prueba de fallos: nunca rompe la UI si Analytics no
// está cargado (dev, adblock, etc.). Centraliza los nombres de evento del
// funnel para no tener strings sueltos por el código.
//
// Cada evento se manda a dos destinos: Vercel Analytics (en Hobby los eventos
// custom se descartan; quedan por si se pasa a Pro) y PostHog (el funnel real
// — se inicializa en AnalyticsClient solo si NEXT_PUBLIC_POSTHOG_KEY está).
export type FunnelEvent =
  | "enter_app"
  | "session_start"
  | "session_stopped"
  | "session_error"
  | "answer_requested"
  | "answer_generated"
  | "answer_failed"
  | "answer_feedback"
  | "answer_copied"
  | "model_changed"
  | "lang_changed"
  | "mode_changed"
  | "paywall_shown"
  | "capacity_closed_shown"
  | "waitlist_submit"
  | "share_whatsapp";

export function track(event: FunnelEvent, props?: Record<string, string | number | boolean>) {
  try {
    vercelTrack(event, props);
  } catch {
    // no-op
  }
  try {
    if (posthog.__loaded) posthog.capture(event, props);
  } catch {
    // no-op
  }
}

// Liga el distinct_id anónimo actual a una identidad real (hoy, el único dato
// que tenemos es el email de la waitlist). A partir de acá los eventos previos
// y futuros de este navegador quedan bajo esa persona en PostHog.
export function identify(distinctId: string, props?: Record<string, string>) {
  try {
    if (posthog.__loaded) posthog.identify(distinctId, props);
  } catch {
    // no-op
  }
}
