/**
 * 按视角 + 侵限类型 + 场景环境 重新整理视频
 *
 * vehicle view → [intrusion] → [scene] → [group] → videos
 *   scene: tunnel / bridge / station / forest / section / construction
 * wayside view → [intrusion] → [group] → videos
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const PROJECT_DIR = __dirname.includes("scripts") ? path.resolve(__dirname, "..") : process.cwd();
const DB_PATH = path.join(PROJECT_DIR, "data", "kling.db");
const LOCAL_VIDEOS_DIR = path.join(PROJECT_DIR, "public", "videos");
const BASE_DIR = "D:/0 北交/0科研-学习myself/场景生成2026.5.25/kling-视频";

function safeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_").replace(/[\r\n]+/g, " ").trim().substring(0, 80);
}

function classifyView(prompt) {
  const p = (prompt || "").toLowerCase();
  if (p.includes("前向视角") || p.includes("第一人称") || p.includes("车载视角") || p.includes("列车前向")) {
    return "vehicle view";
  }
  if (p.includes("轨旁") || p.includes("监控") || p.includes("固定监控") || p.includes("安防")) {
    return "wayside view";
  }
  return "other";
}

function classifyIntrusion(prompt) {
  const p = prompt || "";
  if (p.includes("牛")) return "cow";
  if (p.includes("树木倒落") || p.includes("树倒落") || (p.includes("树") && p.includes("倒"))) return "tree";
  if (p.includes("火灾") || p.includes("灌木火灾") || p.includes("起火") || (p.includes("火") && p.includes("燃烧"))) return "fire";
  if (p.includes("石块") || p.includes("落石") || p.includes("岩石") || p.includes("花岗岩")) return "rock";
  if (p.includes("箱子")) return "box";
  if (p.includes("行人") || p.includes("工人") || p.includes("乘客")) return "people";
  if (p.includes("施工")) return "construction";
  return "other";
}

// 场景环境分类（仅 vehicle view 使用）
const SCENE_LABELS = {
  tunnel: "隧道口",
  bridge: "桥涵",
  station: "站台进出站",
  forest: "植被林区",
  section: "露天区间",
  construction: "施工区",
  other: "其他",
};

function classifyScene(prompt) {
  const p = prompt || "";
  if (p.includes("隧道")) return "tunnel";
  if (p.includes("桥梁") || p.includes("桥涵")) return "bridge";
  if (p.includes("站台") || p.includes("站场") || p.includes("进站") || p.includes("出站") || p.includes("车站")) return "station";
  if (p.includes("阔叶林") || p.includes("树木") || p.includes("树林") || p.includes("森林") || p.includes("茂密") || p.includes("植被")) return "forest";
  if (p.includes("隔音墙") || p.includes("声屏障") || p.includes("施工")) return "construction";
  if (p.includes("区间") || p.includes("直线段") || p.includes("露天铁路") || p.includes("山区") || p.includes("岩壁")) return "section";
  // 轨旁场景默认归类为露天区间
  if (p.includes("轨旁") || p.includes("铁路")) return "section";
  return "other";
}

async function main() {
  // 清空旧的 view 文件夹
  for (const dir of ["vehicle view", "wayside view", "other"]) {
    const p = path.join(BASE_DIR, dir);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true });
  }

  const db = new Database(DB_PATH, { readonly: true });
  const versions = db.prepare(`
    SELECT pv.*, p.group_name, g.quality, g.reject_reason
    FROM prompt_versions pv
    LEFT JOIN prompts p ON p.id = pv.prompt_id
    LEFT JOIN generations g ON g.task_id = pv.task_id
    WHERE pv.task_status = 'succeed' AND pv.video_url IS NOT NULL
    ORDER BY p.group_name, pv.prompt_id, pv.created_at
  `).all();

  const stats = {};
  let copied = 0, skipped = 0, errors = 0;

  for (const v of versions) {
    const view = classifyView(v.prompt);
    const intrusion = classifyIntrusion(v.prompt);
    const scene = classifyScene(v.prompt);
    const sceneLabel = SCENE_LABELS[scene] || scene;
    const groupName = v.group_name || "未分组";
    const shortId = v.prompt_id.substring(0, 8);

    // vehicle view & wayside view: view / scene / intrusion / group / prompt
    // other: view / intrusion / group / prompt
    const targetDir = (view === "vehicle view" || view === "wayside view")
      ? path.join(BASE_DIR, view, sceneLabel, intrusion, safeFilename(groupName), safeFilename(shortId))
      : path.join(BASE_DIR, view, intrusion, safeFilename(groupName), safeFilename(shortId));
    fs.mkdirSync(targetDir, { recursive: true });

    const key = view + (view !== "other" ? "/" + sceneLabel + "/" + intrusion : "/" + intrusion);
    if (!stats[key]) stats[key] = { videos: 0, scenes: new Set() };
    stats[key].videos++;
    stats[key].scenes.add(v.prompt_id);

    const existingVideos = fs.readdirSync(targetDir).filter(f => f.endsWith(".mp4"));
    const idx = String(existingVideos.length + 1).padStart(2, "0");

    const videoName = path.basename(v.video_url);
    const videoPath = path.join(targetDir, idx + "_" + videoName);
    const infoPath = path.join(targetDir, idx + "_信息.txt");

    // 信息文件
    const info = [
      `序号: ${idx}`,
      `视角: ${view}`,
      `侵限类型: ${intrusion}`,
      `场景环境: ${view !== "other" ? sceneLabel : "-"}`,
      `prompt_id: ${v.prompt_id}`,
      `版本ID: ${v.id}`,
      `分组: ${groupName}`,
      `生成时间: ${v.created_at}`,
      `模型: ${v.model_name || "?"}  |  模式: ${v.mode || "?"}  |  时长: ${v.duration || "?"}s  |  比例: ${v.aspect_ratio || "?"}`,
      v.reference_image ? `参考图: ${v.reference_image}` : "",
      "",
      "═".repeat(50),
      "  提示词:",
      "═".repeat(50),
      v.prompt || "",
      v.negative_prompt ? "\n" + "═".repeat(50) + "\n  反向提示词:\n" + "═".repeat(50) + "\n" + v.negative_prompt : "",
    ].join("\n");
    fs.writeFileSync(infoPath, info, "utf-8");

    // 复制视频
    try {
      if (v.video_url.startsWith("/videos/")) {
        const srcPath = path.join(LOCAL_VIDEOS_DIR, videoName);
        if (fs.existsSync(srcPath)) {
          if (!fs.existsSync(videoPath)) { fs.copyFileSync(srcPath, videoPath); copied++; }
          else { skipped++; }
        } else { errors++; console.log("❌ 缺失: " + videoName); }
      } else {
        errors++; console.log("⚠ 外链跳过: " + view + "/" + intrusion);
      }
    } catch (e) { errors++; }
  }

  db.close();

  console.log("\n" + "═".repeat(55));
  console.log("  按视角 + 侵限类型整理完成");
  console.log("═".repeat(55));
  for (const [key, s] of Object.entries(stats).sort()) {
    console.log("  " + key + ": " + s.videos + " videos, " + s.scenes.size + " scenes");
  }
  console.log("  复制: " + copied + "  跳过: " + skipped + "  错误: " + errors);
  console.log("\n  输出: " + BASE_DIR);
  console.log("═".repeat(55));
}

main().catch(e => { console.error(e); process.exit(1); });
