import type { ChatGPTUser } from "../app/chatgpt-auth";

export function modelExpertEmails() {
  return (process.env.MODEL_EXPERT_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isModelExpert(user: ChatGPTUser | null) {
  if (!user) return false;
  const allowed = modelExpertEmails();
  return allowed.length > 0 && allowed.includes(user.email.toLowerCase());
}

