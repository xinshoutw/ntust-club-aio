import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { useMemo, type ReactNode } from 'react'
import { useAuth, type Role } from './app/auth'
import { buildAdminNav, buildClubNav, buildPtNav, buildViewerNav } from './lib/nav'
import { canAccessAdminPath } from './lib/permissions'
import { useFixedWindow } from './api/bookings'
import { useBadges } from './api/badges'
import { homeOf } from './lib/home'
import AppShell from './components/layout/AppShell'
import QueryError from './components/ui/QueryError'
import LoginPage from './features/auth/LoginPage'
import ChangePasswordPage from './features/auth/ChangePasswordPage'
import ComingSoonPage from './features/auth/ComingSoonPage'
import PublicHomePage from './features/public/PublicHomePage'
import OverviewPage from './features/overview/OverviewPage'
import ActivityListPage from './features/activities/ActivityListPage'
import ActivityFormPage from './features/activities/ActivityFormPage'
import ActivityClosePage from './features/activities/ActivityClosePage'
import SignupListPage from './features/signup/SignupListPage'
import SignupFormPage from './features/signup/SignupFormPage'
import ReviewPage from './features/admin/ReviewPage'
import AdminActivitiesPage from './features/admin/AdminActivitiesPage'
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
import ViolationsPage from './features/violations/ViolationsPage'
import AdminHomePage from './features/admin/AdminHomePage'
import CloseReviewPage from './features/admin/CloseReviewPage'
import SignupManagePage from './features/admin/SignupManagePage'
import AnnouncementsPage from './features/admin/AnnouncementsPage'
import AdminBookingsPage from './features/admin/AdminBookingsPage'
import AdminRoomsPage from './features/admin/AdminRoomsPage'
import AdminMembersPage from './features/admin/AdminMembersPage'
import AdminClubActivitiesPage from './features/admin/AdminClubActivitiesPage'
import OverduePage from './features/admin/OverduePage'
import AdminEvalPage from './features/admin/AdminEvalPage'
import AccountsPage from './features/admin/AccountsPage'
import AdminFilesPage from './features/admin/AdminFilesPage'
import AdminCertificatesPage from './features/admin/AdminCertificatesPage'
import AdminPostalPage from './features/admin/AdminPostalPage'
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

// 開機無法確認登入狀態(非 401):不能導去登入頁 —— 那等於告訴使用者「你被登出了」
function BootError({ error, onRetry, retrying }: { error: Error; onRetry: () => void; retrying: boolean }) {
  return (
    <div style={{ maxWidth: 520, margin: '18vh auto 0', padding: '0 24px', textAlign: 'center' }}>
      <QueryError title="無法確認登入狀態" error={error} onRetry={onRetry} retrying={retrying} />
      {/* 只有重試就是死路:這個帳號持續失敗時,能到登入頁就能換帳號重登(用 a 讓整頁重載) */}
      <a href="/login" style={{ display: 'inline-block', marginTop: 14, fontSize: 13 }}>
        改用其他帳號登入
      </a>
    </div>
  )
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, booting, bootError, retryBoot } = useAuth()
  const location = useLocation()
  // bootError 先判:重試期間 booting 又是 true,先判 booting 會讓整頁變白直到請求回來
  if (bootError) return <BootError error={bootError} onRetry={retryBoot} retrying={booting} />
  if (booting) return null // session 恢復中,避免閃現登入頁
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  if (!roles.includes(user.role)) {
    return <Navigate to={homeOf(user.role)} replace />
  }
  return children
}

// 社團端側欄的「固定場地」依後端開放窗顯示或反灰;
// 查詢未完成前先視為未開放,載入後自動更新
function ClubShell() {
  const windowQuery = useFixedWindow()
  const badges = useBadges()
  const nav = useMemo(
    () => buildClubNav(windowQuery.data, windowQuery.isError, badges.data),
    [windowQuery.data, windowQuery.isError, badges.data],
  )
  return <AppShell nav={nav} />
}

// 未登入的首頁是公開的借用情形預覽(Roadmap 的免登入入口);
// 其餘社團頁沒有公開版本,一律照舊轉登入頁
function ClubArea() {
  const { user, booting, bootError } = useAuth()
  const { pathname } = useLocation()
  if (!booting && !bootError && !user && pathname === '/') return <PublicHomePage />
  return (
    <RequireRole roles={['club']}>
      <ClubShell />
    </RequireRole>
  )
}

// 側欄徽章:GET /badges 一次回該角色所有頁面的待辦數;
// 後端已依 permissions 過濾,受限管理員拿不到無權限頁面的數字
function AdminShell() {
  const { user } = useAuth()
  const badges = useBadges()
  const nav = useMemo(() => buildAdminNav(user, badges.data), [user, badges.data])
  return <AppShell nav={nav} badgeLabel="行政後台" />
}

function PtShell() {
  const badges = useBadges()
  const nav = useMemo(() => buildPtNav(badges.data), [badges.data])
  return <AppShell nav={nav} badgeLabel="工讀生" />
}

function ViewerShell() {
  const badges = useBadges()
  const nav = useMemo(() => buildViewerNav(badges.data), [badges.data])
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
          如需使用此功能，請聯絡系統管理員調整帳號權限
        </div>
      </div>
    )
  }
  return <Outlet />
}

// 首登強制改密頁:需已登入,但不受 mustChangePassword 導轉限制
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, booting, bootError, retryBoot } = useAuth()
  if (bootError) return <BootError error={bootError} onRetry={retryBoot} retrying={booting} />
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

      <Route element={<ClubArea />}>
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
          <Route path="activities" element={<AdminActivitiesPage />} />
          <Route path="signups" element={<SignupManagePage />} />
          <Route path="signup-items/new" element={<SignupBuilderPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="bookings" element={<AdminBookingsPage />} />
          <Route path="rooms" element={<AdminRoomsPage />} />
          <Route path="manual-booking" element={<ManualBookingPage />} />
          <Route path="venue-rules" element={<VenueRulesPage />} />
          <Route path="club-overview" element={<ClubOverviewPage />} />
          <Route path="members" element={<AdminMembersPage />} />
          <Route path="club-activities" element={<AdminClubActivitiesPage />} />
          <Route path="club-settings" element={<AdminClubSettingsPage />} />
          <Route path="overdue" element={<OverduePage />} />
          <Route path="eval" element={<AdminEvalPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="certificates" element={<AdminCertificatesPage />} />
          <Route path="postal" element={<AdminPostalPage />} />
          <Route path="maintenance" element={<AdminMaintenancePage />} />
          <Route path="violations" element={<AdminViolationsPage />} />
          <Route path="files" element={<AdminFilesPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="audit" element={<AuditPage />} />
          {/* 工讀生端與評審端的頁面整組再掛一次(權限鍵 astaff / aviewer):
              同一批元件、同一批端點,只是包在行政端外殼裡 */}
          <Route path="pt" element={<Navigate to="/admin/pt/violations/new" replace />} />
          <Route path="pt/violations/new" element={<PtViolationFormPage />} />
          <Route path="pt/violations" element={<PtViolationsPage />} />
          <Route path="pt/checkout" element={<PtCheckoutPage />} />
          <Route path="pt/checkin" element={<PtCheckinPage />} />
          <Route path="pt/overdue" element={<PtOverduePage />} />
          <Route path="viewer" element={<MyReviewsPage />} />
          <Route path="viewer/score" element={<ViewerScorePage />} />
          <Route path="viewer/done" element={<ViewerDonePage />} />
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
