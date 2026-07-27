import { getChatGPTUser } from "../../../chatgpt-auth";
import { isModelExpert } from "../../../../lib/model-auth";
import { trainAndActivateAlphaRank } from "../../../../lib/model-service";

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT to train the model." }, { status: 401 });
  if (!isModelExpert(user)) return Response.json({ error: "This account is not on the model-expert allowlist." }, { status: 403 });

  try {
    return Response.json({ ok: true, model: await trainAndActivateAlphaRank(user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model training failed";
    return Response.json({ error: message }, { status: message.startsWith("Need at least") ? 409 : 503 });
  }
}

