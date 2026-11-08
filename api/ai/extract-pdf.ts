import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBody, requireMethod, sendError } from '../_lib/http';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const body = getBody(req);
    const base64Data = typeof body.base64 === 'string' ? body.base64 : '';
    if (!base64Data) {
      return res.status(400).json({ error: 'Le champ "base64" contenant le PDF est requis.' });
    }

    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const pdfData = new Uint8Array(buffer);

    const loadingTask = getDocument({ data: pdfData });
    const document = await loadingTask.promise;
    const pageTexts: string[] = [];
    let totalChars = 0;
    const maxChars = typeof body.maxChars === 'number' ? body.maxChars : 200000;

    try {
      for (let pageNum = 1; pageNum <= document.numPages; pageNum += 1) {
        const page = await document.getPage(pageNum);
        const textContent = await page.getTextContent();
        const lines: string[] = [];

        for (const item of textContent.items) {
          if ('str' in item && typeof item.str === 'string') {
            lines.push(item.str);
            if ('hasEOL' in item && item.hasEOL) lines.push('\n');
          }
        }

        const text = lines.join(' ').replace(/ +\n/g, '\n').trim();
        if (text) {
          pageTexts.push(`[Page ${pageNum}]\n${text}`);
          totalChars += text.length;
        }

        if (totalChars > maxChars) {
          break;
        }
      }
    } finally {
      await loadingTask.destroy();
    }

    const fullText = pageTexts.join('\n\n').trim();
    if (!fullText) {
      return res.status(400).json({ error: 'Aucun texte sélectionnable n’a été trouvé dans ce PDF.' });
    }

    return res.status(200).json({
      text: fullText,
      pages: document.numPages,
      chars: fullText.length,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
