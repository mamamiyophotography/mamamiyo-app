export type PhotoSelectionBooking = {
  ref: string;
  clientName: string;
  date: string;
  sessionLabel: string;
  folderHint: string;
  dropboxFolderPath?: string;
};

export function codexPhotoSelectionUrl(booking: PhotoSelectionBooking): string {
  const prompt = [
    '使用 $mamamiyo-photo-selection 为这位客户做宽松照片初选，供我人工复核。',
    `订单：${booking.ref}`,
    `客户：${booking.clientName}`,
    `拍摄日期：${booking.date}`,
    `拍摄项目：${booking.sessionLabel}`,
    `客户文件夹名称提示：${booking.folderHint}`,
    booking.dropboxFolderPath ? `Dropbox 精确路径：${booking.dropboxFolderPath}` : '',
    '优先通过已连接的 Dropbox 定位客户实际照片文件夹，不依赖 Codex workspace 或本机同步目录。',
    '直接从上面的 Dropbox 精确路径读取 01 BASIC EDIT；只有该路径不存在时，才按日期、客户和拍摄项目搜索并核对实际文件夹。',
    '至少70张只是下限，不设上限。不同角度、构图，以及孩子笑容程度、嘴型、眼神和动作的细微变化尽量保留；自然大笑眯眼和宝宝熟睡保留。仅重复快门、相机轻微晃动且人物状态基本相同的照片精简；普通眨眼和严重坏片淘汰。',
    '把选中原图复制到客户实际照片文件夹内的选中照片，合成素材单独保留并说明配对；保留原图，不删除、不上传、不发布。若已有初选和人工调整，先核对现有状态，不把我已移出的照片重新加回。',
    '缩略图只生成并缓存一次；按需放大复核，调整时只复核受影响组。不用过程报告，直接分类，最后只给实际数量和路径；合成素材另行记录配对并简短说明。',
  ].filter(Boolean).join('\n');
  return `codex://new?${new URLSearchParams({ prompt }).toString()}`;
}
