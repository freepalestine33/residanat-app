import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError } from './supabase';
export { ApiError } from './supabase';

export function methodNotAllowed(res: VercelResponse, allowed: string[]) {
  res.setHeader('Allow', allowed.join(', '));
  return res.status(405).json({ error: `Use ${allowed.join(' or ')}.` });
}

export function sendError(res: VercelResponse, error: unknown) {
  if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
  console.error('API request failed', error);
  return res.status(500).json({ error: 'The request could not be completed.' });
}

export function getBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new ApiError(400, 'A JSON object is required.');
  }
  return req.body as Record<string, unknown>;
}

export function requireString(value: unknown, label: string, maxLength = 200): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new ApiError(400, `${label} is invalid.`);
  }
  return value;
}

export function requireTimestamp(value: unknown, label = 'updatedAt'): string {
  const timestamp = requireString(value, label, 40);
  if (!Number.isFinite(Date.parse(timestamp))) throw new ApiError(400, `${label} is invalid.`);
  return new Date(timestamp).toISOString();
}

export function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function requireArray(value: unknown, label: string, maxItems = 1000): unknown[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new ApiError(400, `${label} is invalid.`);
  return value;
}

export function requireMethod(req: VercelRequest, res: VercelResponse, method: string) {
  if (req.method === method) return true;
  methodNotAllowed(res, [method]);
  return false;
}
