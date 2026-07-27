import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import { isModelExpert } from "../../lib/model-auth";
import ModelLabClient from "./model-lab-client";

export const dynamic = "force-dynamic";

async function ExpertWorkspace() {
  const user = await requireChatGPTUser("/model-lab");
  if (!isModelExpert(user)) {
    return (
      <main className="model-lab-gate">
        <div>
          <span className="model-lab-kicker">ALPHARANK</span>
          <h1>Доступ только для экспертов проекта</h1>
          <p>Аккаунт {user.email} успешно вошёл, но ещё не добавлен в список экспертов, чьи решения можно использовать для обучения.</p>
          <Link href="/">Вернуться на карту</Link>
        </div>
      </main>
    );
  }
  return <ModelLabClient expertName={user.displayName} />;
}

export default function ModelLabPage() {
  return <ExpertWorkspace />;
}

