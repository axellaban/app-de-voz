"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ParrotSvg } from "./lib/parrot";
import { track } from "./lib/track";

// Home = hub escalera de valor. Lidera con el simulador gratis (fast-win, sin
// login) para ganar la primera visita, y ofrece el copiloto en vivo como el
// upgrade natural ("el día de la entrevista de verdad"). Una sola acción
// dominante por bloque. El hook "RRHH no quiere que uses" vive en /copiloto.
export default function Hub() {
  // Social proof simulada: número que deriva lentamente entre 35 y 90 para que
  // parezca actividad real. Mismo patrón que el setup del simulador.
  const [practicing, setPracticing] = useState(0);
  useEffect(() => {
    setPracticing(35 + Math.floor(Math.random() * 56));
    const iv = setInterval(() => {
      setPracticing((p) => Math.min(90, Math.max(35, p + Math.floor(Math.random() * 5) - 2)));
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="hub">
      {/* Bloque 1 — hero: el simulador gratis */}
      <section className="hub-hero">
        <div className="hub-brand">
          <ParrotSvg size={34} />
          <span className="hub-brand-name">Loreado.IA</span>
        </div>

        <span className="hub-pill">Gratis · sin login</span>

        <h1 className="hub-h1">
          Entrená la entrevista que te puede cambiar la vida.
        </h1>

        <p className="hub-sub">
          Un entrevistador de IA que te repregunta de verdad, por voz. Al
          terminar, un informe honesto de en qué mejorar. En 5 minutos, sin
          registrarte.
        </p>

        <div className="landing-btn-wrap hub-cta-primary">
          <div className="landing-glow" aria-hidden="true" />
          <Link
            href="/simulador"
            className="landing-btn"
            onClick={() => track("hub_practice_click")}
          >
            Practicar gratis →
          </Link>
        </div>

        <p className="hub-counter" aria-live="off">
          <span className="hub-counter-dot" aria-hidden="true" />
          {practicing || 42} personas practicando ahora
        </p>
      </section>

      {/* Bloque 2 — upgrade: el copiloto en vivo */}
      <section className="hub-upgrade">
        <p className="hub-kicker">¿Y el día de la entrevista de verdad?</p>
        <h2 className="hub-h2">
          No vas solo. El Loro te sopla la respuesta en vivo.
        </h2>
        <p className="hub-sub hub-sub-upgrade">
          Sabías la respuesta pero te quedaste en blanco. El Loro escucha la
          pregunta y te sopla qué decir al instante —armada con tu CV, la
          empresa y el puesto—. Vos solo la leés. Nadie se entera.
        </p>

        <Link
          href="/app?ref=copiloto"
          className="hub-cta-secondary"
          onClick={() => track("hub_copilot_click")}
        >
          Ver el copiloto en vivo →
        </Link>
        <p className="hub-note">Beta · cupos limitados</p>
      </section>

      {/* Bloque 3 — cómo funciona + línea anti-marketing */}
      <section className="hub-how">
        <ol className="hub-steps">
          <li className="hub-step">
            <span className="hub-step-n">1</span>
            <span className="hub-step-t">Cargás el puesto y tu CV.</span>
          </li>
          <li className="hub-step">
            <span className="hub-step-n">2</span>
            <span className="hub-step-t">Te entrevista por voz, en vivo.</span>
          </li>
          <li className="hub-step">
            <span className="hub-step-n">3</span>
            <span className="hub-step-t">
              Recibís tu informe. Y en la real, te sopla la respuesta.
            </span>
          </li>
        </ol>
        <p className="hub-anti">
          Sin cursos, sin gurús, sin promesas mágicas. Practicás, te mostramos
          la verdad, y el día que cuenta no estás solo.
        </p>
      </section>
    </div>
  );
}
