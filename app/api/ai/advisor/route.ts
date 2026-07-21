type AdvisorRequest = {
  locale?: "ru" | "kk";
  profile?: {
    category?: string;
    product?: string;
    kind?: string;
    sizeHa?: number;
    powerNeed?: string;
    waterNeed?: boolean;
    railNeeded?: boolean;
  };
  zone?: {
    cell_id?: string;
    score?: number;
    ndvi?: number;
    ndwi?: number;
    ndbi?: number;
    confidence?: number;
    surface_water_pct?: number;
  };
  infrastructure?: { powerKm?: number | null; railKm?: number | null; waterKm?: number | null };
  nearbySite?: { name?: string; distanceKm?: number; ownershipStatus?: string } | null;
};

type Advice = {
  title: string;
  summary: string;
  pluses: string[];
  minuses: string[];
  nextSteps: string[];
  provider: "groq" | "rules";
  model?: string;
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 4);
  return items.length ? items : fallback;
}

function fallbackAdvice(body: AdvisorRequest): Advice {
  const kk = body.locale === "kk";
  const score = Math.max(0, Math.min(100, Math.round(finite(body.zone?.score) ?? 0)));
  const product = body.profile?.product?.trim() || (kk ? "жоба" : "проект");
  const powerKm = finite(body.infrastructure?.powerKm);
  const railKm = finite(body.infrastructure?.railKm);
  const waterKm = finite(body.infrastructure?.waterKm);
  const confidence = finite(body.zone?.confidence) ?? 0;
  const pluses: string[] = [];
  const minuses: string[] = [];

  if (score >= 75) pluses.push(kk ? "Бұл аймақ өңірдегі ең қолайлы аймақтардың қатарына кіреді." : "Зона входит в число наиболее подходящих по региону.");
  else if (score >= 55) pluses.push(kk ? "Жобаны қарастыруға болады, бірақ негізгі шарттарды тексеру қажет." : "Зону можно рассматривать после проверки ключевых условий.");
  if (powerKm !== null && powerKm <= 15) pluses.push(kk ? `Картадағы электр нысаны шамамен ${powerKm} км жерде.` : `Отмеченный на карте объект электросети находится примерно в ${powerKm} км.`);
  if (body.profile?.waterNeed && waterKm !== null && waterKm <= 15) pluses.push(kk ? `Су немесе канал нысаны шамамен ${waterKm} км жерде.` : `Водный объект или канал отмечен примерно в ${waterKm} км.`);
  if (body.profile?.railNeeded && railKm !== null && railKm <= 25) pluses.push(kk ? `Теміржол шамамен ${railKm} км жерде.` : `Железная дорога отмечена примерно в ${railKm} км.`);
  if (confidence >= 90) pluses.push(kk ? "Спутниктік деректердің қамту сапасы жоғары." : "У спутниковых данных хорошее покрытие этой зоны.");

  if (score < 55) minuses.push(kk ? "Бастапқы деректер бұл жерді әлсіз нұсқа ретінде көрсетеді; жақсырақ аймақтарды салыстырған жөн." : "Исходные данные показывают слабую пригодность; стоит сравнить более сильные зоны.");
  if (powerKm === null || powerKm > 15) minuses.push(kk ? "Жақын электр қуаты мен қосылу мүмкіндігі расталмаған." : "Близкая электрическая мощность и возможность подключения не подтверждены.");
  if (body.profile?.waterNeed && (waterKm === null || waterKm > 15)) minuses.push(kk ? "Тұрақты су көзі мен су пайдалану құқығын растау қажет." : "Нужно подтвердить постоянный источник воды и право водопользования.");
  if (body.profile?.railNeeded && (railKm === null || railKm > 25)) minuses.push(kk ? "Жобаға қажет жақын теміржол табылмады." : "Не найдена железная дорога достаточно близко для указанной потребности.");
  minuses.push(kk ? "Жер телімінің шекарасы, мақсаты және меншік иесі әлі кадастрмен расталмаған." : "Границы, назначение и собственник земли пока не подтверждены кадастром.");

  return {
    title: score >= 75 ? (kk ? "Бұл аймақты бірінші кезекте тексеріңіз" : "Эту зону стоит проверить первой") : score >= 55 ? (kk ? "Аймақ шартты түрде қолайлы" : "Зона подходит при выполнении условий") : (kk ? "Жақсырақ аймақты салыстырыңыз" : "Лучше сравнить с более сильной зоной"),
    summary: kk
      ? `${product} жобасы үшін бастапқы баға — ${score}/100. Бұл инвестициялық шешім емес, ең перспективалы жерлерді тез таңдауға арналған сүзгі.`
      : `Предварительная оценка для проекта «${product}» — ${score}/100. Это не инвестиционное решение, а фильтр для быстрого выбора перспективных мест.`,
    pluses: pluses.slice(0, 4).length ? pluses.slice(0, 4) : [kk ? "Аймақ бойынша спутниктік және инфрақұрылымдық деректер бар." : "По зоне доступны спутниковые и инфраструктурные данные."],
    minuses: minuses.slice(0, 4),
    nextSteps: kk
      ? ["Жер телімін кадастрдан және рұқсат етілген пайдалану түрін тексеру.", "Электр желісі операторынан қосылу қуаты мен құнын сұрату.", body.profile?.category === "agriculture" ? "Топырақтың тұздылығын, құрамын және суару мүмкіндігін зертханада тексеру." : "Жол, су, санитарлық аймақ және логистика бойынша техникалық тексеру жүргізу."]
      : ["Проверить конкретный участок в кадастре и разрешённый вид использования.", "Запросить у сетевого оператора доступную мощность, стоимость и срок подключения.", body.profile?.category === "agriculture" ? "Сделать лабораторный анализ почвы, засоления и подтвердить возможность орошения." : "Проверить подъездную дорогу, воду, санитарные зоны и логистику."],
    provider: "rules",
  };
}

export async function POST(request: Request) {
  let body: AdvisorRequest;
  try {
    body = await request.json() as AdvisorRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fallback = fallbackAdvice(body);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json(fallback, { headers: { "Cache-Control": "no-store" } });

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const language = body.locale === "kk" ? "Kazakh" : "Russian";
  const prompt = {
    project: body.profile,
    zone: body.zone,
    mapped_infrastructure: body.infrastructure,
    nearby_investment_site: body.nearbySite,
    baseline: fallback,
  };

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are an investment location advisor for Turkistan Region. Write only in ${language}, for a non-technical investor. Use only supplied facts. Never invent ownership, grid capacity, soil chemistry, permits or water rights. Explain benefits, drawbacks and next checks in plain language. Return JSON with exactly: title string, summary string, pluses string[], minuses string[], nextSteps string[]. Keep each list to 2-4 concise items.`,
          },
          { role: "user", content: JSON.stringify(prompt) },
        ],
      }),
      signal: AbortSignal.timeout(14000),
    });
    if (!response.ok) throw new Error(`Groq returned ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned an empty response");
    const parsed = JSON.parse(content) as Partial<Advice>;
    return Response.json({
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : fallback.title,
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary,
      pluses: cleanList(parsed.pluses, fallback.pluses),
      minuses: cleanList(parsed.minuses, fallback.minuses),
      nextSteps: cleanList(parsed.nextSteps, fallback.nextSteps),
      provider: "groq",
      model,
    } satisfies Advice, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(fallback, { headers: { "Cache-Control": "no-store" } });
  }
}
