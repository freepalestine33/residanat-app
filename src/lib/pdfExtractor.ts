import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

// Initialize the worker once for browser use
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker({ name: 'pdfjs-worker' });
}

export interface ExtractedPdfContent {
  text: string;
  pages: number;
  chars: number;
}

/**
 * Extracts selectable text from a PDF file (Blob, File, or ArrayBuffer) in the browser.
 */
export async function extractTextFromPdf(
  input: Blob | File | ArrayBuffer | Uint8Array,
  maxChars = 200000
): Promise<ExtractedPdfContent> {
  let data: Uint8Array;
  if (input instanceof Uint8Array) {
    data = input;
  } else if (input instanceof ArrayBuffer) {
    data = new Uint8Array(input);
  } else {
    const arrayBuffer = await input.arrayBuffer();
    data = new Uint8Array(arrayBuffer);
  }

  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
  });

  const document = await loadingTask.promise;
  const pageTexts: string[] = [];
  let totalChars = 0;

  try {
    for (let pageNum = 1; pageNum <= document.numPages; pageNum += 1) {
      const page = await document.getPage(pageNum);
      const textContent = await page.getTextContent();
      const lines: string[] = [];

      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string') {
          lines.push(item.str);
          if ('hasEOL' in item && item.hasEOL) {
            lines.push('\n');
          }
        }
      }

      const cleanPageText = lines.join(' ').replace(/ +\n/g, '\n').replace(/\n\s*\n/g, '\n').trim();
      if (cleanPageText) {
        pageTexts.push(`[Page ${pageNum}]\n${cleanPageText}`);
        totalChars += cleanPageText.length;
      }

      if (totalChars > maxChars) {
        throw new Error(
          `Le texte du PDF dépasse ${maxChars.toLocaleString('fr-FR')} caractères. Réduisez la sélection ou scindez le PDF.`
        );
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  const combinedText = pageTexts.join('\n\n').trim();
  if (!combinedText) {
    throw new Error(
      'Aucun texte sélectionnable n’a été trouvé dans ce PDF. S’il s’agit d’un document scanné, effectuez une reconnaissance optique (OCR) avant l’importation.'
    );
  }

  return {
    text: combinedText,
    pages: document.numPages,
    chars: combinedText.length,
  };
}
