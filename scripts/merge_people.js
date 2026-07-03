const fs = require("fs");
const path = require("path");

const BASE = "D:/0 北交/0科研-学习myself/场景生成2026.5.25/kling-视频/vehicle view/站台进出站/people";
const TARGETS = ["6.5-进出站", "6.9进出站-人-text", "6.9进出站-人-首尾"];
const TMP = BASE + "_tmp";

// 清理
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
fs.mkdirSync(TMP);

// 1. 收集所有 mp4 和 txt
let files = [];
function collect(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) { collect(fp); }
    else if (f.endsWith(".mp4") || f.endsWith(".txt")) {
      files.push({ name: f, path: fp });
    }
  }
}

// 先收集目标子目录
for (const t of TARGETS) collect(path.join(BASE, t));
// 再收集 BASE 下已有平铺文件
for (const f of fs.readdirSync(BASE)) {
  const fp = path.join(BASE, f);
  if (!fs.statSync(fp).isDirectory() && (f.endsWith(".mp4") || f.endsWith(".txt"))) {
    files.push({ name: f, path: fp });
  }
}

console.log("收集到 " + files.length + " 个文件");

// 2. 全移到 tmp
for (const f of files) {
  const dest = path.join(TMP, f.name);
  let n = 0;
  let tryDest = dest;
  while (fs.existsSync(tryDest)) {
    n++;
    const ext = path.extname(f.name);
    tryDest = path.join(TMP, path.basename(f.name, ext) + "_" + n + ext);
  }
  fs.renameSync(f.path, tryDest);
}

// 3. 删除空子目录
for (const t of TARGETS) {
  const dp = path.join(BASE, t);
  if (fs.existsSync(dp)) fs.rmSync(dp, { recursive: true });
}

// 4. 在tmp中配对: 每个mp4找对应的信息txt
const tmpFiles = fs.readdirSync(TMP);
const mp4s = tmpFiles.filter(f => f.endsWith(".mp4")).sort();
const txts = tmpFiles.filter(f => f.endsWith(".txt"));
const usedTxts = new Set();

// 对每个mp4，找到编号相同的txt
const pairs = [];
for (const m of mp4s) {
  const mNum = m.match(/^(\d+)_/) ? m.match(/^(\d+)_/)[1] : null;
  let matchedTxt = null;
  for (const t of txts) {
    if (usedTxts.has(t)) continue;
    const tNum = t.match(/^(\d+)_/) ? t.match(/^(\d+)_/)[1] : null;
    if (mNum && tNum && mNum === tNum) {
      matchedTxt = t;
      usedTxts.add(t);
      break;
    }
  }
  pairs.push({ mp4: m, txt: matchedTxt });
}

// 未匹配的txt也加上
for (const t of txts) {
  if (!usedTxts.has(t)) pairs.push({ mp4: null, txt: t });
}

console.log(pairs.length + " 组配对");

// 5. 重新编号，移到BASE
let idx = 0;
for (const p of pairs) {
  if (!p.mp4) continue;
  idx++;
  const num = String(idx).padStart(2, "0");
  const videoId = p.mp4.replace(/^\d+_/, "").replace(".mp4", "");
  const ext = path.extname(p.mp4);

  const newVid = num + "_" + videoId + ext;
  fs.renameSync(path.join(TMP, p.mp4), path.join(BASE, newVid));

  if (p.txt) {
    const newTxt = num + "_信息.txt";
    fs.renameSync(path.join(TMP, p.txt), path.join(BASE, newTxt));
  }
  console.log(num + " ← " + videoId.substring(0, 20));
}

// 6. 清理
if (fs.existsSync(TMP)) {
  const leftover = fs.readdirSync(TMP);
  if (leftover.length > 0) console.log("剩余:", leftover);
  fs.rmSync(TMP, { recursive: true });
}

console.log("\n完成! " + idx + " 个视频 → " + BASE);
