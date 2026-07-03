const fs = require("fs");
const path = require("path");

const BASE = "D:/0 北交/0科研-学习myself/场景生成2026.5.25/kling-视频/wayside view";
const OLD = path.join(BASE, "站台进出站");
const NEW_PF = path.join(BASE, "站台");
const NEW_QJ = path.join(BASE, "区间");

if (!fs.existsSync(OLD)) { console.log("站台进出站 不存在"); process.exit(1); }

// cow → 区间, people → 站台
const MOVE_MAP = { cow: "区间", people: "站台" };

for (const intr of fs.readdirSync(OLD)) {
  const intrDir = path.join(OLD, intr);
  if (!fs.statSync(intrDir).isDirectory()) continue;

  const targetName = MOVE_MAP[intr] || intr;
  const targetDir = path.join(targetName === "区间" ? NEW_QJ : NEW_PF, intr);
  fs.mkdirSync(targetDir, { recursive: true });

  const videos = fs.readdirSync(intrDir).filter(f => f.endsWith(".mp4")).sort();

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const num = String(i + 1).padStart(2, "0");
    const videoId = v.match(/_(\d+)\.mp4$/)?.[1] || "";
    const ext = path.extname(v);

    // 复制视频
    fs.copyFileSync(path.join(intrDir, v), path.join(targetDir, num + "_" + videoId + ext));

    // 复制txt
    const oldNum = v.match(/^(\d+)_/)?.[1];
    if (oldNum) {
      const txtSrc = path.join(intrDir, oldNum + "_信息.txt");
      if (fs.existsSync(txtSrc)) {
        fs.copyFileSync(txtSrc, path.join(targetDir, num + "_信息.txt"));
      }
    }
  }
  console.log(intr + " → " + targetName + "/" + intr + ": " + videos.length + " videos ✓");
}

fs.rmSync(OLD, { recursive: true });
console.log("\n完成!");
