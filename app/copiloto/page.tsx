import type { Metadata } from "next";
import Hub from "../Hub";

export const metadata: Metadata = {
  title: "Loreado.IA — Practicá y ganá tu próxima entrevista con IA",
  description:
    "Entrená tu entrevista con un entrevistador de IA, gratis y sin login. Y el día real, el copiloto te sopla la respuesta en vivo.",
};

export default function Copiloto() {
  return <Hub />;
}
