const fs = require("fs");
const path = require("path");

const BASE = "D:/0 北交/0科研-学习myself/场景生成2026.5.25/kling-视频";
const VIEWS = ["vehicle view", "wayside view"];

for (const view of VIEWS) {
  const viewDir = path.join(BASE, view);
  if (!fs.existsSync(viewDir)) continue;
  console.log("═══ " + view + " ═══");

  for (const scene of fs.readdirSync(viewDir)) {
    const sceneDir = path.join(viewDir, scene);
    if (!fs.statSync(sceneDir).isDirectory()) continue;

    for (const intr of fs.readdirSync(sceneDir)) {
      const intrDir = path.join(sceneDir, intr);
      if (!fs.statSync(intrDir).isDirectory()) continue;

      // 检查是否有子目录需要合并
      const subs = fs.readdirSync(intrDir).filter(f =>
        fs.statSync(path.join(intrDir, f)).isDirectory()
      );
      if (subs.length === 0) continue; // 已经是平铺的，跳过

      const TMP = intrDir + "_tmp";
      if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
      fs.mkdirSync(TMP);

      // 1. 收集所有mp4和txt
      function collect(dir) {
        const results = [];
        for (const f of fs.readdirSync(dir)) {
          const fp = path.join(dir, f);
          if (fs.statSync(fp).isDirectory()) { results.push(...collect(fp)); }
          else if (f.endsWith(".mp4") || f.endsWith(".txt")) { results.push({ name: f, path: fp }); }
        }
        return results;
      }
      const files = collect(intrDir);
      if (files.length === 0) continue;

      // 2. 全部移到tmp（去重）
      const moved = new Set();
      for (const f of files) {
        let dest = path.join(TMP, f.name);
        let n = 0;
        while (fs.existsSync(dest)) {
          n++;
          const ext = path.extname(f.name);
          dest = path.join(TMP, path.basename(f.name, ext) + "_" + n + ext);
        }
        fs.renameSync(f.path, dest);
        moved.add(path.basename(dest));
      }

      // 3. 删除空的group子目录
      for (const sub of subs) {
        const sp = path.join(intrDir, sub);
        if (fs.existsSync(sp)) fs.rmSync(sp, { recursive: true });
      }

      // 4. 配对并重新编号
      const tmpFiles = fs.readdirSync(TMP);
      const mp4s = tmpFiles.filter(f => f.endsWith(".mp4")).sort();
      const txts = tmpFiles.filter(f => f.endsWith(".txt"));
      const usedTxts = new Set();
      const pairs = [];

      for (const m of mp4s) {
        const mNum = m.match(/^(\d+)_/)?.[1];
        let txt = null;
        for (const t of txts) {
          if (usedTxts.has(t)) continue;
          const tNum = t.match(/^(\d+)_/)?.[1];
          if (mNum && tNum && mNum === tNum) { txt = t; usedTxts.add(t); break; }
        }
        pairs.push({ mp4: m, txt });
      }

      let idx = 0;
      for (const p of pairs) {
        idx++;
        const num = String(idx).padStart(2, "0");
        const videoId = p.mp4.replace(/^\d+_/, "").replace(".mp4", "");
        const ext = path.extname(p.mp4);
        fs.renameSync(path.join(TMP, p.mp4), path.join(intrDir, num + "_" + videoId + ext));
        if (p.txt) {
          fs.renameSync(path.join(TMP, p.txt), path.join(intrDir, num + "_信息.txt"));
        }
      }

      if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
      console.log("  " + scene + "/" + intr + ": " + idx + " videos ✓");
    }
  }
}
console.log("\n完成!");
