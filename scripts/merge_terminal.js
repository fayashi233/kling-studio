const fs = require("fs");
const path = require("path");

const BASE = "D:/0 北交/0科研-学习myself/场景生成2026.5.25/kling-视频/vehicle view/terminal/people";
const SUBDIRS = ["6.5-进出站", "6.9进出站-人-text", "6.9进出站-人-首尾"];
const TMP = BASE + "_tmp";

if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
fs.mkdirSync(TMP);

// 1. 收集所有文件
function collectAll(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      results.push(...collectAll(full));
    } else if (f.endsWith(".mp4") || f.endsWith(".txt")) {
      results.push({ name: f, path: full, dir: dir });
    }
  }
  return results;
}

const allFiles = collectAll(BASE);
console.log("总文件数:", allFiles.length);

// 2. 全部移到临时目录
for (const f of allFiles) {
  const dest = path.join(TMP, f.name);
  if (fs.existsSync(dest)) {
    // 去重
    const ext = path.extname(f.name);
    const base = path.basename(f.name, ext);
    fs.renameSync(f.path, path.join(TMP, base + "_dup" + ext));
  } else {
    fs.renameSync(f.path, dest);
  }
}

// 3. 删除空子目录
for (const sd of SUBDIRS) {
  const sdp = path.join(BASE, sd);
  if (fs.existsSync(sdp)) fs.rmSync(sdp, { recursive: true });
}

// 4. 重新编号
const tmpFiles = fs.readdirSync(TMP).sort();

// 配对: 每个video找对应的txt
const videos = tmpFiles.filter(f => f.endsWith(".mp4"));
const txts = tmpFiles.filter(f => f.endsWith(".txt"));

// 提取视频的纯文件名（去掉序号前缀）
function getBaseName(f) {
  return f.replace(/^\d+_/, "");
}

// 为每个video找到对应的info txt
const pairs = [];
const usedTxts = new Set();

for (const v of videos) {
  const vBase = getBaseName(v).replace(".mp4", "");
  // 找对应的txt
  let txt = null;
  for (const t of txts) {
    if (usedTxts.has(t)) continue;
    const tBase = getBaseName(t).replace("_信息.txt", "").replace(".txt", "");
    if (tBase === vBase || vBase.includes(tBase) || tBase.includes(vBase)) {
      txt = t;
      usedTxts.add(t);
      break;
    }
  }
  pairs.push({ video: v, txt });
}

// 编号
let idx = 0;
for (const p of pairs) {
  idx++;
  const num = String(idx).padStart(2, "0");
  // 移动video
  const vExt = path.extname(p.video);
  const newVid = num + "_video" + vExt;
  fs.renameSync(path.join(TMP, p.video), path.join(BASE, newVid));

  // 移动/创建txt
  if (p.txt) {
    const newTxt = num + "_信息.txt";
    fs.renameSync(path.join(TMP, p.txt), path.join(BASE, newTxt));
  }
  console.log(num + " ← " + p.video);
}

// 5. 清理
if (fs.existsSync(TMP)) {
  const leftover = fs.readdirSync(TMP);
  if (leftover.length > 0) {
    console.log("剩余未处理文件:", leftover);
  }
  fs.rmSync(TMP, { recursive: true });
}

console.log("\n完成! " + idx + " 个视频已重新编号到 " + BASE);
