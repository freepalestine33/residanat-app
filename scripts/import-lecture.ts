import { readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { LectureSchema } from '../src/lib/schema';
import { otrProgramme } from '../src/data/otrProgramme';
import { createLectureDraft } from './create-lecture-draft';
import { printCheck, validateLectureValue } from './lecturePipeline';

type Provider = 'anthropic' | 'xai' | 'gemini' | 'openai';
type CliOptions = {
  pdfPath: string;
  provider?: Provider;
  id?: string;
  name?: string;
  model?: string;
  otrNumber?: number;
  maxChars: number;
  maxOutputTokens: number;
  promptPath: string;
  openPreview: boolean;
  qcm: boolean;
};

const usage = 'Usage: npm run lecture:import -- <course.pdf> [--provider openai|anthropic|xai|gemini] [--id id] [--name title] [--otr 1-43] [--qcm] [--no-open]';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`${usage}\n\nOptional: --model <name> --max-chars <count> --max-output-tokens <count> --prompt <path> --qcm`);
  process.exit(0);
}

function parseArgs(args: string[]): CliOptions {
  let pdfPath: string | undefined;
  const values: Record<string, string> = {};
  let openPreview = true;
  let qcm = false;
  const valueFlags = new Set(['--provider', '--id', '--name', '--model', '--otr', '--max-chars', '--max-output-tokens', '--prompt']);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--no-open') { openPreview = false; continue; }
    if (arg === '--qcm') { qcm = true; continue; }
    if (valueFlags.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.\n${usage}`);
      values[arg] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}\n${usage}`);
    if (pdfPath) throw new Error(`Only one PDF can be imported at a time.\n${usage}`);
    pdfPath = arg;
  }
  if (!pdfPath) throw new Error(usage);
  if (extname(pdfPath).toLowerCase() !== '.pdf') throw new Error('The input file must be a PDF.');

  const providerText = values['--provider']?.toLowerCase();
  if (providerText && providerText !== 'openai' && providerText !== 'anthropic' && providerText !== 'xai' && providerText !== 'gemini') throw new Error('--provider must be openai, anthropic, xai, or gemini.');
  const otrText = values['--otr'];
  const otrNumber = otrText === undefined ? undefined : Number(otrText);
  if (otrNumber !== undefined && (!Number.isInteger(otrNumber) || otrNumber < 1 || otrNumber > 43)) throw new Error('--otr must be a number from 1 to 43.');
  const maxChars = positiveInteger(values['--max-chars'] ?? process.env.LECTURE_MAX_PDF_CHARS ?? '200000', 'max PDF characters');
  const maxOutputTokens = positiveInteger(values['--max-output-tokens'] ?? process.env.LECTURE_MAX_OUTPUT_TOKENS ?? '24000', 'max output tokens');

  const id = values['--id'] ?? slug(basename(pdfPath, extname(pdfPath)));
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error('--id must contain 1 to 32 letters, numbers, hyphens, or underscores.');
  return {
    pdfPath: resolve(pdfPath),
    provider: providerText as Provider | undefined,
    id,
    name: values['--name'],
    model: values['--model'],
    otrNumber,
    maxChars,
    maxOutputTokens,
    promptPath: resolve(values['--prompt'] ?? 'prompts/lecture-json.md'),
    openPreview,
    qcm,
  };
}

function positiveInteger(value: string, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`Invalid ${label}: ${value}`);
  return number;
}

function slug(value: string): string {
  const result = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  if (!result) throw new Error('Could not derive an ID from the PDF filename. Pass --id <id>.');
  return result;
}

async function extractPdfText(path: string, maxChars: number): Promise<{ text: string; pages: number }> {
  const pdfData = new Uint8Array(readFileSync(path));
  const loadingTask = getDocument({ data: pdfData });
  const document = await loadingTask.promise;
  const pageText: string[] = [];
  let total = 0;
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        lines.push(item.str);
        if (item.hasEOL) lines.push('\n');
      }
      const text = lines.join(' ').replace(/ +\n/g, '\n').trim();
      if (text) pageText.push(`[Page ${pageNumber}]\n${text}`);
      total += text.length;
      if (total > maxChars) throw new Error(`PDF text exceeds ${maxChars.toLocaleString()} characters. Split the PDF or increase --max-chars.`);
    }
  } finally {
    await loadingTask.destroy();
  }
  const text = pageText.join('\n\n');
  if (!text.trim()) throw new Error('No selectable text was found in the PDF. Scanned PDFs need OCR before importing.');
  return { text, pages: document.numPages };
}

function selectProvider(requested?: Provider): { provider: Provider; apiKey: string } {
  const configured = process.env.LECTURE_AI_PROVIDER?.toLowerCase();
  const provider = requested ?? (configured === 'openai' || configured === 'anthropic' || configured === 'xai' || configured === 'gemini' ? configured : undefined);
  if (configured && configured !== 'openai' && configured !== 'anthropic' && configured !== 'xai' && configured !== 'gemini') throw new Error('LECTURE_AI_PROVIDER must be openai, anthropic, xai, or gemini.');
  if (provider) {
    const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : provider === 'xai' ? 'XAI_API_KEY' : 'GEMINI_API_KEY';
    const apiKey = process.env[keyName];
    if (!apiKey) throw new Error(`Set ${keyName} in .env or .env.local before importing.`);
    return { provider, apiKey };
  }
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasXai = Boolean(process.env.XAI_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const configuredProviders = [hasOpenAI && 'openai', hasAnthropic && 'anthropic', hasXai && 'xai', hasGemini && 'gemini'].filter(Boolean);
  if (configuredProviders.length !== 1) throw new Error('Set LECTURE_AI_PROVIDER or configure exactly one AI API key in .env or .env.local.');
  if (hasOpenAI) return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY! };
  if (hasAnthropic) return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! };
  if (hasXai) return { provider: 'xai', apiKey: process.env.XAI_API_KEY! };
  return { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY! };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}: ${raw.slice(0, 1200)}`);
  try { return asRecord(JSON.parse(raw) as unknown); }
  catch { throw new Error('AI provider returned an invalid JSON response envelope.'); }
}

async function generateLecture(provider: Provider, apiKey: string, model: string, prompt: string, maxOutputTokens: number): Promise<string> {
  if (provider === 'anthropic') {
    const response = await postJson('https://api.anthropic.com/v1/messages', {
      'anthropic-version': process.env.ANTHROPIC_VERSION ?? '2023-06-01',
      'x-api-key': apiKey,
    }, {
      model,
      max_tokens: maxOutputTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'max_tokens') throw new Error('Claude reached the output token limit. Increase --max-output-tokens or use a shorter PDF.');
    const blocks = Array.isArray(response.content) ? response.content : [];
    const text = blocks.map((block) => asRecord(block)).filter((block) => block.type === 'text').map((block) => String(block.text ?? '')).join('\n');
    if (!text.trim()) throw new Error('Claude returned no text content.');
    return text;
  }

  if (provider === 'gemini') {
    const response = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      'x-goog-api-key': apiKey,
    }, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens },
    });
    const candidates = Array.isArray(response.candidates) ? response.candidates : [];
    const candidate = asRecord(candidates[0]);
    if (candidate.finishReason === 'MAX_TOKENS') throw new Error('Gemini reached the output token limit. Increase --max-output-tokens or use a shorter PDF.');
    const content = asRecord(candidate.content);
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const text = parts.map((part) => asRecord(part)).map((part) => String(part.text ?? '')).join('\n');
    if (!text.trim()) {
      const feedback = asRecord(response.promptFeedback);
      throw new Error(`Gemini returned no text content${feedback.blockReason ? ` (blocked: ${String(feedback.blockReason)})` : ''}.`);
    }
    return text;
  }

  if (provider === 'openai') {
    try {
      const response = await postJson('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${apiKey}` }, {
        model,
        messages: [
          { role: 'system', content: 'Tu es un assistant de préparation pédagogique médicale. Tu réponds obligatoirement avec un JSON valide.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: Math.min(maxOutputTokens, 16384),
        temperature: 0.2,
      });
      const choices = Array.isArray(response.choices) ? response.choices : [];
      const firstChoice = asRecord(choices[0]);
      const message = asRecord(firstChoice.message);
      const text = String(message.content ?? '');
      if (text.trim()) return text;
    } catch {
      // Fallback to /v1/responses if custom models or responses API is required
      const response = await postJson('https://api.openai.com/v1/responses', { authorization: `Bearer ${apiKey}` }, {
        model,
        input: prompt,
        max_output_tokens: maxOutputTokens,
        store: false,
        text: { format: { type: 'json_object' } },
      });
      if (response.status === 'incomplete') throw new Error('OpenAI returned an incomplete response. Increase --max-output-tokens or use a shorter PDF.');
      const output = Array.isArray(response.output) ? response.output : [];
      const text = output.flatMap((item) => {
        const content = asRecord(item).content;
        return Array.isArray(content) ? content : [];
      }).map((item) => asRecord(item)).filter((item) => item.type === 'output_text').map((item) => String(item.text ?? '')).join('\n');
      if (!text.trim()) throw new Error('OpenAI returned no text content.');
      return text;
    }
  }

  const response = await postJson('https://api.x.ai/v1/responses', { authorization: `Bearer ${apiKey}` }, {
    model,
    input: prompt,
    max_output_tokens: maxOutputTokens,
    store: false,
    text: { format: { type: 'json_object' } },
  });
  if (response.status === 'incomplete') throw new Error('Grok returned an incomplete response. Increase --max-output-tokens or use a shorter PDF.');
  const output = Array.isArray(response.output) ? response.output : [];
  const text = output.flatMap((item) => {
    const content = asRecord(item).content;
    return Array.isArray(content) ? content : [];
  }).map((item) => asRecord(item)).filter((item) => item.type === 'output_text').map((item) => String(item.text ?? '')).join('\n');
  if (!text.trim()) throw new Error('Grok returned no text content.');
  return text;
}

function parseJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('The model did not return a JSON object.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, index + 1)) as unknown; }
      catch (error) { throw new Error(`Model output is not valid lecture JSON: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  throw new Error('Model output ended before the JSON object was complete. Increase --max-output-tokens or use a shorter PDF.');
}

function openPreview(url: string) {
  const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.warn(`Could not open a browser automatically. Open ${url}`));
  child.unref();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { provider, apiKey } = selectProvider(options.provider);
  const model = options.model ?? (provider === 'anthropic'
    ? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'
    : provider === 'xai' ? process.env.XAI_MODEL ?? 'grok-4.7'
      : provider === 'gemini' ? process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'
        : process.env.OPENAI_MODEL ?? 'gpt-4o');
  const topic = options.otrNumber ? otrProgramme.find((item) => item.number === options.otrNumber) : undefined;
  const { text: pdfText, pages } = await extractPdfText(options.pdfPath, options.maxChars);
  const template = readFileSync(options.promptPath, 'utf8');
  const qcmDirective = options.qcm
    ? '\n\nDIRECTIVE SPÉCIALE QCM / ANNALES : Le document fourni contient des questions de QCM ou d’annales. Extrais rigoureusement chaque QCM avec ses choix et explications détaillées, synthétise chaque concept clé sous forme de carte mémo dans "cards", et génère des affirmations vrai/faux dans "vf" pour travailler les pièges.'
    : '';
  const prompt = `${template}${qcmDirective}\n\n<metadata>\nPDF: ${basename(options.pdfPath)}\nLecture ID: ${options.id}\n${options.name ? `Expected lecture title: ${options.name}\n` : ''}${topic ? `OTR topic ${topic.number}: ${topic.title}\n` : ''}</metadata>\n\n<source_pdf_text>\n${pdfText}\n</source_pdf_text>\n\nGenerate the lecture JSON now. Return only the JSON object.`;

  console.log(`Extracted ${pdfText.length.toLocaleString()} characters from ${pages} PDF pages.`);
  console.log(`Generating lecture with ${provider} (${model}). The PDF text will be sent to that provider.`);
  const generatedText = await generateLecture(provider, apiKey, model, prompt, options.maxOutputTokens);
  let lecture = LectureSchema.parse(parseJsonObject(generatedText));
  lecture = LectureSchema.parse({
    ...lecture,
    id: options.id,
    ...(options.name ? { name: options.name } : {}),
    ...(options.otrNumber === undefined ? { otrNumber: undefined } : { otrNumber: options.otrNumber }),
  });
  const check = validateLectureValue(lecture);
  printCheck(check);
  if (check.errors.length || !check.lecture) throw new Error('Generated content failed validation. No draft was created; correct the prompt or regenerate.');

  const { draftPath, warnings } = createLectureDraft(check.lecture, { pdfPath: options.pdfPath, otrNumber: options.otrNumber });
  for (const warning of warnings) console.warn(`WARN  ${warning}`);
  console.log(`Draft created: ${draftPath}`);
  const devUrl = (process.env.LECTURE_PREVIEW_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  const previewUrl = `${devUrl}/#/draft/${check.lecture.id}`;
  console.log(`Preview: ${previewUrl}`);
  if (options.openPreview) {
    try {
      const response = await fetch(`${devUrl}/`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) openPreview(previewUrl);
      else console.log('Start the app with npm run dev, then open the preview URL above.');
    } catch {
      console.log('Start the app with npm run dev, then open the preview URL above.');
    }
  }
  console.log('Review the medical content before publishing. This command never publishes automatically.');
}

main().catch((error: unknown) => {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
