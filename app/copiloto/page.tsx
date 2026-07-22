import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Loreado.IA — Acceso Beta",
  description: "El copiloto de IA que RRHH no quiere que uses. Acceso beta cerrado.",
};

export default function Copiloto() {
  return (
    <div className="landing">
      <main className="landing-main">
        <h1 className="landing-title">
          El copiloto de IA que RRHH no quiere que uses.
        </h1>

        <Image
          src="/toby.gif"
          alt="Toby de RRHH"
          width={320}
          height={240}
          unoptimized
          className="landing-sticker"
        />

        <h2 className="landing-sub">Acceso beta cerrado.</h2>

        <div className="landing-btn-wrap">
          <div className="landing-glow" aria-hidden="true" />
          <Link href="/app" className="landing-btn">
            Entrá
          </Link>
        </div>

        <p className="landing-warn">
          ⚠️ Estamos experimentando una demanda excepcionalmente alta. Por favor, tené
          paciencia mientras trabajamos en escalar nuestros sistemas.
        </p>
      </main>
    </div>
  );
}
