import { NextRequest, NextResponse } from "next/server";
import { generateToken } from "@/lib/kling";
import type { AppSettings, ProviderId } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const settings: AppSettings = await req.json();
    const provider: ProviderId = settings.provider || "kling-official";

    if (provider === "dashscope") {
      // Test DashScope connection
      if (!settings.dashscope_api_key) {
        return NextResponse.json({ ok: false, message: "请输入百炼 API Key" });
      }
      const base = settings.dashscope_base_url || "https://dashscope.aliyuncs.com/api/v1";
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${settings.dashscope_api_key}` },
      });
      if (res.ok) {
        return NextResponse.json({ ok: true, message: "百炼 API 连接成功" });
      }
      const text = await res.text();
      return NextResponse.json({ ok: false, message: `连接失败 (${res.status}): ${text.substring(0, 200)}` });

    } else {
      // Test Kling official connection
      if (!settings.kling_access_key || !settings.kling_secret_key) {
        return NextResponse.json({ ok: false, message: "请输入 Access Key 和 Secret Key" });
      }
      try {
        const token = generateToken(settings.kling_access_key, settings.kling_secret_key);
        // Try a simple API call to verify the token
        const res = await fetch("https://api-beijing.klingai.com/v1/videos/text2video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            model_name: "kling-v2-master",
            prompt: "test",
            mode: "std",
            duration: "5",
            aspect_ratio: "16:9",
          }),
        });
        const data = await res.json();
        if (data.data?.task_id || res.status === 200) {
          return NextResponse.json({ ok: true, message: "可灵 API 连接成功" });
        }
        const errMsg = data.message || data.code || "未知错误";
        const hint = res.status === 401 ? " — 请检查 AK/SK 是否正确、是否已过期" : "";
        return NextResponse.json({ ok: false, message: `验证失败: ${errMsg}${hint}` });
      } catch (err) {
        return NextResponse.json({ ok: false, message: `JWT 签名失败: ${(err as Error).message}` });
      }
    }
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, message: `测试失败: ${err instanceof Error ? err.message : "未知错误"}` });
  }
}
