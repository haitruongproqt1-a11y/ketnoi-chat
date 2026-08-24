import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Video } from "react-native-compressor";

export type PickedMedia = { uri: string; name: string; mimeType: string; size: number; kind: "image" | "video"; width?: number; height?: number };

async function fileSize(uri: string, fallback: number) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? info.size : fallback;
}

export async function optimizeMedia(asset: PickedMedia, onProgress: (progress: number) => void, onCancelReady: (cancel: () => void) => void): Promise<PickedMedia> {
  if (asset.kind === "image") {
    onProgress(0.05);
    const result = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: Math.min(asset.width ?? 1600, 1600) } }], { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG });
    onProgress(1);
    return { ...asset, uri: result.uri, name: asset.name.replace(/\.[^.]+$/, "") + ".jpg", mimeType: "image/jpeg", size: await fileSize(result.uri, asset.size) };
  }
  const uri = await Video.compress(asset.uri, { compressionMethod: "auto", maxSize: 960, minimumFileSizeForCompress: 350_000, getCancellationId: (id) => onCancelReady(() => Video.cancelCompression(id)) }, onProgress);
  return { ...asset, uri, size: await fileSize(uri, asset.size) };
}
