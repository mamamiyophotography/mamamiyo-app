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
    '调用 $mamamiyo-photo-selection 为这位客户做宽松照片初选。任务开始时立即进入 Work mode，并在 Work mode 中完成 Dropbox 定位、视觉复核、复制、合成配对记录和最终汇报；不要先在普通聊天里浏览 Dropbox，也不要让我手动切换。',
    `订单：${booking.ref}`,
    `客户：${booking.clientName}`,
    `拍摄日期：${booking.date}`,
    `拍摄项目：${booking.sessionLabel}`,
    `客户文件夹名称提示：${booking.folderHint}`,
    booking.dropboxFolderPath ? `Dropbox 精确路径：${booking.dropboxFolderPath}` : '',
    '优先使用上面的 Dropbox 精确路径；若不存在，再按日期、客户和拍摄项目核对实际 01 BASIC EDIT 或 02 BASIC EDIT。',
    '严格沿用 skill 中现有的宽松初选、人工调整保护、合成配对、原图保护、缩略图缓存和简短最终汇报规则。',
  ].filter(Boolean).join('\n');
  return `codex://new?${new URLSearchParams({ prompt }).toString()}`;
}
