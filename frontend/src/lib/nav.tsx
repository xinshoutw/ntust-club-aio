import type { ReactNode } from 'react'
import type { FixedWindow } from '../api/bookings'
import type { SessionUser } from '../api/auth'
import { canAccessAdminPath } from './permissions'
import {
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FileDoneOutlined,
  FlagOutlined,
  FolderOpenOutlined,
  FormOutlined,
  HomeOutlined,
  IdcardOutlined,
  NotificationOutlined,
  PlusSquareOutlined,
  ScheduleOutlined,
  SettingOutlined,
  SolutionOutlined,
  StopOutlined,
  TeamOutlined,
  ToolOutlined,
  TrophyOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons'

export interface NavItem {
  key: string
  label: string
  path: string
  icon: ReactNode
  badge?: number
  disabled?: boolean
  disabledHint?: string
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

const FIXED_BOOKING_ITEM: NavItem = {
  key: 'booking-fixed',
  label: '固定場地',
  path: '/bookings/fixed',
  icon: <ScheduleOutlined />,
}

// 社團端資訊架構:刻意與需求規格原型的 NAV 不同,勿依原型改回。
// 固定場地借用開放窗由後端系統設定提供(GET /club/room-bookings/window),
// nav 因此無法再是模組層級常數:改為 builder,由 App 的 ClubShell 以 useFixedWindow() 查詢後組合;
// 未開放(或查詢未完成)時項目反灰並移至「其他」。
export function buildClubNav(window?: FixedWindow): NavGroup[] {
  const fixedBookingOpen = window?.open ?? false
  const closedHint =
    window?.openFrom && window.openUntil
      ? `未開放申請;受理期間 ${window.openFrom} – ${window.openUntil}`
      : '目前未開放申請'
  return [
    {
      items: [{ key: 'overview', label: '總覽', path: '/', icon: <HomeOutlined /> }],
    },
    {
      label: '活動管理',
      items: [
        { key: 'act-new', label: '活動申請', path: '/activities/new', icon: <FormOutlined /> },
        { key: 'act-close', label: '活動結案', path: '/activities/close', icon: <FileDoneOutlined /> },
        { key: 'act-list', label: '活動列表', path: '/activities', icon: <UnorderedListOutlined /> },
      ],
    },
    {
      label: '社團管理',
      items: [
        { key: 'members', label: '成員列表', path: '/members', icon: <TeamOutlined /> },
        { key: 'club-settings', label: '管理項目', path: '/club-settings', icon: <SettingOutlined /> },
      ],
    },
    {
      label: '空間與器材借用',
      items: [
        { key: 'booking-overview', label: '借用總覽', path: '/bookings', icon: <CalendarOutlined /> },
        ...(fixedBookingOpen ? [FIXED_BOOKING_ITEM] : []),
        { key: 'booking-venue', label: '臨時場地', path: '/bookings/venue', icon: <EnvironmentOutlined /> },
        { key: 'booking-equipment', label: '器材借用', path: '/bookings/equipment', icon: <AppstoreOutlined /> },
      ],
    },
    {
      label: '線上申請',
      items: [
        { key: 'signup', label: '線上報名', path: '/signup', icon: <FlagOutlined /> },
        { key: 'maintenance', label: '空間報修', path: '/maintenance', icon: <ToolOutlined /> },
        { key: 'postal', label: '郵局帳戶', path: '/postal', icon: <BankOutlined /> },
        { key: 'certificate', label: '幹部證明', path: '/certificates', icon: <IdcardOutlined /> },
      ],
    },
    {
      label: '社團評鑑',
      items: [
        { key: 'eval-docs', label: '資料總覽', path: '/eval', icon: <FolderOpenOutlined /> },
      ],
    },
    {
      label: '其他',
      items: [
        { key: 'violations', label: '違規勸導', path: '/violations', icon: <WarningOutlined /> },
        ...(fixedBookingOpen
          ? []
          : [{ ...FIXED_BOOKING_ITEM, disabled: true, disabledHint: closedHint }]),
      ],
    },
  ]
}

const ADMIN_ROOM_ITEM: NavItem = {
  key: 'a-room',
  label: '固定場地借用',
  path: '/admin/rooms',
  icon: <ScheduleOutlined />,
}

// 側欄徽章=待審數(shell 以共用 query 提供;查詢中/失敗不顯示)。
// 依 permissions 過濾:受限管理員只看得到自己可用的項目(路由另有 gate)。
// 開放窗外的「固定場地借用」反灰並移至最末組。
export function buildAdminNav(
  user: SessionUser | null,
  pendingReview?: number,
  pendingClose?: number,
  fixedWindow?: FixedWindow,
): NavGroup[] {
  const fixedBookingOpen = fixedWindow?.open ?? false
  const closedHint =
    fixedWindow?.openFrom && fixedWindow.openUntil
      ? `未開放申請;受理期間 ${fixedWindow.openFrom} – ${fixedWindow.openUntil}`
      : '目前未開放申請'
  const groups: NavGroup[] = [
  {
    items: [{ key: 'a-home', label: '總覽', path: '/admin', icon: <DashboardOutlined /> }],
  },
  {
    label: '活動審核',
    items: [
      {
        key: 'a-review',
        label: '申請審核',
        path: '/admin/review',
        icon: <AuditOutlined />,
        badge: pendingReview || undefined,
      },
      {
        key: 'a-close',
        label: '結案審核',
        path: '/admin/close-review',
        icon: <FileDoneOutlined />,
        badge: pendingClose || undefined,
      },
    ],
  },
  {
    label: '報名管理',
    items: [
      { key: 'a-signup', label: '活動管理', path: '/admin/signups', icon: <FlagOutlined /> },
      { key: 'a-builder', label: '活動建立', path: '/admin/signup-items/new', icon: <PlusSquareOutlined /> },
    ],
  },
  {
    label: '公告',
    items: [
      { key: 'a-announce', label: '發布系統公告', path: '/admin/announcements', icon: <NotificationOutlined /> },
    ],
  },
  {
    label: '借用審核',
    items: [
      { key: 'a-booking', label: '臨時場地器材借用', path: '/admin/bookings', icon: <EnvironmentOutlined /> },
      ...(fixedBookingOpen ? [ADMIN_ROOM_ITEM] : []),
      // 最高權限專屬(canAccessAdminPath 過濾:僅 super 可見)
      { key: 'a-manual', label: '手動借用', path: '/admin/manual-booking', icon: <PlusSquareOutlined /> },
      { key: 'a-venue-rules', label: '場地不開放規則', path: '/admin/venue-rules', icon: <StopOutlined /> },
    ],
  },
  {
    label: '社團管理',
    items: [
      { key: 'a-club-overview', label: '社團總覽', path: '/admin/club-overview', icon: <HomeOutlined /> },
      { key: 'a-members', label: '成員列表', path: '/admin/members', icon: <TeamOutlined /> },
      { key: 'a-club-settings', label: '管理項目', path: '/admin/club-settings', icon: <SettingOutlined /> },
      { key: 'a-overdue', label: '逾期追蹤與停權', path: '/admin/overdue', icon: <StopOutlined /> },
    ],
  },
  {
    label: '社團評鑑',
    items: [
      { key: 'a-eval', label: '行政分審核', path: '/admin/eval', icon: <TrophyOutlined /> },
    ],
  },
  {
    label: '帳號與權限',
    items: [
      // 新增/刪除/停權/權限設定合一頁;社團帳號操作在「社團管理 > 管理項目」
      { key: 'a-accounts', label: '帳號管理', path: '/admin/accounts', icon: <SolutionOutlined /> },
    ],
  },
  {
    label: '其他',
    items: [
      { key: 'a-applications', label: '線上申請管理', path: '/admin/applications', icon: <FormOutlined /> },
      { key: 'a-maintenance', label: '維修管理', path: '/admin/maintenance', icon: <ToolOutlined /> },
      { key: 'a-violations', label: '違規管理', path: '/admin/violations', icon: <WarningOutlined /> },
      // 稽核軌跡自側欄移除,入口只留 Header 帳號選單
      { key: 'a-files', label: '檔案管理', path: '/admin/files', icon: <FolderOpenOutlined /> },
      ...(fixedBookingOpen
        ? []
        : [{ ...ADMIN_ROOM_ITEM, disabled: true, disabledHint: closedHint }]),
    ],
  },
  ]
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => canAccessAdminPath(user, i.path)) }))
    .filter((g) => g.items.length > 0)
}

// 工讀生端(URL 前綴 /pt;登入角色鍵維持 staff)
export function buildPtNav(): NavGroup[] {
  return [
    {
      label: '違規勸導',
      items: [
        { key: 'pt-viol-new', label: '違規勸導填寫', path: '/pt/violations/new', icon: <FormOutlined /> },
        { key: 'pt-viol-list', label: '違規紀錄查詢', path: '/pt/violations', icon: <UnorderedListOutlined /> },
      ],
    },
    {
      label: '器材點交',
      items: [
        { key: 'pt-checkout', label: '器材借出點交', path: '/pt/checkout', icon: <AppstoreOutlined /> },
        { key: 'pt-checkin', label: '器材歸還點交', path: '/pt/checkin', icon: <FileDoneOutlined /> },
        { key: 'pt-overdue', label: '逾期追蹤', path: '/pt/overdue', icon: <StopOutlined /> },
      ],
    },
  ]
}

// 評審端
export function buildViewerNav(): NavGroup[] {
  return [
    {
      items: [
        { key: 'v-my', label: '我負責的評分', path: '/viewer', icon: <HomeOutlined /> },
        { key: 'v-score', label: '評分(依獎項)', path: '/viewer/score', icon: <TrophyOutlined /> },
        { key: 'v-done', label: '已完成評分', path: '/viewer/done', icon: <FileDoneOutlined /> },
      ],
    },
  ]
}
