"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ALPHA_RANK_FEATURES,
  featureVectorFromAnalysis,
  type AlphaRankStatus,
} from "../../lib/alpha-rank";
import {
  analyzeSuitability,
  type SuitabilityAnalysis,
  type SuitabilityCell,
  type SuitabilityMetadata,
  type SuitabilityProfile,
} from "../../lib/suitability";

type LabCell = SuitabilityCell & {
  cell_id: string;
  latitude: number;
  longitude: number;
  area_km2: number;
};

type LabCollection = {
  metadata: SuitabilityMetadata;
  features: Array<{ properties: LabCell }>;
};

type Scenario = {
  id: string;
  label: string;
  product: string;
  profile: SuitabilityProfile;
};

type Candidate = {
  cell: LabCell;
  analysis: SuitabilityAnalysis;
};

const scenarios: Scenario[] = [
  { id: "rice", label: "Рисовое хозяйство", product: "Рис", profile: { category: "agriculture", productKey: "rice", customProduct: "", sizeHa: 100, powerNeed: "medium", waterNeed: true, railNeeded: false } },
  { id: "vegetables", label: "Овощи и теплица", product: "Овощи и теплица", profile: { category: "agriculture", productKey: "vegetables", customProduct: "", sizeHa: 50, powerNeed: "medium", waterNeed: true, railNeeded: false } },
  { id: "food", label: "Пищевая переработка", product: "Пищевая переработка", profile: { category: "manufacturing", productKey: "food", customProduct: "", sizeHa: 100, powerNeed: "high", waterNeed: true, railNeeded: false } },
  { id: "warehouse", label: "Логистический центр", product: "Логистический центр", profile: { category: "logistics", productKey: "warehouse", customProduct: "", sizeHa: 60, powerNeed: "medium", waterNeed: false, railNeeded: true } },
  { id: "solar", label: "Солнечная электростанция", product: "Солнечная электростанция", profile: { category: "energy", productKey: "solar", customProduct: "", sizeHa: 300, powerNeed: "high", waterNeed: false, railNeeded: false } },
];

function makePair(data: LabCollection, scenario: Scenario): [Candidate, Candidate] {
  const ranked = data.features
    .map(({ properties }) => ({ cell: properties, analysis: analyzeSuitability(properties, scenario.profile, data.metadata) }))
    .filter((item) => item.cell.confidence >= 70)
    .sort((a, b) => b.analysis.score - a.analysis.score)
    .slice(0, 180);
  const firstIndex = Math.floor(Math.random() * Math.max(1, Math.min(130, ranked.length - 2)));
  const first = ranked[firstIndex];
  const comparable = ranked
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate, index }) => index !== firstIndex && Math.abs(candidate.analysis.score - first.analysis.score) <= 10)
    .filter(({ index }) => Math.abs(index - firstIndex) >= 2)
    .slice(0, 35);
  const second = comparable[Math.floor(Math.random() * comparable.length)]?.candidate ?? ranked[Math.min(firstIndex + 3, ranked.length - 1)];
  return Math.random() > 0.5 ? [first, second] : [second, first];
}

function distance(value: number | null) {
  return value === null ? "нет данных" : `${value.toFixed(1)} км`;
}

function CandidateCard({ title, candidate, onChoose, disabled }: { title: string; candidate: Candidate; onChoose: () => void; disabled: boolean }) {
  const components = [
    ["Земля / профиль", candidate.analysis.components.landAndCrop],
    ["Электричество", candidate.analysis.components.electricity],
    ["Вода", candidate.analysis.components.water],
    ["Логистика", candidate.analysis.components.logistics],
    ["Качество данных", candidate.analysis.confidence],
  ] as const;
  return (
    <article className="lab-candidate">
      <div className="lab-card-heading">
        <span>{title}</span>
        <strong>{candidate.cell.cell_id}</strong>
        <small>{candidate.cell.latitude.toFixed(4)}, {candidate.cell.longitude.toFixed(4)}</small>
      </div>
      <div className="lab-facts">
        <span><small>Электросеть</small><strong>{distance(candidate.analysis.distances.powerKm)}</strong></span>
        <span><small>Вода / канал</small><strong>{distance(candidate.analysis.distances.waterKm)}</strong></span>
        <span><small>Железная дорога</small><strong>{distance(candidate.analysis.distances.railKm)}</strong></span>
        <span><small>Площадь ячейки</small><strong>{candidate.cell.area_km2.toFixed(0)} км²</strong></span>
      </div>
      <div className="lab-components">
        {components.map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value}</strong></div>)}
      </div>
      <div className="lab-constraints">
        {candidate.analysis.constraints.map((constraint) => <span className={constraint.blocking ? "blocking" : ""} key={constraint.code}>{constraint.blocking ? "!" : "i"} {constraint.code.replaceAll("_", " ")}</span>)}
      </div>
      <button type="button" onClick={onChoose} disabled={disabled}>Выбрать эту зону</button>
    </article>
  );
}

export default function ModelLabClient({ expertName }: { expertName: string }) {
  const [data, setData] = useState<LabCollection | null>(null);
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [pair, setPair] = useState<[Candidate, Candidate] | null>(null);
  const [status, setStatus] = useState<AlphaRankStatus | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const scenario = useMemo(() => scenarios.find((item) => item.id === scenarioId) ?? scenarios[0], [scenarioId]);

  const refreshPair = useCallback((collection = data, nextScenario = scenario) => {
    if (!collection) return;
    setPair(makePair(collection, nextScenario));
    setNote("");
  }, [data, scenario]);

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/model/current", { cache: "no-store" });
    if (response.ok) setStatus(await response.json() as AlphaRankStatus);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/data/agro-suitability.geojson").then((response) => response.json() as Promise<LabCollection>),
      fetch("/api/model/current", { cache: "no-store" }).then((response) => response.json() as Promise<AlphaRankStatus>),
    ]).then(([collection, modelStatus]) => {
      setData(collection);
      setStatus(modelStatus);
      setPair(makePair(collection, scenarios[0]));
    }).catch(() => setMessage("Не удалось загрузить данные для сравнения."));
  }, []);

  function changeScenario(id: string) {
    const next = scenarios.find((item) => item.id === id) ?? scenarios[0];
    setScenarioId(id);
    refreshPair(data, next);
  }

  async function submit(winner: "left" | "right") {
    if (!pair) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/model/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: scenario.profile.category,
        product: scenario.product,
        project: scenario.profile,
        left: { cellId: pair[0].cell.cell_id, features: featureVectorFromAnalysis(pair[0].analysis) },
        right: { cellId: pair[1].cell.cell_id, features: featureVectorFromAnalysis(pair[1].analysis) },
        winner,
        note,
      }),
    });
    const payload = await response.json() as { error?: string; labelCount?: number };
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Не удалось сохранить выбор.");
      return;
    }
    setStatus((current) => current ? { ...current, labelCount: payload.labelCount ?? current.labelCount } : current);
    setMessage("Выбор сохранён как подтверждённый обучающий пример.");
    refreshPair();
  }

  async function train() {
    setSaving(true);
    setMessage("Обучаем новую версию AlphaRank…");
    const response = await fetch("/api/model/train", { method: "POST" });
    const payload = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Обучение не удалось.");
      return;
    }
    await refreshStatus();
    setMessage("Новая версия AlphaRank обучена и включена для рекомендаций.");
  }

  const progress = status ? Math.min(100, status.labelCount / status.minimumLabels * 100) : 0;

  return (
    <main className="model-lab-shell">
      <header className="model-lab-header">
        <div><span className="model-lab-kicker">TURKISTAN INVEST · ALPHARANK</span><h1>Лаборатория обучения рекомендаций</h1><p>Эксперт: {expertName}</p></div>
        <Link href="/">← Вернуться на карту</Link>
      </header>

      <section className="lab-status">
        <div><span>Подтверждённые сравнения</span><strong>{status?.labelCount ?? 0} / {status?.minimumLabels ?? 40}</strong></div>
        <i><b style={{ width: `${progress}%` }} /></i>
        <p>{status?.model ? `Активна AlphaRank v${status.model.version} · точность проверки ${status.model.validationAccuracy}%` : "Сейчас карта использует резервную прозрачную формулу. После достаточного количества меток можно обучить первую собственную модель."}</p>
        <button type="button" disabled={saving || !status || status.labelCount < status.minimumLabels} onClick={train}>Обучить и включить новую версию</button>
      </section>

      <section className="lab-controls">
        <label><span>Сценарий проекта</span><select value={scenarioId} onChange={(event) => changeScenario(event.target.value)}>{scenarios.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        <label><span>Комментарий эксперта — необязательно</span><input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Например: здесь подтверждена вода или есть ограничение…" /></label>
      </section>

      <section className="lab-instruction"><strong>Какой участок вы бы проверили первым для проекта «{scenario.label}»?</strong><p>Сравнивайте инфраструктуру, профиль земли и ограничения. Итоговый балл намеренно скрыт, чтобы модель училась на вашем решении, а не повторяла старую формулу.</p></section>

      {pair ? <section className="lab-pair">
        <CandidateCard title="Зона A" candidate={pair[0]} onChoose={() => submit("left")} disabled={saving} />
        <div className="lab-versus">VS</div>
        <CandidateCard title="Зона B" candidate={pair[1]} onChoose={() => submit("right")} disabled={saving} />
      </section> : <div className="lab-loading">Загружаем пары зон…</div>}

      <div className="lab-footer-actions"><button type="button" onClick={() => refreshPair()} disabled={saving || !data}>Пропустить: недостаточно информации</button><span>{message}</span></div>
      <details className="lab-method"><summary>Какие признаки получает модель</summary><p>{ALPHA_RANK_FEATURES.join(" · ")}. Кадастровые и критические инфраструктурные ограничения остаются обязательными правилами и не отменяются обучением.</p></details>
    </main>
  );
}

