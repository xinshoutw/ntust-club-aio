export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
  meta?: Record<string, unknown> | null
}

const BASE = '/api/v1'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

export interface PageMeta {
  page: number
  page_size: number
  total: number
}

export interface Paged<T> {
  data: T
  total: number
}

/** 組 query string:略過 undefined/null/空字串;陣列展開為重複參數 */
export function qs(params: Record<string, string | number | boolean | string[] | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v)
    } else {
      search.set(key, String(value))
    }
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

/** 分頁端點:回傳 data + meta.total(供 Pager 顯示總頁數) */
export async function apiPaged<T>(path: string, init: RequestInit = {}): Promise<Paged<T>> {
  const body = await request<T>(path, init)
  const meta = (body.meta ?? {}) as Partial<PageMeta>
  return { data: body.data as T, total: meta.total ?? 0 }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const body = await request<T>(path, init)
  // data 可為 null:呼叫端以 api<T | null> 表達可空端點
  return body.data as T
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  // 正確合併 headers(展開 init 不可蓋掉);FormData 交給瀏覽器帶 boundary
  const headers = new Headers(init.headers)
  const isFormData = init.body instanceof FormData
  if (!isFormData && init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  // CSRF double-submit:狀態變更請求自動回送 csrf_token cookie(見 architecture.md §4.1)
  const method = (init.method ?? 'GET').toUpperCase()
  if (UNSAFE_METHODS.has(method) && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', csrfToken())
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
  return body
}
