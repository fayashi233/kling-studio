/**
 * 按视角分类重新整理视频
 *
 * vehicle view: 前向视角/第一人称/车载视角/列车前向
 * wayside view: 轨旁视角/监控视角/站台固定机位
 *
 * 目标结构:
 *   kling-视频/
 *     ├── vehicle view/
 *     │   └── [group_name]/
 *     │       └── [prompt_id前8位]/
 *     │           ├── 01_video.mp4 + 01_信息.txt
 *     │           └── ...
 *     └── wayside view/
 *         └── ...
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const PROJECT_DIR = __dirname.includes("scripts")
  ? path.resolve(__dirname, "..")
  : process.cwd();
const DB_PATH = path.join(PROJECT_DIR, "data", "kling.db");
const LOCAL_VIDEOS_DIR = path.join(PROJECT_DIR, "public", "videos");
const BASE_DIR = "D:/0 北交/0科研-学习myself/场景生成2026.5.25/kling-视频";

function safeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .substring(0, 80);
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

async function main() {
  const db = new Database(DB_PATH, { readonly: true });

  const versions = db.prepare(`
    SELECT pv.*, p.group_name, g.quality, g.reject_reason
    FROM prompt_versions pv
    LEFT JOIN prompts p ON p.id = pv.prompt_id
    LEFT JOIN generations g ON g.task_id = pv.task_id
    WHERE pv.task_status = 'succeed' AND pv.video_url IS NOT NULL
    ORDER BY p.group_name, pv.prompt_id, pv.created_at
  `).all();

  console.log(`共 ${versions.length} 个视频，开始按视角分类整理...\n`);

  let totalCopied = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const stats = {};

  for (const v of versions) {
    const view = classifyView(v.prompt);
    if (!stats[view]) stats[view] = 0;
    stats[view]++;

    const groupName = v.group_name || "未分组";
    const shortId = v.prompt_id.substring(0, 8);

    const targetDir = path.join(BASE_DIR, view, safeFilename(groupName), safeFilename(shortId));
    fs.mkdirSync(targetDir, { recursive: true });

    // 计算该 prompt_id 下的序号
    const existingVideos = fs.readdirSync(targetDir).filter(f => f.endsWith(".mp4"));
    const idx = String(existingVideos.length + 1).padStart(2, "0");

    const videoName = path.basename(v.video_url);
    const videoPath = path.join(targetDir, `${idx}_${videoName}`);
    const infoPath = path.join(targetDir, `${idx}_信息.txt`);

    // 写信息文件
    const infoLines = [
      `序号: ${idx}`,
      `prompt_id: ${v.prompt_id}`,
      `版本ID: ${v.id}`,
      `分组: ${groupName}`,
      `生成时间: ${v.created_at}`,
      `模型: ${v.model_name || "未知"}`,
      `模式: ${v.mode || "未知"}`,
      `时长: ${v.duration || "?"}秒`,
      `画面比例: ${v.aspect_ratio || "?"}`,
      `CFG Scale: ${v.cfg_scale ?? "?"}`,
      v.reference_image ? `参考图: ${v.reference_image}` : "",
      "",
      "════════════════════════════════════════",
      "  提示词:",
      "════════════════════════════════════════",
      v.prompt || "",
      "",
      v.negative_prompt ? "════════════════════════════════════════\n  反向提示词:\n" + "═".repeat(40) + "\n" + v.negative_prompt : "",
    ].join("\n");
    fs.writeFileSync(infoPath, infoLines, "utf-8");

    // 复制视频
    try {
      if (v.video_url.startsWith("/videos/")) {
        const srcPath = path.join(LOCAL_VIDEOS_DIR, videoName);
        if (fs.existsSync(srcPath)) {
          if (!fs.existsSync(videoPath)) {
            fs.copyFileSync(srcPath, videoPath);
            totalCopied++;
          } else {
            totalSkipped++;
          }
        } else {
          totalErrors++;
          console.log(`❌ 本地文件缺失: ${videoName} (${view}/${groupName}/${shortId})`);
        }
      } else {
        // 外部链接 - 跳过(之前已尝试下载过)
        totalErrors++;
        console.log(`⚠ 外部链接跳过: ${view}/${groupName}/${shortId}`);
      }
    } catch (err) {
      totalErrors++;
      console.log(`❌ 错误: ${err.message}`);
    }
  }

  db.close();

  console.log("\n" + "═".repeat(60));
  console.log("  按视角分类整理完成!");
  console.log("═".repeat(60));
  for (const [view, count] of Object.entries(stats)) {
    console.log(`  ${view}: ${count} 个视频`);
  }
  console.log(`  复制成功: ${totalCopied} 个`);
  console.log(`  跳过(已存在): ${totalSkipped} 个`);
  console.log(`  错误: ${totalErrors} 个`);
  console.log(`\n  输出目录: ${BASE_DIR}/`);
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
