/** Erro devolvido pela API, com o código da AWS quando a falha veio do emulador. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { code?: string; message?: string };
    return new ApiError(response.status, body.code ?? 'Error', body.message ?? response.statusText);
  } catch {
    return new ApiError(response.status, 'Error', response.statusText || 'Falha na requisição');
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: init.body && !isForm ? { 'content-type': 'application/json', ...init.headers } : init.headers,
  });
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const json = (body: unknown): RequestInit['body'] => JSON.stringify(body);

export const encode = encodeURIComponent;

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.code && err.code !== 'Error' ? `${err.code}: ${err.message}` : err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
