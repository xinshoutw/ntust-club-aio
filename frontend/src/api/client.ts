export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
  meta?: Record<string, unknown> | null
}

const BASE = '/api/v1'

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  // 正確合併 headers(展開 init 不可蓋掉);FormData 交給瀏覽器帶 boundary
  const headers = new Headers(init.headers)
  const isFormData = init.body instanceof FormData
  if (!isFormData && init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers,
  })

  let body: ApiResponse<T>
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    throw new Error(`HTTP ${res.status}`)
  }

  if (typeof body?.success !== 'boolean') {
    throw new Error(`HTTP ${res.status}`)
  }
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  // data 可為 null:呼叫端以 api<T | null> 表達可空端點
  return body.data as T
}
