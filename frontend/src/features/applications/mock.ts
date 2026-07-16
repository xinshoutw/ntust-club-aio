import type { StatusKey } from '../../lib/status'

// 靜態假資料;後端 API 完成後改為 TanStack Query 取用
// (空間報修頁/幹部證明頁與行政端社團總覽共用)

export interface MaintenanceRecord {
  id: string
  location: string
  items: string
  date: string
  status: StatusKey
  handleNote?: string
}

export const MAINTENANCE_RECORDS: MaintenanceRecord[] = [
  { id: 'MNT-114-0023', location: '社團大樓 3F S304 音樂教室', items: '天花板漏水、燈管不亮', date: '2026/06/16', status: 'in_progress', handleNote: '已報修總務處,預計本週處理' },
  { id: 'MNT-114-0019', location: '社辦 S312', items: '門鎖損壞', date: '2026/05/02', status: 'done', handleNote: '已更換鎖芯' },
]

export interface CertificateRecord {
  id: string
  holder: string // 對象(姓名+職稱)
  term: string
  date: string
  status: StatusKey
}

export const CERTIFICATE_RECORDS: CertificateRecord[] = [
  { id: 'OFC-114-0021', holder: '顏志明 (會長)', term: '114學年度第2學期', date: '2026/06/10', status: 'pending' },
]
