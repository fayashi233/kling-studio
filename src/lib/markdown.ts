import matter from "gray-matter";
import type { ImportedPrompt, ModelName, Mode, Duration, AspectRatio } from "@/types";

export function parseMarkdownPrompts(content: string): ImportedPrompt[] {
  // Check if it contains frontmatter separators
  const blocks = content.split(/^---\s*$/m).filter((b) => b.trim());

  if (content.startsWith("---")) {
    // Has frontmatter - parse as single prompt with metadata
    try {
      const parsed = matter(content);
      return [
        {
          title: parsed.data.title || "Imported Prompt",
          prompt: parsed.content.trim(),
          negative_prompt: parsed.data.negative_prompt,
          model_name: parsed.data.model_name as ModelName | undefined,
          mode: parsed.data.mode as Mode | undefined,
          duration: parsed.data.duration as Duration | undefined,
          aspect_ratio: parsed.data.aspect_ratio as AspectRatio | undefined,
          cfg_scale: parsed.data.cfg_scale,
        },
      ];
    } catch {
      // Fall through to line-by-line parsing
    }
  }

  // Try splitting by headers (## or #)
  const headerBlocks = content.split(/^(#{1,2}\s+.+)$/m).filter((b) => b.trim());
  if (headerBlocks.length > 1) {
    const prompts: ImportedPrompt[] = [];
    let currentTitle = "Imported Prompt";
    for (const block of headerBlocks) {
      const headerMatch = block.match(/^#{1,2}\s+(.+)$/);
      if (headerMatch) {
        currentTitle = headerMatch[1].trim();
      } else if (block.trim()) {
        prompts.push({
          title: currentTitle,
          prompt: block.trim(),
        });
      }
    }
    if (prompts.length > 0) return prompts;
  }

  // Fallback: treat each non-empty line as a separate prompt
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line, i) => ({
      title: `Prompt ${i + 1}`,
      prompt: line,
    }));
}
