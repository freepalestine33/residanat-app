export async function readSyncResponse<T>(response: Response, path: string): Promise<T> {
  const text = await response.text();
  let result: unknown;

  try {
    result = JSON.parse(text);
  } catch {
    const format = text.trimStart().startsWith('<') ? 'HTML' : 'invalid JSON';
    const guidance = format === 'HTML'
      ? ' Check that the deployment serves the sync API routes instead of the app page.'
      : '';
    throw new Error(`Sync endpoint ${path} returned ${format} (HTTP ${response.status}).${guidance}`);
  }

  if (!response.ok) {
    const error = result && typeof result === 'object' && 'error' in result
      ? result.error
      : undefined;
    throw new Error(typeof error === 'string' ? error : `Sync request failed (${response.status}).`);
  }

  return result as T;
}
