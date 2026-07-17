import type { Role } from '../api/auth'

// 各角色登入後的首頁。
// 現行 role 代號:admin=工作人員(行政端)、staff=工讀生(基礎原型面板);
// 代號改名(admin→staff、staff→pt)隨簽核重做一併調整
export function homeOf(role: Role | undefined): string {
  if (role === 'admin') return '/admin'
  if (role === 'club') return '/'
  if (role === 'staff') return '/pt/violations/new'
  if (role === 'viewer') return '/viewer'
  return '/coming-soon'
}
