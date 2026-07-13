export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
  meta?: Record<string, unknown> | null
}

const BASE = '/api/v1'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })

  let body: ApiResponse<T>
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    throw new Error(`HTTP ${res.status}`)
  }

  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return body.data as T
}
