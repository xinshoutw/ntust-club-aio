import { Navigate, Route, Routes, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { useAuth, type Role } from './app/auth'
import { ADMIN_NAV, CLUB_NAV } from './lib/nav'
import AppShell from './components/layout/AppShell'
import PlaceholderPage from './components/ui/PlaceholderPage'
import LoginPage from './features/auth/LoginPage'
import OverviewPage from './features/overview/OverviewPage'
import ActivityListPage from './features/activities/ActivityListPage'
import ActivityFormPage from './features/activities/ActivityFormPage'
import SignupListPage from './features/signup/SignupListPage'
import SignupFormPage from './features/signup/SignupFormPage'
import ReviewPage from './features/admin/ReviewPage'
import SignupBuilderPage from './features/admin/SignupBuilderPage'

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (!roles.includes(user.role)) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireRole roles={['club']}>
            <AppShell nav={CLUB_NAV} />
          </RequireRole>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="activities" element={<ActivityListPage />} />
        <Route path="activities/new" element={<ActivityFormPage />} />
        <Route path="signup" element={<SignupListPage />} />
        <Route path="signup/:id" element={<SignupFormPage />} />
        <Route path="members" element={<PlaceholderPage title="成員列表" />} />
        <Route path="club-settings" element={<PlaceholderPage title="管理項目" />} />
        <Route path="bookings" element={<PlaceholderPage title="借用總覽" />} />
        <Route path="bookings/fixed" element={<PlaceholderPage title="固定場地借用" />} />
        <Route path="bookings/venue" element={<PlaceholderPage title="臨時場地借用" />} />
        <Route path="bookings/equipment" element={<PlaceholderPage title="器材借用" />} />
        <Route path="maintenance" element={<PlaceholderPage title="空間報修" />} />
        <Route path="postal" element={<PlaceholderPage title="郵局帳戶異動" />} />
        <Route path="certificates" element={<PlaceholderPage title="幹部證明" />} />
        <Route path="eval" element={<PlaceholderPage title="資料總覽" />} />
        <Route path="eval/result" element={<PlaceholderPage title="評鑑結果" />} />
        <Route path="violations" element={<PlaceholderPage title="違規勸導紀錄" />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireRole roles={['admin']}>
            <AppShell nav={ADMIN_NAV} badgeLabel="行政後台" />
          </RequireRole>
        }
      >
        <Route index element={<PlaceholderPage title="總覽" />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="close-review" element={<PlaceholderPage title="結案審核" />} />
        <Route path="signups" element={<PlaceholderPage title="報名管理" />} />
        <Route path="signup-items/new" element={<SignupBuilderPage />} />
        <Route path="announcements" element={<PlaceholderPage title="發布系統公告" />} />
        <Route path="bookings" element={<PlaceholderPage title="臨時場地器材借用" />} />
        <Route path="rooms" element={<PlaceholderPage title="教室固定借用" />} />
        <Route path="members" element={<PlaceholderPage title="成員管理" />} />
        <Route path="overdue" element={<PlaceholderPage title="逾期追蹤與停權" />} />
        <Route path="accounts/admins" element={<PlaceholderPage title="管理員帳號" />} />
        <Route path="accounts/clubs" element={<PlaceholderPage title="社團帳號" />} />
        <Route path="accounts/viewers" element={<PlaceholderPage title="評審老師與指派" />} />
        <Route path="maintenance" element={<PlaceholderPage title="維修管理" />} />
        <Route path="violations" element={<PlaceholderPage title="違規管理" />} />
        <Route path="audit" element={<PlaceholderPage title="稽核軌跡" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
