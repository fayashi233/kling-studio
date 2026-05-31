import type { AppSettings } from "@/types";

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callLLM(
  settings: AppSettings,
  messages: LLMMessage[]
): Promise<string> {
  let baseUrl = settings.llm_base_url || "https://api.openai.com/v1";
  let apiKey = settings.llm_api_key;
  let model = settings.llm_model || "gpt-4o-mini";

  if (settings.llm_provider === "claude") {
    baseUrl = settings.llm_base_url || "https://api.anthropic.com/v1";
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.8,
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

const SYSTEM_PROMPT_EN = `You are an expert at writing video generation prompts for Kling AI.
Your prompts should be detailed, descriptive, and follow best practices:
- Describe the scene, subjects, actions, camera movements, lighting, and mood
- Use cinematic terminology (e.g., "tracking shot", "shallow depth of field", "golden hour")
- Be specific about colors, textures, and spatial relationships
- Keep prompts under 500 characters for best results
- Output ONLY the prompt text, no explanations`;

const SYSTEM_PROMPT_ZH = `你是可灵AI视频生成提示词专家。
你的提示词应该详细、有画面感，并遵循以下最佳实践：
- 描述场景、主体、动作、镜头运动、光线和氛围
- 使用电影术语（如"跟踪镜头"、"浅景深"、"黄金时刻"）
- 具体描述颜色、质感和空间关系
- 提示词控制在500字符以内效果最佳
- 只输出提示词文本，不要解释`;

function getSystemPrompt(lang: string): string {
  return lang === "zh" ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN;
}

export async function expandPrompt(
  settings: AppSettings,
  description: string,
  lang: string = "en"
): Promise<string> {
  const sys = getSystemPrompt(lang);
  const userMsg = lang === "zh"
    ? `将以下简短描述扩展为详细的可灵AI视频提示词：\n\n"${description}"`
    : `Expand this brief description into a detailed Kling AI video prompt:\n\n"${description}"`;

  return callLLM(settings, [
    { role: "system", content: sys },
    { role: "user", content: userMsg },
  ]);
}

export async function optimizePrompt(
  settings: AppSettings,
  prompt: string,
  lang: string = "en"
): Promise<string> {
  const sys = getSystemPrompt(lang);
  const userMsg = lang === "zh"
    ? `优化并改进以下可灵AI视频提示词，使其效果更好：\n\n"${prompt}"`
    : `Optimize and improve this Kling AI video prompt for better results:\n\n"${prompt}"`;

  return callLLM(settings, [
    { role: "system", content: sys },
    { role: "user", content: userMsg },
  ]);
}

export async function generateVariants(
  settings: AppSettings,
  prompt: string,
  count: number,
  lang: string = "en"
): Promise<string[]> {
  const sys = getSystemPrompt(lang);
  const userMsg = lang === "zh"
    ? `基于以下提示词生成${count}个不同变体，每个在风格、镜头或氛围上有所区别。每行一个，用数字编号：\n\n"${prompt}"`
    : `Generate ${count} different variants of this Kling AI video prompt. Each should be distinct in style, camera angle, or mood. Return each variant on a new line, numbered:\n\n"${prompt}"`;

  const result = await callLLM(settings, [
    { role: "system", content: sys },
    { role: "user", content: userMsg },
  ]);

  return result
    .split("\n")
    .map((line: string) => line.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((line: string) => line.length > 0);
}
