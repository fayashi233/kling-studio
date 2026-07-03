const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const BASE = "D:/0 北交/0科研-学习myself/场景生成2026.5.25/kling-视频/vehicle view";
const OLD = path.join(BASE, "站台进出站");
const NEW_JZ = path.join(BASE, "进出站");
const NEW_PF = path.join(BASE, "站台");
const PROJECT = "D:/0 北交/0科研-学习myself/场景生成2026.5.25/github/kling-studio";

function classifyStationSub(prompt) {
  const p = prompt || "";
  if (p.includes("过渡段") || p.includes("驶向车站") || p.includes("减速进站") ||
      p.includes("跳下站台") || p.includes("走下站台") || p.includes("横跨轨道") ||
      p.includes("横穿轨道") || p.includes("沿楼梯走下") || p.includes("维修设备") ||
      p.includes("起火点") || p.includes("进出站") || p.includes("区间驶向")) {
    return "进出站";
  }
  if (p.includes("站台区域") || p.includes("站场区域") || p.includes("火车站站台") ||
      (p.includes("站台") && !p.includes("跳下") && !p.includes("走下"))) {
    return "站台";
  }
  return "进出站";
}

const db = new Database(path.join(PROJECT, "data", "kling.db"), { readonly: true });
const versions = db.prepare("SELECT pv.* FROM prompt_versions pv WHERE pv.task_status = 'succeed' AND pv.video_url IS NOT NULL").all();

// video_id → 站台/进出站
const videoClass = new Map();
for (const v of versions) {
  const videoName = path.basename(v.video_url || "").replace(".mp4", "");
  videoClass.set(videoName, classifyStationSub(v.prompt));
}

if (!fs.existsSync(OLD)) { console.log("站台进出站 不存在"); process.exit(1); }

// 遍历 intrusion 子目录
const intrusions = fs.readdirSync(OLD).filter(f => fs.statSync(path.join(OLD, f)).isDirectory());
console.log("intrusion 子目录:", intrusions.join(", "));

for (const intr of intrusions) {
  const intrDir = path.join(OLD, intr);
  const videos = fs.readdirSync(intrDir).filter(f => f.endsWith(".mp4"));

  for (const v of videos) {
    const videoId = v.match(/_(\d+)\.mp4$/)?.[1] || "";
    const sub = videoClass.get(videoId) || "进出站";
    const targetDir = sub === "站台" ? path.join(NEW_PF, intr) : path.join(NEW_JZ, intr);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(path.join(intrDir, v), path.join(targetDir, v));

    // 复制txt
    const num = v.match(/^(\d+)_/)?.[1];
    if (num) {
      const txtName = num + "_信息.txt";
      const txtPath = path.join(intrDir, txtName);
      if (fs.existsSync(txtPath)) {
        fs.copyFileSync(txtPath, path.join(targetDir, txtName));
      }
    }
  }
}

// 删除旧文件夹
fs.rmSync(OLD, { recursive: true });

// 重新编号两个新文件夹的每个intrusion子目录
function renumberIntrusion(dir) {
  if (!fs.existsSync(dir)) return;
  for (const intr of fs.readdirSync(dir)) {
    const intrDir = path.join(dir, intr);
    if (!fs.statSync(intrDir).isDirectory()) continue;
    const videos = fs.readdirSync(intrDir).filter(f => f.endsWith(".mp4")).sort();
    const txts = fs.readdirSync(intrDir).filter(f => f.endsWith(".txt"));
    const TMP = intrDir + "_tmp";
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
    fs.mkdirSync(TMP);

    // 移走所有文件
    for (const f of [...videos, ...txts]) {
      fs.renameSync(path.join(intrDir, f), path.join(TMP, f));
    }

    // 重新编号
    const tmpMp4s = fs.readdirSync(TMP).filter(f => f.endsWith(".mp4")).sort();
    const tmpTxts = fs.readdirSync(TMP).filter(f => f.endsWith(".txt"));
    const usedTxts = new Set();

    let idx = 0;
    for (const m of tmpMp4s) {
      idx++;
      const num = String(idx).padStart(2, "0");
      const mNum = m.match(/^(\d+)_/)?.[1];
      const videoId = m.replace(/^\d+_/, "").replace(".mp4", "");
      const ext = path.extname(m);
      fs.renameSync(path.join(TMP, m), path.join(intrDir, num + "_" + videoId + ext));

      let txtFile = null;
      for (const t of tmpTxts) {
        if (usedTxts.has(t)) continue;
        if (t.match(/^(\d+)_/)?.[1] === mNum) { txtFile = t; usedTxts.add(t); break; }
      }
      if (txtFile) {
        fs.renameSync(path.join(TMP, txtFile), path.join(intrDir, num + "_信息.txt"));
      }
    }
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
    console.log("  " + path.basename(dir) + "/" + intr + ": " + idx + " videos ✓");
  }
}

console.log("\n进出站:");
renumberIntrusion(NEW_JZ);
console.log("站台:");
renumberIntrusion(NEW_PF);

db.close();
console.log("\n完成!");
