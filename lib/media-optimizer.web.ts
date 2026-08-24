export type PickedMedia = { uri: string; name: string; mimeType: string; size: number; kind: "image" | "video"; width?: number; height?: number };

export async function optimizeMedia(asset: PickedMedia, onProgress: (progress: number) => void, _onCancelReady: (cancel: () => void) => void): Promise<PickedMedia> {
  onProgress(1);
  return asset;
}
