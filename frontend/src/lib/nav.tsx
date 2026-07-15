import type { ReactNode } from 'react'
import { REVIEW_ITEMS } from '../features/admin/reviewMock'
import { isFixedBookingOpen } from '../features/bookings/mock'
import {
  ApartmentOutlined,
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
  HistoryOutlined,
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

// 固定場地借用僅於管理員開放期間可用;未開放時反灰並移至「其他」
const fixedBookingOpen = isFixedBookingOpen()
const FIXED_BOOKING_ITEM: NavItem = {
  key: 'booking-fixed',
  label: '固定場地借用',
  path: '/bookings/fixed',
  icon: <ScheduleOutlined />,
}

// 社團端資訊架構(2026-07-13 需求方重整版,非設計稿的舊版)
export const CLUB_NAV: NavGroup[] = [
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
      { key: 'booking-venue', label: '臨時場地借用', path: '/bookings/venue', icon: <EnvironmentOutlined /> },
      { key: 'booking-equipment', label: '器材借用', path: '/bookings/equipment', icon: <AppstoreOutlined /> },
    ],
  },
  {
    label: '線上申請',
    items: [
      { key: 'signup', label: '線上報名', path: '/signup', icon: <FlagOutlined /> },
      { key: 'maintenance', label: '空間報修', path: '/maintenance', icon: <ToolOutlined /> },
      { key: 'postal', label: '郵局帳戶異動', path: '/postal', icon: <BankOutlined /> },
      { key: 'certificate', label: '幹部證明', path: '/certificates', icon: <IdcardOutlined /> },
    ],
  },
  {
    label: '社團評鑑',
    items: [
      { key: 'eval-docs', label: '資料總覽', path: '/eval', icon: <FolderOpenOutlined /> },
      { key: 'eval-result', label: '評鑑結果', path: '/eval/result', icon: <TrophyOutlined /> },
    ],
  },
  {
    label: '其他',
    items: [
      { key: 'violations', label: '違規勸導紀錄', path: '/violations', icon: <WarningOutlined /> },
      ...(fixedBookingOpen
        ? []
        : [{ ...FIXED_BOOKING_ITEM, disabled: true, disabledHint: '未開放申請;固定借用預設於每年 6 月、1 月受理' }]),
    ],
  },
]

export const ADMIN_NAV: NavGroup[] = [
  {
    items: [{ key: 'a-home', label: '總覽', path: '/admin', icon: <DashboardOutlined /> }],
  },
  {
    label: '活動審核',
    items: [
      {
        key: 'a-review',
        label: '活動申請審核',
        path: '/admin/review',
        icon: <AuditOutlined />,
        // ponytail: mock 期由假資料推導;接後端後改為共用 query
        badge: REVIEW_ITEMS.filter((i) => i.status === 'pending_advisor').length,
      },
      { key: 'a-close', label: '結案審核', path: '/admin/close-review', icon: <FileDoneOutlined />, badge: 2 },
    ],
  },
  {
    label: '報名管理',
    items: [
      { key: 'a-signup', label: '報名管理', path: '/admin/signups', icon: <FlagOutlined /> },
      { key: 'a-builder', label: '報名活動建立', path: '/admin/signup-items/new', icon: <PlusSquareOutlined /> },
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
      { key: 'a-room', label: '教室固定借用', path: '/admin/rooms', icon: <ScheduleOutlined /> },
    ],
  },
  {
    label: '社團',
    items: [
      { key: 'a-members', label: '成員管理', path: '/admin/members', icon: <TeamOutlined /> },
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
      { key: 'a-admins', label: '管理員帳號', path: '/admin/accounts/admins', icon: <SolutionOutlined /> },
      { key: 'a-clubs', label: '社團帳號', path: '/admin/accounts/clubs', icon: <ApartmentOutlined /> },
      { key: 'a-viewers', label: '評審老師與指派', path: '/admin/accounts/viewers', icon: <IdcardOutlined /> },
    ],
  },
  {
    label: '其他',
    items: [
      { key: 'a-maintenance', label: '維修管理', path: '/admin/maintenance', icon: <ToolOutlined /> },
      { key: 'a-violations', label: '違規管理', path: '/admin/violations', icon: <WarningOutlined /> },
      { key: 'a-files', label: '檔案管理', path: '/admin/files', icon: <FolderOpenOutlined /> },
      { key: 'a-audit', label: '稽核軌跡', path: '/admin/audit', icon: <HistoryOutlined /> },
    ],
  },
]
