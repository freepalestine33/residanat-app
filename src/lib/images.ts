const MAX_BYTES = 500 * 1024;
const MAX_DIMENSION = 1200;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not compress this image.')), type, quality);
  });
}

export async function compressNoteImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image compression is not available in this browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.58, 0.44, 0.3]) {
      const blob = await canvasBlob(canvas, 'image/webp', quality);
      if (blob.size <= MAX_BYTES) return blob;
    }
    throw new Error('This image is still larger than 500 KB after compression.');
  } finally {
    image.close();
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the note image.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') reject(new Error('Could not encode the note image.'));
      else resolve(reader.result.split(',')[1] ?? '');
    };
    reader.readAsDataURL(blob);
  });
}
