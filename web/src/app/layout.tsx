import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
  weight: ["400", "500", "600", "700"],
});

const SITE_URL = "https://pipelinescore.ai";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PipelineScore — How does your LLM actually rank?",
    template: "%s · PipelineScore",
  },
  description:
    "User-run LLM benchmarking. Run 34 deterministic tasks against any model on your own hardware — no judge model, no API key for local runs — and get a 0–100 score, tier badge, and a place on the public hardware-aware leaderboard.",
  applicationName: "PipelineScore",
  keywords: [
    "LLM benchmark",
    "AI model leaderboard",
    "Claude vs GPT",
    "user benchmark",
    "language model ranking",
    "PipelineScore",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "PipelineScore",
    title: "PipelineScore — How does your LLM actually rank?",
    description:
      "Run a 34-task deterministic benchmark on your own hardware — no API key needed for local models. Get a score, tier badge, and a place on the public leaderboard.",
    images: [{ url: "/hero.jpg", width: 1920, height: 1080, alt: "PipelineScore" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PipelineScore — User-run LLM benchmarking",
    description:
      "The cpu.userbenchmark for LLMs. Run any model on your rig, get a deterministic score, place on the public board.",
    images: ["/hero.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${bricolage.variable} ${jetbrains.variable}`}>
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
