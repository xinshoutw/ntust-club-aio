import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { useMemo, type ReactNode } from 'react'
import { useAuth, type Role } from './app/auth'
import { buildAdminNav, buildClubNav, buildPtNav, buildViewerNav } from './lib/nav'
import { canAccessAdminPath } from './lib/permissions'
import { useFixedWindow } from './api/bookings'
import { usePendingActivityTotal, usePendingCloseTotal } from './api/adminActivities'
import { homeOf } from './lib/home'
import AppShell from './components/layout/AppShell'
import LoginPage from './features/auth/LoginPage'
import ChangePasswordPage from './features/auth/ChangePasswordPage'
import ComingSoonPage from './features/auth/ComingSoonPage'
import OverviewPage from './features/overview/OverviewPage'
import ActivityListPage from './features/activities/ActivityListPage'
import ActivityFormPage from './features/activities/ActivityFormPage'
import ActivityClosePage from './features/activities/ActivityClosePage'
import SignupListPage from './features/signup/SignupListPage'
import SignupFormPage from './features/signup/SignupFormPage'
import ReviewPage from './features/admin/ReviewPage'
import ClubOverviewPage from './features/admin/ClubOverviewPage'
import AdminClubSettingsPage from './features/admin/AdminClubSettingsPage'
import { AdminClubProvider } from './features/admin/clubContext'
import SignupBuilderPage from './features/admin/SignupBuilderPage'
import MembersPage from './features/members/MembersPage'
import ClubSettingsPage from './features/club-settings/ClubSettingsPage'
import BookingOverviewPage from './features/bookings/BookingOverviewPage'
import FixedRoomPage from './features/bookings/FixedRoomPage'
import VenueBookingPage from './features/bookings/VenueBookingPage'
import EquipmentPage from './features/bookings/EquipmentPage'
import MaintenancePage from './features/applications/MaintenancePage'
import PostalPage from './features/applications/PostalPage'
import CertificatePage from './features/applications/CertificatePage'
import EvalDocsPage from './features/eval/EvalDocsPage'
import AwardDetailPage from './features/eval/AwardDetailPage'
import EvalResultPage from './features/eval/EvalResultPage'
import ViolationsPage from './features/violations/ViolationsPage'
import AdminHomePage from './features/admin/AdminHomePage'
import CloseReviewPage from './features/admin/CloseReviewPage'
import SignupManagePage from './features/admin/SignupManagePage'
import AnnouncementsPage from './features/admin/AnnouncementsPage'
import AdminBookingsPage from './features/admin/AdminBookingsPage'
import AdminRoomsPage from './features/admin/AdminRoomsPage'
import AdminMembersPage from './features/admin/AdminMembersPage'
import OverduePage from './features/admin/OverduePage'
import AdminEvalPage from './features/admin/AdminEvalPage'
import AccountsPage from './features/admin/AccountsPage'
import AdminFilesPage from './features/admin/AdminFilesPage'
import AdminApplicationsPage from './features/admin/AdminApplicationsPage'
import AdminMaintenancePage from './features/admin/AdminMaintenancePage'
import PtViolationFormPage from './features/pt/PtViolationFormPage'
import PtViolationsPage from './features/pt/PtViolationsPage'
import PtCheckoutPage from './features/pt/PtCheckoutPage'
import PtCheckinPage from './features/pt/PtCheckinPage'
import PtOverduePage from './features/pt/PtOverduePage'
import MyReviewsPage from './features/viewer/MyReviewsPage'
import ViewerScorePage from './features/viewer/ViewerScorePage'
import ViewerDonePage from './features/viewer/ViewerDonePage'
import AdminSettingsPage from './features/admin/AdminSettingsPage'
import ManualBookingPage from './features/admin/ManualBookingPage'
import VenueRulesPage from './features/admin/VenueRulesPage'
import AdminViolationsPage from './features/admin/AdminViolationsPage'
import AuditPage from './features/admin/AuditPage'

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, booting } = useAuth()
  const location = useLocation()
  if (booting) return null // session 恢復中,避免閃現登入頁
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  if (!roles.includes(user.role)) {
    return <Navigate to={homeOf(user.role)} replace />
  }
  return children
}

// 社團端側欄的「固定場地」依後端開放窗顯示/反灰(nav 原為模組常數,改由查詢結果組合);
// 查詢未完成前先視為未開放,載入後自動更新
function ClubShell() {
  const windowQuery = useFixedWindow()
  const nav = useMemo(() => buildClubNav(windowQuery.data), [windowQuery.data])
  return <AppShell nav={nav} />
}

// 行政端側欄徽章=申請/結案待審數(共用審核頁查詢);
// 側欄項目與徽章查詢皆依 permissions 過濾,受限管理員不再看到整排 403 頁
function AdminShell() {
  const { user } = useAuth()
  const pendingReview = usePendingActivityTotal(canAccessAdminPath(user, '/admin/review'))
  const pendingClose = usePendingCloseTotal(canAccessAdminPath(user, '/admin/close-review'))
  const nav = useMemo(
    () => buildAdminNav(user, pendingReview.data, pendingClose.data),
    [user, pendingReview.data, pendingClose.data],
  )
  return <AppShell nav={nav} badgeLabel="行政後台" />
}

function PtShell() {
  const nav = useMemo(() => buildPtNav(), [])
  return <AppShell nav={nav} badgeLabel="工讀生" />
}

function ViewerShell() {
  const nav = useMemo(() => buildViewerNav(), [])
  return <AppShell nav={nav} badgeLabel="評審" />
}

// admin 子路由的權限 gate:無權限時就地說明,不悄悄導走(避免誤會系統壞掉)
function AdminPermissionGate() {
  const { user } = useAuth()
  const location = useLocation()
  if (!canAccessAdminPath(user, location.pathname)) {
    return (
      <div className="card" style={{ marginTop: 20, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>您沒有此頁面的存取權限</div>
        <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 8 }}>
          如需使用此功能,請聯絡系統管理員調整帳號權限
        </div>
      </div>
    )
  }
  return <Outlet />
}

// 首登強制改密頁:需已登入,但不受 mustChangePassword 導轉限制
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, booting } = useAuth()
  if (booting) return null
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePasswordPage />
          </RequireAuth>
        }
      />
      <Route
        path="/coming-soon"
        element={
          <RequireAuth>
            <ComingSoonPage />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireRole roles={['club']}>
            <ClubShell />
          </RequireRole>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="activities" element={<ActivityListPage />} />
        <Route path="activities/new" element={<ActivityFormPage />} />
        <Route path="activities/:id/edit" element={<ActivityFormPage />} />
        <Route path="activities/close" element={<ActivityClosePage />} />
        <Route path="signup" element={<SignupListPage />} />
        <Route path="signup/:id" element={<SignupFormPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="club-settings" element={<ClubSettingsPage />} />
        <Route path="bookings" element={<BookingOverviewPage />} />
        <Route path="bookings/fixed" element={<FixedRoomPage />} />
        <Route path="bookings/venue" element={<VenueBookingPage />} />
        <Route path="bookings/equipment" element={<EquipmentPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="postal" element={<PostalPage />} />
        <Route path="certificates" element={<CertificatePage />} />
        <Route path="eval" element={<EvalDocsPage />} />
        <Route path="eval/award/:award" element={<AwardDetailPage />} />
        <Route path="eval/result" element={<EvalResultPage />} />
        <Route path="violations" element={<ViolationsPage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireRole roles={['admin']}>
            {/* 行政端共用「選擇社團」狀態,跨頁同步 */}
            <AdminClubProvider>
              <AdminShell />
            </AdminClubProvider>
          </RequireRole>
        }
      >
        <Route element={<AdminPermissionGate />}>
          <Route index element={<AdminHomePage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="close-review" element={<CloseReviewPage />} />
          <Route path="signups" element={<SignupManagePage />} />
          <Route path="signup-items/new" element={<SignupBuilderPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="bookings" element={<AdminBookingsPage />} />
          <Route path="rooms" element={<AdminRoomsPage />} />
          <Route path="manual-booking" element={<ManualBookingPage />} />
          <Route path="venue-rules" element={<VenueRulesPage />} />
          <Route path="club-overview" element={<ClubOverviewPage />} />
          <Route path="members" element={<AdminMembersPage />} />
          <Route path="club-settings" element={<AdminClubSettingsPage />} />
          <Route path="overdue" element={<OverduePage />} />
          <Route path="eval" element={<AdminEvalPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="applications" element={<AdminApplicationsPage />} />
          <Route path="maintenance" element={<AdminMaintenancePage />} />
          <Route path="violations" element={<AdminViolationsPage />} />
          <Route path="files" element={<AdminFilesPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
      </Route>

      {/* 工讀生端(基礎原型;現行 role 代號 staff,之後隨後端改 pt) */}
      <Route
        path="/pt"
        element={
          <RequireRole roles={['staff']}>
            <PtShell />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="/pt/violations/new" replace />} />
        <Route path="violations/new" element={<PtViolationFormPage />} />
        <Route path="violations" element={<PtViolationsPage />} />
        <Route path="checkout" element={<PtCheckoutPage />} />
        <Route path="checkin" element={<PtCheckinPage />} />
        <Route path="overdue" element={<PtOverduePage />} />
      </Route>

      {/* 評審端 */}
      <Route
        path="/viewer"
        element={
          <RequireRole roles={['viewer']}>
            <ViewerShell />
          </RequireRole>
        }
      >
        <Route index element={<MyReviewsPage />} />
        <Route path="score" element={<ViewerScorePage />} />
        <Route path="done" element={<ViewerDonePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
