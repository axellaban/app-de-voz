import { ogImage, ogSize, ogContentType } from "../lib/og";

export const runtime = "edge";
export const alt = "Loreado.IA — Desbloqueá el 'Modo Dios' en tu próxima entrevista";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage({
    title: "Desbloqueá el 'Modo Dios' en tu próxima entrevista",
    pill: "Simulador de entrevistas",
    claim: "Gratis · practicá cuando quieras",
  });
}
