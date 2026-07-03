export interface VideoInfoData {
  prompt?: string;
  negative_prompt?: string;
  model_name?: string;
  mode?: string;
  duration?: string;
  aspect_ratio?: string;
  cfg_scale?: number | string;
  task_id?: string;
  task_status?: string;
  video_url?: string | null;
  reference_image?: string | null;
  last_frame_image?: string | null;
  export_view_type?: string;
  export_scene_type?: string;
  export_case_type?: string;
  video_code?: string;
  first_frame_code?: string;
  last_frame_code?: string;
  original_image_code?: string;
  image_source?: string;
  image_tool?: string;
  video_tool?: string;
  usable?: string;
  issue_type?: string;
  issue_description?: string;
  export_tags?: string;
  created_at?: string;
}

function line(label: string, value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return `${label}: ${text}`;
}

export function buildVideoInfoText(info: VideoInfoData): string {
  return [
    line("视频编号", info.video_code),
    line("任务ID", info.task_id),
    line("任务状态", info.task_status),
    line("生成时间", info.created_at),
    "",
    "[提示词]",
    info.prompt || "",
    "",
    "[负向提示词]",
    info.negative_prompt || "",
    "",
    "[生成参数]",
    line("模型", info.model_name),
    line("模式", info.mode),
    line("时长", info.duration ? `${info.duration}s` : ""),
    line("比例", info.aspect_ratio),
    line("CFG Scale", info.cfg_scale),
    line("视频地址", info.video_url),
    "",
    "[参考图]",
    line("首帧/参考图", info.reference_image),
    line("尾帧", info.last_frame_image),
    line("首帧图片编号", info.first_frame_code),
    line("尾帧图片编号", info.last_frame_code),
    line("原图编号", info.original_image_code),
    line("输入图片来源", info.image_source),
    line("图片合成工具", info.image_tool),
    line("视频合成工具", info.video_tool),
    "",
    "[导出分类]",
    line("视角", info.export_view_type),
    line("场景", info.export_scene_type),
    line("案例类型", info.export_case_type),
    line("是否可用", info.usable),
    line("主要问题类型", info.issue_type),
    line("主要问题描述", info.issue_description),
    line("标签", info.export_tags),
  ].join("\r\n");
}
