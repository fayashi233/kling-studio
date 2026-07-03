/**
 * 下载/复制所有生成视频并分类整理
 *
 * 目标目录结构:
 *   所有视频/
 *     └── [group_name]/
 *         └── [prompt_id前8位]/
 *             ├── 01_任务摘要.txt        (包含prompt、model、时间等)
 *             ├── 01_video.mp4
 *             ├── 02_任务摘要.txt
 *             ├── 02_video.mp4
 *             └── ...
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");

// ─── 路径配置 ───
const PROJECT_DIR = __dirname.includes("scripts")
  ? path.resolve(__dirname, "..")
  : process.cwd();
const DB_PATH = path.join(PROJECT_DIR, "data", "kling.db");
const LOCAL_VIDEOS_DIR = path.join(PROJECT_DIR, "public", "videos");
const TARGET_ROOT = "D:/0 北交/0科研-学习myself/场景生成2026.5.25/kling-视频/所有视频";

// ─── 工具函数 ───
function safeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .substring(0, 80);
}

function formatDateTime(dt) {
  return dt ? dt.replace(" ", "_").replace(/:/g, "-") : "unknown";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── 下载外部URL ───
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);
    protocol
      .get(url, { timeout: 120000 }, (res) => {
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(destPath);
          downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(true);
        });
      })
      .on("error", (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        reject(err);
      })
      .on("timeout", () => {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        reject(new Error("Download timeout"));
      });
  });
}

// ─── 主流程 ───
async function main() {
  console.log("═".repeat(60));
  console.log("  可灵视频下载整理脚本");
  console.log("═".repeat(60));
  console.log(`数据库: ${DB_PATH}`);
  console.log(`本地视频目录: ${LOCAL_VIDEOS_DIR}`);
  console.log(`目标目录: ${TARGET_ROOT}`);
  console.log();

  const db = new Database(DB_PATH, { readonly: true });

  // 查询所有成功且有视频链接的版本
  const versions = db.prepare(`
    SELECT
      pv.id, pv.prompt_id, pv.parent_id, pv.prompt,
      pv.video_url, pv.task_status, pv.model_name,
      pv.mode, pv.duration, pv.aspect_ratio, pv.cfg_scale,
      pv.reference_image, pv.negative_prompt, pv.created_at,
      p.group_name, p.prompt as prompt_original,
      g.quality, g.reject_reason
    FROM prompt_versions pv
    LEFT JOIN prompts p ON p.id = pv.prompt_id
    LEFT JOIN generations g ON g.task_id = pv.task_id
    WHERE pv.task_status = 'succeed' AND pv.video_url IS NOT NULL
    ORDER BY p.group_name, pv.prompt_id, pv.created_at
  `).all();

  console.log(`找到 ${versions.length} 个成功生成的视频\n`);

  // 按 group_name -> prompt_id 分组
  const groups = {};
  for (const v of versions) {
    const groupName = v.group_name || "未分组";
    if (!groups[groupName]) groups[groupName] = {};
    if (!groups[groupName][v.prompt_id]) groups[groupName][v.prompt_id] = [];
    groups[groupName][v.prompt_id].push(v);
  }

  let totalCopied = 0;
  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // 遍历每个分组
  for (const [groupName, promptGroups] of Object.entries(groups)) {
    const groupDir = path.join(TARGET_ROOT, safeFilename(groupName));
    fs.mkdirSync(groupDir, { recursive: true });

    console.log(`📁 ${groupName}/`);

    for (const [promptId, vers] of Object.entries(promptGroups)) {
      const shortId = promptId.substring(0, 8);
      const promptDir = path.join(groupDir, safeFilename(shortId));
      fs.mkdirSync(promptDir, { recursive: true });

      // 写一个组内总览文件
      const overviewLines = [
        `prompt_id: ${promptId}`,
        `group_name: ${groupName}`,
        `原始场景描述:`,
        `${(vers[0].prompt_original || vers[0].prompt || "").substring(0, 500)}`,
        "",
        `共 ${vers.length} 个版本:`,
      ];
      for (let i = 0; i < vers.length; i++) {
        const v = vers[i];
        overviewLines.push(
          `  ${String(i + 1).padStart(2, "0")}. ${formatDateTime(v.created_at)} | ${v.model_name || "?"} | ${v.duration || "?"}s | ${v.mode || "?"}`
        );
      }
      fs.writeFileSync(path.join(promptDir, "_场景总览.txt"), overviewLines.join("\n"), "utf-8");

      // 处理每个版本
      for (let i = 0; i < vers.length; i++) {
        const v = vers[i];
        const idx = String(i + 1).padStart(2, "0");

        const videoExt = ".mp4";
        const videoBase = `${idx}_video`;

        // 扩展名检测（处理外部URL可能有不同扩展名）
        const extMatch = v.video_url.match(/\.(mp4|mov|webm|avi)(\?|$)/);
        const ext = extMatch ? `.${extMatch[1]}` : videoExt;

        const videoFilename = `${idx}_video${ext}`;
        const promptFilename = `${idx}_信息.txt`;
        const videoPath = path.join(promptDir, videoFilename);
        const promptPath = path.join(promptDir, promptFilename);

        // 写提示词文件
        const infoLines = [
          `序号: ${idx}`,
          `版本ID: ${v.id}`,
          `生成时间: ${v.created_at}`,
          `模型: ${v.model_name || "未知"}`,
          `模式: ${v.mode || "未知"}`,
          `时长: ${v.duration || "?"}秒`,
          `画面比例: ${v.aspect_ratio || "?"}`,
          `CFG Scale: ${v.cfg_scale ?? "?"}`,
          `视频状态: ${v.task_status}`,
          v.reference_image ? `参考图: ${v.reference_image}` : "",
          v.quality ? `质量标记: ${v.quality}` : "",
          v.reject_reason ? `拒绝原因: ${v.reject_reason}` : "",
          "",
          "═".repeat(40),
          "  提示词 (当前版本):",
          "═".repeat(40),
          v.prompt || "",
          "",
          v.negative_prompt
            ? [
                "═".repeat(40),
                "  反向提示词:",
                "═".repeat(40),
                v.negative_prompt,
              ].join("\n")
            : "",
        ].join("\n");
        fs.writeFileSync(promptPath, infoLines, "utf-8");

        // 处理视频文件
        try {
          if (v.video_url.startsWith("/videos/")) {
            // 本地文件 - 复制
            const videoName = path.basename(v.video_url);
            const srcPath = path.join(LOCAL_VIDEOS_DIR, videoName);

            if (fs.existsSync(srcPath)) {
              if (!fs.existsSync(videoPath)) {
                fs.copyFileSync(srcPath, videoPath);
                totalCopied++;
                console.log(`   ✅ ${groupName}/${shortId}/${videoFilename} (复制)`);
              } else {
                totalSkipped++;
                console.log(`   ⏭  ${groupName}/${shortId}/${videoFilename} (已存在)`);
              }
            } else {
              totalErrors++;
              console.log(`   ❌ ${groupName}/${shortId}/${videoFilename} (本地文件缺失: ${videoName})`);
            }
          } else if (v.video_url.startsWith("http")) {
            // 外部URL - 下载
            if (!fs.existsSync(videoPath)) {
              console.log(`   ⬇  ${groupName}/${shortId}/${videoFilename} (下载中...)`);
              await downloadFile(v.video_url, videoPath);
              totalDownloaded++;
              console.log(`   ✅ ${groupName}/${shortId}/${videoFilename} (下载完成, ${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)}MB)`);
              await sleep(500); // 避免请求过快
            } else {
              totalSkipped++;
              console.log(`   ⏭  ${groupName}/${shortId}/${videoFilename} (已存在)`);
            }
          } else {
            totalErrors++;
            console.log(`   ❌ ${groupName}/${shortId}/${videoFilename} (无法处理的URL: ${v.video_url.substring(0, 60)})`);
          }
        } catch (err) {
          totalErrors++;
          console.log(`   ❌ ${groupName}/${shortId}/${videoFilename} (错误: ${err.message})`);
        }
      }
    }
    console.log();
  }

  db.close();

  console.log("═".repeat(60));
  console.log("  处理完成!");
  console.log("═".repeat(60));
  console.log(`  复制本地视频: ${totalCopied} 个`);
  console.log(`  下载外部视频: ${totalDownloaded} 个`);
  console.log(`  跳过(已存在): ${totalSkipped} 个`);
  console.log(`  错误: ${totalErrors} 个`);
  console.log(`  总计: ${totalCopied + totalDownloaded + totalSkipped + totalErrors} / ${versions.length}`);
  console.log();
  console.log(`  输出目录: ${TARGET_ROOT}`);
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
