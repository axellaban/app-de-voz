import type { Metadata } from "next";
import Hub from "../Hub";

export const metadata: Metadata = {
  title: "Loreado IA - El #1 en asistencia de entrevistas con IA",
  description:
    "Entrená tu entrevista con un entrevistador de IA, gratis y sin login. Y el día real, el copiloto te sopla la respuesta en vivo.",
};

export default function Copiloto() {
  return <Hub />;
}
