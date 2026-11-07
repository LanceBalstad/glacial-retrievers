// Shrinks a photo from the phone's camera roll before upload. Phone photos are
// often 3–8 MB; we save a full-size (~1600px) and a card-size (~640px) JPEG.
// Browsers apply the photo's rotation (EXIF) when drawing it, so portraits
// stay upright.

export interface PreparedPhoto {
  full: string; // data:image/jpeg;base64,…
  card: string;
}

const FULL_MAX_SIDE = 1600;
const FULL_MAX_BYTES = 450 * 1024;
const CARD_MAX_SIDE = 640;
const CARD_MAX_BYTES = 90 * 1024;
const QUALITIES = [0.85, 0.78, 0.7, 0.62, 0.55, 0.48, 0.4];
const JPEG_PREFIX = "data:image/jpeg;base64,";

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn’t be opened as a photo. Please choose a JPEG or PNG."));
    };
    image.src = url;
  });

const dataUrlBytes = (dataUrl: string) => Math.ceil(((dataUrl.length - JPEG_PREFIX.length) * 3) / 4);

// Scales the image down to maxSide and lowers JPEG quality until it fits maxBytes.
const toJpeg = (image: HTMLImageElement, maxSide: number, maxBytes: number) => {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser can’t prepare photos. Please try a different browser.");
  }
  // White behind transparent PNGs, since JPEG has no transparency.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let dataUrl = "";
  for (const quality of QUALITIES) {
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlBytes(dataUrl) <= maxBytes) break;
  }
  return dataUrl;
};

export const preparePhoto = async (file: File): Promise<PreparedPhoto> => {
  const image = await loadImage(file);
  return {
    full: toJpeg(image, FULL_MAX_SIDE, FULL_MAX_BYTES),
    card: toJpeg(image, CARD_MAX_SIDE, CARD_MAX_BYTES),
  };
};
