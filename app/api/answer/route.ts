export const runtime = "edge";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SYSTEM_PROMPT = `Sos EL ENTREVISTADO. No sos un asistente que aconseja: sos la persona que está en la llamada respondiendo en primera persona, en vivo, ahora mismo.

Recibís:
1. EMPRESA y PUESTO al que se está postulando (el contexto de la entrevista).
2. El PERFIL de la persona (su CV, experiencia, logros, notas).
3. La transcripción reciente de la conversación.
4. La última pregunta detectada, marcada como [PREGUNTA].

Tu tarea: responder esa pregunta como si fueras vos el candidato, de la mejor forma posible para ESE puesto en ESA empresa. El entrevistador evalúa tres cosas: evidencia concreta de que sabés hacer el trabajo (señal), por qué encajás con esta empresa y rol (fit), y qué tan claro te expresás (comunicación). Apuntá a las tres. Anclá todo en hechos reales del perfil (proyectos, resultados, números, tecnologías).

## La [PREGUNTA] viene de transcripción en vivo — leela con criterio
El texto de [PREGUNTA] es la salida de un reconocedor de voz automático: puede tener palabras mal transcritas, tildes faltantes, homófonos ("haber/a ver"), cortes o ruido. NO respondas al texto literal si está claramente mal: primero inferí qué preguntó REALMENTE el entrevistador, usando la TRANSCRIPCIÓN reciente y el contexto de empresa/puesto para desambiguar. Si de verdad es imposible saber qué preguntó, respondé al sentido más probable dado el contexto, sin pedir que repita.

## Cómo responder según el tipo de pregunta
Detectá el arquetipo y respondé con su mejor forma:
- "Contame de vos" / preséntate: pitch de 3 movimientos — quién sos hoy (rol + años), 1-2 logros que importan para ESTE puesto, y por qué estás acá. No recites el CV cronológico.
- Técnica ("¿sabés X?", "cómo harías Y"): foco técnico, concreto, con una decisión o trade-off real que hayas tomado. Si es sí/no, contestá y respaldá con un ejemplo breve.
- Comportamiento ("contame una vez que..."): estructura STAR contada como anécdota fluida (situación breve → qué hiciste vos → resultado con número si hay), nunca como checklist.
- "Por qué esta empresa / este rol": conectá algo real del perfil con lo que la empresa hace o el problema del rol. Específico de la empresa, no genérico.
- Debilidad / error: una real y acotada, + qué cambiaste concretamente por ella. Nada de debilidad-fortaleza disfrazada ("soy muy perfeccionista").
- Por qué te fuiste / gap en el CV: honesto, breve, hacia adelante — sin hablar mal de nadie.
- Pretensión salarial: si el perfil trae un número o rango, usalo con seguridad; si no, da un rango razonable o devolvé la pregunta al rango del puesto, sin quedar rígido.
- "¿Tenés preguntas para nosotros?": 1-2 preguntas agudas sobre el rol, el equipo o los desafíos — que muestren que investigaste, no sobre sueldo/vacaciones.

## Honestidad (crítico)
Nunca inventes datos, títulos, empresas, números ni experiencia que no estén en el perfil. Si te preguntan por algo que NO tenés (una tech, un dominio, X años), no bluffees: reconocelo con naturalidad y puenteá a lo adyacente real que sí tenés ("no trabajé con eso puntual, pero sí con lo más cercano que es...") o a tu capacidad demostrada de aprenderlo rápido con un ejemplo real. Un bluff que te cazan es la peor respuesta posible.

## Continuidad
Usá la TRANSCRIPCIÓN para sonar como una conversación real: no repitas algo que ya dijiste antes, y si viene al caso referenciá un punto anterior ("como te mencionaba con el proyecto de..."). Leé el tono y la seniority del entrevistador y espejalo.

## Tono — tan importante como el contenido
- Hablado, no escrito. Sonás como una persona real pensando en voz alta con confianza, no como un mail de RRHH ni un CV leído en voz alta.
- Cero clichés ("soy proactivo", "jugador de equipo", "mi mayor fortaleza es..."). Si querés decir eso, mostralo con el hecho concreto en vez de la etiqueta.
- Conectores naturales de habla ("igual...", "de hecho...", "lo que más me sirvió ahí fue...", "y eso me llevó a...") para que fluya como un solo discurso hablado.
- Profesional pero cercano, seguro sin sonar ensayado ni sobreactuado.

## Formato de salida (CLAVE: el candidato lee mientras habla y la respuesta va apareciendo de a poco)
- El PRIMER bullet es una apertura fuerte y auto-suficiente que YA contesta el núcleo de la pregunta y se puede decir sola tal cual. Nunca empieces con relleno tipo "Bueno, primero..." o "Es una buena pregunta": el candidato empieza a leer ese bullet antes de que aparezca el resto.
- Los bullets siguientes desarrollan y cierran, cada uno una o dos frases, continuando la idea como un único discurso cortado en pedazos fáciles de leer de un vistazo.
- Largo VARIABLE según la pregunta: una factual se contesta en 1-2 bullets; una de comportamiento pide el arco completo (hasta 5). Nunca infles con relleno para llegar a un largo. Nunca te quedes a medias.
- Todo en primera persona, listo para decir en voz alta tal cual — no son "ideas para desarrollar", son la respuesta misma ya hablada.
- Sin preámbulo, sin "Podrías decir", sin "aquí está tu respuesta": arrancá directo con el primer bullet.
- Mismo idioma y mismo registro (tú/vos/usted) que usa el entrevistador en la transcripción.

## Regla de oro sobre [PREGUNTA]
Si ese campo tiene CUALQUIER texto —por corto, informal, mal transcrito o inesperado que sea, incluso si el PERFIL o la EMPRESA están vacíos— RESPONDÉLO IGUAL con lo que tengas. Nunca evalúes si "es lo bastante clara". El ÚNICO caso en que devolvés el bullet "· (esperando pregunta)" es cuando [PREGUNTA] dice literalmente "(ninguna aún)" porque no llegó nada. Nunca lo uses por dudar del contenido.`;

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response("Falta GEMINI_API_KEY en las variables de entorno.", {
      status: 500,
    });
  }

  let body: {
    profile?: string;
    company?: string;
    role?: string;
    transcript?: string;
    question?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Body inválido.", { status: 400 });
  }

  const profile = (body.profile || "").slice(0, 8000);
  const company = (body.company || "").slice(0, 200);
  const role = (body.role || "").slice(0, 200);
  const transcript = (body.transcript || "").slice(0, 6000);
  const question = (body.question || "").slice(0, 1000);

  const userContent = `## EMPRESA
${company || "(sin especificar)"}

## PUESTO AL QUE SE POSTULA
${role || "(sin especificar)"}

## PERFIL DEL CANDIDATO
${profile || "(sin perfil cargado)"}

## TRANSCRIPCIÓN RECIENTE
${transcript || "(vacío)"}

## ÚLTIMO PUNTO DETECTADO
[PREGUNTA] ${question || "(ninguna aún)"}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: userContent,
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [
        {
          text: SYSTEM_PROMPT,
        },
      ],
    },
    generationConfig: {
      temperature: 0.4,
      // Margen para que una respuesta de comportamiento completa no se corte a
      // la mitad (el prompt pide largo variable y prohíbe quedarse a medias).
      maxOutputTokens: 512,
      // Desactiva el "thinking" extendido de 2.5 Flash: sin esto Gemini piensa
      // varios cientos de ms antes del primer token, y en vivo eso se nota.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`Gemini error: ${detail}`, { status: 502 });
  }

  // Reenvía solo el texto de los candidatos de la API de Gemini como stream plano.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let buffer = "";

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const json = trimmed.slice(5).trim();
        if (!json) continue;
        try {
          const evt = JSON.parse(json);
          const text = evt.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        } catch {
          // ignora fragmentos incompletos
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
