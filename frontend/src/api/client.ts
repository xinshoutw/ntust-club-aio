export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
  meta?: Record<string, unknown> | null
}

// 匯出供組完整檔案下載/預覽 URL(api/activities.ts fileUrl 等)
export const API_BASE = '/api/v1'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

/**
 * session 失效時廣播,由 AuthProvider 清掉登入狀態、路由 gate 接手導向登入頁。
 * 走 window event 而非在此 import context,是為了讓 API 層不依賴 React。
 */
export const UNAUTHORIZED_EVENT = 'club-aio:unauthorized'

// 訊息進的是 AntD message,它不設 maxWidth;整份明細攤開會是一條讀不到的長列
const MAX_DETAIL_ITEMS = 3
const VALUE_ERROR_PREFIX = 'Value error, '

/**
 * 後端 422 的 `meta.detail`(pydantic errors)攤成一行;非驗證錯誤回 null。
 *
 * 只帶出自訂驗證器的訊息:那些是寫好的中文。pydantic 內建錯誤是英文,
 * 進不了全中文介面,只報欄位位置讓使用者知道去哪改。
 */
export function validationDetail(detail: unknown): string | null {
  if (!Array.isArray(detail)) return null
  const parts = detail.flatMap((item) => {
    const { loc, msg } = (item ?? {}) as { loc?: unknown; msg?: unknown }
    if (typeof msg !== 'string') return []
    // loc[0] 是 body/query 這類請求段落標記,其餘逐層相連(含陣列索引,才分得出是哪一列)
    const field = Array.isArray(loc) ? loc.slice(1).join('.') : ''
    const text = msg.startsWith(VALUE_ERROR_PREFIX) ? msg.slice(VALUE_ERROR_PREFIX.length) : ''
    if (!field) return text ? [text] : []
    return [text ? `${field}:${text}` : field]
  })
  if (parts.length === 0) return null
  const shown = parts.slice(0, MAX_DETAIL_ITEMS).join('、')
  return parts.length > MAX_DETAIL_ITEMS ? `${shown} 等 ${parts.length} 項` : shown
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

/** 需要自訂 meta 的端點(如器材可借數查詢回傳推導借用區間):回傳 data + meta */
export async function apiWithMeta<T, M>(path: string, init: RequestInit = {}): Promise<{ data: T; meta: M | null }> {
  const body = await request<T>(path, init)
  return { data: body.data as T, meta: (body.meta ?? null) as M | null }
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

  const res = await fetch(`${API_BASE}${path}`, {
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
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    const error = body.error ?? `HTTP ${res.status}`
    const detail = validationDetail((body.meta as { detail?: unknown } | null)?.detail)
    throw new Error(detail ? `${error}:${detail}` : error)
  }
  return body
}
