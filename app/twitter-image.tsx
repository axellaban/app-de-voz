import { ogImage, ogSize, ogContentType } from "./lib/og";

export const runtime = "edge";
export const alt = "Loreado.IA — Practicá y ganá tu próxima entrevista con IA";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({
    title: "Practicá y ganá tu próxima entrevista con IA",
    pill: "Simulador + Copiloto",
    claim: "Gratis · sin login",
  });
}
