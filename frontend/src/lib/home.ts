import type { Role } from '../api/auth'

// 各角色登入後的首頁;staff/viewer 面板尚未實作,先導引導頁
export function homeOf(role: Role | undefined): string {
  if (role === 'admin') return '/admin'
  if (role === 'club') return '/'
  return '/coming-soon'
}
