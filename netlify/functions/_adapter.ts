import type { VercelRequest, VercelResponse } from '@vercel/node';

type JsonResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body?: string;
};

type VercelHandler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;

export function netlifyHandler(handler: VercelHandler) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    let body: unknown;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        body = await request.json();
      } catch {
        body = undefined;
      }
    }

    const req = {
      method: request.method,
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(request.headers.entries()),
      query: Object.fromEntries(url.searchParams.entries()),
      body,
    } as unknown as VercelRequest;

    const result: JsonResponse = { statusCode: 200, headers: {} };
    const res = {
      status(code: number) {
        result.statusCode = code;
        return this;
      },
      json(value: unknown) {
        result.headers['Content-Type'] = 'application/json; charset=utf-8';
        result.body = JSON.stringify(value);
        return this;
      },
      setHeader(name: string, value: string) {
        result.headers[name] = value;
        return this;
      },
    } as unknown as VercelResponse;

    await handler(req, res);
    return new Response(result.body, { status: result.statusCode, headers: result.headers });
  };
}
