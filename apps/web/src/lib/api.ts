export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
    public issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const payload = typeof data === 'object' && data !== null ? data : { error: String(data) };
    throw new ApiError(res.status, payload.code, payload.error ?? 'Request failed', payload.issues);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'sales' | 'viewer';
  isActive: boolean;
  dailyLeadTarget: number;
  activeLineId: string | null;
  createdAt: string;
  updatedAt: string;
}
