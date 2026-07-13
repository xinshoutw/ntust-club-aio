import { Navigate, Route, Routes, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { useAuth, type Role } from './app/auth'
import { ADMIN_NAV, CLUB_NAV } from './lib/nav'
import AppShell from './components/layout/AppShell'
import LoginPage from './features/auth/LoginPage'
import OverviewPage from './features/overview/OverviewPage'
import ActivityListPage from './features/activities/ActivityListPage'
import ActivityFormPage from './features/activities/ActivityFormPage'
import SignupListPage from './features/signup/SignupListPage'
import SignupFormPage from './features/signup/SignupFormPage'
import ReviewPage from './features/admin/ReviewPage'
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
import { AdminAccountsPage, ClubAccountsPage, ViewerAccountsPage } from './features/admin/AccountsPage'
import AdminMaintenancePage from './features/admin/AdminMaintenancePage'
import AdminViolationsPage from './features/admin/AdminViolationsPage'
import AuditPage from './features/admin/AuditPage'

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
        <Route path="eval/result" element={<EvalResultPage />} />
        <Route path="violations" element={<ViolationsPage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireRole roles={['admin']}>
            <AppShell nav={ADMIN_NAV} badgeLabel="行政後台" />
          </RequireRole>
        }
      >
        <Route index element={<AdminHomePage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="close-review" element={<CloseReviewPage />} />
        <Route path="signups" element={<SignupManagePage />} />
        <Route path="signup-items/new" element={<SignupBuilderPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="bookings" element={<AdminBookingsPage />} />
        <Route path="rooms" element={<AdminRoomsPage />} />
        <Route path="members" element={<AdminMembersPage />} />
        <Route path="overdue" element={<OverduePage />} />
        <Route path="accounts/admins" element={<AdminAccountsPage />} />
        <Route path="accounts/clubs" element={<ClubAccountsPage />} />
        <Route path="accounts/viewers" element={<ViewerAccountsPage />} />
        <Route path="maintenance" element={<AdminMaintenancePage />} />
        <Route path="violations" element={<AdminViolationsPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
