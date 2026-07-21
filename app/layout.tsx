import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Turkistan Invest — AI-карта возможностей";
const description = "Выберите проект и найдите подходящие зоны в Туркестанской области по спутниковым данным, электричеству, воде, логистике и понятной ИИ-оценке.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og-v2.png`;

  return {
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "Turkistan Invest — AI-карта лучших зон для инвестиционного проекта" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
