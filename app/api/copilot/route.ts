import { NextResponse } from "next/server";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1-mini";

const ALLOWED_TOOLS = [
  "query_convex_health",
  "query_convex_signals",
  "read_model_lab",
  "rank_feature_importance",
  "read_backtest_summary",
  "compare_risk_modes",
  "inspect_optimizer_scenario",
  "read_battery_twin",
  "summarize_dispatch",
  "inspect_quantile_band",
  "read_twin_confidence",
  "compose_pitch_summary",
  "query_convex_context",
];

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.slice(0, 1200) : "";
  const context = body?.context ?? {};
  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are Prometheus Copilot inside a Greek battery optimization cockpit.",
            "Answer only from the provided cockpit context. Do not invent unseen telemetry, market feeds, or model results.",
            "Be concise, technically credible, and clear for mixed VC and power-market engineer judges.",
            "If data is context-only rather than full-history model input, say so explicitly.",
            `Return JSON with keys: answer string, tools_used array. tools_used must be chosen from: ${ALLOWED_TOOLS.join(", ")}.`,
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({ question: prompt, cockpit_context: context }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return NextResponse.json(
      { error: "OpenAI request failed", detail: errorText.slice(0, 500) },
      { status: 502 },
    );
  }

  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  const parsed = parseModelJson(raw);
  return NextResponse.json({
    answer: parsed.answer,
    tools_used: parsed.tools_used.filter((tool) => ALLOWED_TOOLS.includes(tool)),
    model: payload?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
  });
}

function parseModelJson(raw: unknown): { answer: string; tools_used: string[] } {
  if (typeof raw !== "string") {
    return { answer: "The model returned an empty response.", tools_used: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      answer: typeof parsed.answer === "string" ? parsed.answer : raw,
      tools_used: Array.isArray(parsed.tools_used)
        ? parsed.tools_used.filter((item: unknown): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return { answer: raw, tools_used: [] };
  }
}
