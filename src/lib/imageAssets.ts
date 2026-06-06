import type { CardAsset, CharacterCardV3 } from "./schema";

export function extensionFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase().replace(/^\./, "");
  return ext && ext !== name ? ext : "unknown";
}

export function findMainIconAsset(card: CharacterCardV3): CardAsset | undefined {
  const assets = Array.isArray(card.data.assets) ? card.data.assets : [];
  return assets.find((asset) => asset?.type === "icon" && asset?.name === "main");
}

export function isDataImageUri(uri: string): boolean {
  return /^data:image\//i.test(uri);
}

export function isPngDataImageUri(uri: string): boolean {
  return /^data:image\/(?:png|apng);base64,/i.test(uri);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function readFileAsPngDataUrl(file: File): Promise<string> {
  return dataImageToPngDataUrl(await readFileAsDataUrl(file));
}

export function dataImageToPngDataUrl(dataUrl: string): Promise<string> {
  if (isPngDataImageUri(dataUrl)) {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) {
        reject(new Error("Image dimensions could not be read."));
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas is not available."));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Image could not be decoded."));
    image.src = dataUrl;
  });
}

export function fileUriToPath(uri: string): string | null {
  if (!uri.toLowerCase().startsWith("file://")) {
    return null;
  }

  const rawPath = uri.slice("file://".length);
  const withoutWindowsLeadingSlash = /^\/[A-Za-z]:\//.test(rawPath) ? rawPath.slice(1) : rawPath;
  try {
    return decodeURIComponent(withoutWindowsLeadingSlash);
  } catch {
    return withoutWindowsLeadingSlash;
  }
}
