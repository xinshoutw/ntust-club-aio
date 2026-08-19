import { useState } from 'react'
import { App, Button, Checkbox, Input, Modal, Tabs, Tooltip } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { confirmDialog } from '../../lib/confirm'
import { suspendedNow } from '../../lib/status'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, Pager } from '../../components/ui/tableControls'
import OneTimePasswordModal from './OneTimePasswordModal'
import {
  ACCOUNTS_PAGE_SIZE,
  USERNAME_HINT,
  USERNAME_RE,
  useAccountMutations,
  useAccounts,
  type Account,
  type ManagedRole,
} from '../../api/adminAccounts'
import { useAdminClubMutations, useAdminClubs, type AdminClub } from '../../api/adminClubs'
import { useAuth } from '../../app/auth'
import { canAccessAdminPath } from '../../lib/permissions'

// 顯示詞一律取自 session 的目錄表(後端 core/permissions 的頁面權限 + 簽核關卡),
// 前端不留第二份 —— 目錄裡沒有的鍵直接印鍵名,那代表目錄漏了東西
const permsText = (a: Account, catalogue: { key: string; label: string }[]): string => {
  if (a.isSuper) return '全部'
  const labels = a.permissions.map((k) => catalogue.find((p) => p.key === k)?.label ?? k)
  return labels.length ? labels.join('、') : '—'
}

const TAB_ROLE: Record<string, ManagedRole> = { admins: 'admin', staff: 'staff', viewers: 'viewer' }

// 社團 tab:159 社不分頁端點,前端過濾+分頁
const CLUB_PAGE_SIZE = 20

// 社團分頁的啟停是「社團 + 帳號連動」的停用,與前三類的帳號停權不同詞
function ActiveTag({ active, inactiveLabel = '停權' }: { active: boolean; inactiveLabel?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        background: active ? '#E3F2E9' : '#E8EAEE',
        color: active ? '#1F6B45' : '#3A3F4A',
      }}
    >
      {active ? '啟用' : inactiveLabel}
    </span>
  )
}

// 帳號管理合一頁:新增/刪除/停權/重設密碼/權限設定集中於此。
// 社團帳號(建立/重設密碼/啟停用)在「社團」分頁,「社團管理 > 管理項目」亦可維護(/admin/clubs)
export default function AccountsPage() {
  const { message, modal } = App.useApp()
  const [tab, setTab] = useState('admins')

  // 帳號三類各自伺服器端分頁(姓名升冪由後端排);社團分頁走 /admin/clubs,不在此查詢
  const [accountPage, setAccountPage] = useState(1)
  const accountRole: ManagedRole | undefined = TAB_ROLE[tab]
  const accountsQuery = useAccounts(accountRole, accountPage)
  const accountRows = accountsQuery.data?.rows ?? []
  const accountTotal = accountsQuery.data?.total ?? 0
  // 未啟用的查詢恆為 isPending:社團分頁不該因此一直轉圈
  const accountsLoading = accountRole != null && accountsQuery.isPending
  const { create, remove, setActive, resetPassword, setPermissions } = useAccountMutations()

  // 社團 tab:資料與動作走 /admin/clubs(啟停=社團與帳號一併連動,語意與上三類的純帳號停權不同)
  const clubsQuery = useAdminClubs()
  const clubs = clubsQuery.data ?? []
  const clubMutations = useAdminClubMutations()
  const [clubSearch, setClubSearch] = useState('')
  const [clubPage, setClubPage] = useState(1)
  // 建立社團帳號彈窗(open+afterClose 常駐)
  const [clubAccountTarget, setClubAccountTarget] = useState<AdminClub | null>(null)
  const [clubAccountOpen, setClubAccountOpen] = useState(false)
  const [clubUsername, setClubUsername] = useState('')

  // 一次性密碼彈窗:密碼由後端於建立/重設當次回傳,關閉後不再顯示
  const [pwTarget, setPwTarget] = useState<{ title: string; account: string; password: string } | null>(null)
  const [pwOpen, setPwOpen] = useState(false)
  // 頁面權限目錄由 session 帶來(後端 core/permissions);前端不維護第二份
  const { user: me } = useAuth()
  const adminPages = me?.adminPages ?? []
  // 簽核關卡與頁面權限一起在這個彈窗授出:少了它,正式庫沒有任何人簽得了學務長關
  const approvalStages = me?.approvalStages ?? []
  const grantKeys = [...adminPages, ...approvalStages]
  const pageKeySet = new Set(grantKeys.map((p) => p.key))
  // 非最高權限只授得出自己也持有的鍵(後端 _check_grantable 同一條規則),
  // 勾不到的直接反灰,不要讓人按了儲存才吃 403
  const grantable = (key: string) => me?.isSuper === true || me?.permissions.includes(key) === true
  // 社團分頁的三個動作打的是 /admin/clubs 的寫入端點,歸「社團管理項目」
  const canClubSettings = canAccessAdminPath(me, '/admin/club-settings')

  // 權限設定彈窗:草稿受控,按「儲存」才生效;未存關閉須確認
  const [permTarget, setPermTarget] = useState<Account | null>(null)
  const [permOpen, setPermOpen] = useState(false)
  const [permDraft, setPermDraft] = useState<string[]>([])
  // 新增帳號彈窗(依分頁角色)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAccount, setNewAccount] = useState('')

  const roleLabel =
    tab === 'admins' ? '管理員' : tab === 'staff' ? '工讀生' : tab === 'viewers' ? '評審' : '社團'

  const showPassword = (title: string, account: string, password: string) => {
    setPwTarget({ title, account, password })
    setPwOpen(true)
  }

  const confirmDelete = (a: Account) =>
    confirmDialog(modal, {
      title: `刪除帳號 ${a.name}`,
      content: '確認刪除後將無法復原',
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        remove.mutate(a.id, {
          onSuccess: () => {
            message.success(`已刪除 ${a.name}(${a.username})`)
            // 刪掉的是本頁最後一列時退回前一頁,不要停在空白頁
            if (accountRows.length === 1 && accountPage > 1) setAccountPage(accountPage - 1)
          },
          onError: (e) => message.error(e.message),
        })
      },
    })

  const toggleActive = (a: Account) => {
    if (a.active) {
      confirmDialog(modal, {
        title: `停權 ${a.name}`,
        content: '停權後無法登入，可隨時恢復',
        okText: '確認',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => {
          setActive.mutate(
            { id: a.id, active: false },
            {
              onSuccess: () => message.success(`已停權 ${a.name}`),
              onError: (e) => message.error(e.message),
            },
          )
        },
      })
    } else {
      setActive.mutate(
        { id: a.id, active: true },
        {
          onSuccess: () => message.success(`已恢復 ${a.name} 的帳號`),
          onError: (e) => message.error(e.message),
        },
      )
    }
  }

  // 重設密碼:先確認(取消不重設),成功後顯示後端回傳的一次性密碼
  const askResetPassword = (a: Account) =>
    confirmDialog(modal, {
      title: `重設密碼 — ${a.name}`,
      content: '原密碼立即失效，並須於首次登入時變更密碼',
      okText: '確認重設',
      cancelText: '取消',
      onOk: () => {
        resetPassword.mutate(a.id, {
          onSuccess: ({ password }) => showPassword(`已重設密碼 — ${a.name}`, a.username, password),
          onError: (e) => message.error(e.message),
        })
      },
    })

  const createAccount = () => {
    // 社團分頁無此彈窗(建立走列上動作);防禦性擋下 role=undefined 的送出
    const role = TAB_ROLE[tab]
    if (!role) return
    const name = newName.trim()
    const username = newAccount.trim()
    if (!name) {
      message.error('請輸入姓名')
      return
    }
    if (!USERNAME_RE.test(username)) {
      message.error(USERNAME_HINT)
      return
    }
    create.mutate(
      { role, name, username },
      {
        onSuccess: ({ account, password }) => {
          setCreateOpen(false)
          setNewName('')
          setNewAccount('')
          // 建立後直接顯示帳號與一次性密碼
          showPassword(`已建立${roleLabel}帳號 — ${account.name}`, account.username, password)
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  // ---- 社團 tab 動作(走 /admin/clubs;語意=社團與其帳號連動) ----

  const askResetClubPassword = (c: AdminClub) =>
    confirmDialog(modal, {
      title: `重設 ${c.name} 的密碼`,
      content: '將產生一次性密碼並登出該帳號所有裝置;社團下次登入須立即更改密碼',
      okText: '確認重設',
      cancelText: '取消',
      onOk: () => {
        clubMutations.resetPassword.mutate(c.id, {
          onSuccess: (password) =>
            showPassword(`已重設密碼 — ${c.name}`, c.username ?? '', password),
          onError: (e) => message.error(e.message),
        })
      },
    })

  const toggleClubActive = (c: AdminClub) => {
    if (c.isActive) {
      confirmDialog(modal, {
        title: `停用 ${c.name}`,
        content: '社團停權後無法登入，隨時可以恢復',
        okText: '確認停用',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => {
          clubMutations.update.mutate(
            { id: c.id, isActive: false },
            {
              onSuccess: () => message.success(`已停權 ${c.name}`),
              onError: (e) => message.error(e.message),
            },
          )
        },
      })
    } else {
      clubMutations.update.mutate(
        { id: c.id, isActive: true },
        {
          onSuccess: () => message.success(`已啟用 ${c.name}`),
          onError: (e) => message.error(e.message),
        },
      )
    }
  }

  const openClubAccountModal = (c: AdminClub) => {
    setClubAccountTarget(c)
    setClubUsername('')
    setClubAccountOpen(true)
  }

  const submitClubAccount = () => {
    // 同上:Enter 走 onPressEnter 直接進來,confirmLoading 攔不到
    if (clubMutations.createAccount.isPending) return
    if (!clubAccountTarget) return
    const username = clubUsername.trim()
    if (!USERNAME_RE.test(username)) {
      message.error(USERNAME_HINT)
      return
    }
    clubMutations.createAccount.mutate(
      { id: clubAccountTarget.id, username },
      {
        onSuccess: ({ username: account, password }) => {
          setClubAccountOpen(false)
          showPassword(`已建立社團帳號 — ${clubAccountTarget.name}`, account, password)
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  const accountPager = (
    <Pager
      page={accountPage}
      pageSize={ACCOUNTS_PAGE_SIZE}
      total={accountTotal}
      onChange={setAccountPage}
    />
  )

  const actions = (a: Account, extra?: React.ReactNode) => (
    <td className="r" style={{ whiteSpace: 'nowrap' }}>
      {extra}
      <button type="button" className="link-btn" onClick={() => askResetPassword(a)}>
        重設密碼
      </button>
      <button type="button" className="link-btn" onClick={() => toggleActive(a)}>
        {a.active ? '停權' : '恢復'}
      </button>
      <button type="button" className="link-btn danger" onClick={() => confirmDelete(a)}>
        刪除
      </button>
    </td>
  )

  // 查詢失敗顯示錯誤與重試;空狀態僅在非錯誤時呈現,避免「查詢失敗=空表」誤導
  const errorRow = (colSpan: number) =>
    accountsQuery.isError && (
      <tr className="no-hover">
        <td colSpan={colSpan}>
          <QueryError
            compact
            title="帳號列表載入失敗"
            error={accountsQuery.error}
            onRetry={() => accountsQuery.refetch()}
          />
        </td>
      </tr>
    )

  const emptyRow = (colSpan: number) =>
    !accountsLoading && !accountsQuery.isError && (
      <tr className="no-hover">
        <td colSpan={colSpan} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
          尚無{roleLabel}帳號
        </td>
      </tr>
    )

  const adminsTable = (
    <>
    <LoadingBlock pending={accountsLoading} rows={6}>
    <table className="tb fixed" style={{ minWidth: 760 }}>
      {/* 頁面權限吃剩餘寬且允許換行;姓名/帳號截斷;層級/狀態/動作固定 px */}
      <Cols widths={['13%', 110, 90, 'auto', 84, 216]} />
      <thead>
        <tr><th scope="col">姓名</th><th scope="col">帳號</th><th scope="col">權限層級</th><th scope="col">頁面權限</th><th scope="col">狀態</th><th scope="col" className="r">動作</th></tr>
      </thead>
      <tbody>
        {accountRows.map((a) => (
          <tr key={a.id}>
            <td className="cell-clip" title={a.name} style={{ fontWeight: 500 }}>{a.name}</td>
            <td className="num cell-clip" title={a.username} style={{ color: 'var(--steel)' }}>{a.username}</td>
            <td>{a.isSuper ? '最高權限' : '一般'}</td>
            <td style={{ fontSize: 13, color: 'var(--steel)' }}>{permsText(a, grantKeys)}</td>
            <td><ActiveTag active={a.active} /></td>
            {actions(
              a,
              !a.isSuper && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setPermTarget(a)
                    setPermDraft(a.permissions.filter((k) => pageKeySet.has(k)))
                    setPermOpen(true)
                  }}
                >
                  權限
                </button>
              ),
            )}
          </tr>
        ))}
        {errorRow(6)}
        {accountRows.length === 0 && emptyRow(6)}
      </tbody>
    </table>
    </LoadingBlock>
      {accountPager}
    </>
  )

  const staffTable = (
    <>
    <LoadingBlock pending={accountsLoading} rows={6}>
    <table className="tb fixed" style={{ minWidth: 560 }}>
      <Cols widths={['24%', 'auto', 84, 178]} />
      <thead>
        <tr><th scope="col">姓名</th><th scope="col">帳號</th><th scope="col">狀態</th><th scope="col" className="r">動作</th></tr>
      </thead>
      <tbody>
        {accountRows.map((a) => (
          <tr key={a.id}>
            <td className="cell-clip" title={a.name} style={{ fontWeight: 500 }}>{a.name}</td>
            <td className="num cell-clip" title={a.username} style={{ color: 'var(--steel)' }}>{a.username}</td>
            <td><ActiveTag active={a.active} /></td>
            {actions(a)}
          </tr>
        ))}
        {errorRow(4)}
        {accountRows.length === 0 && emptyRow(4)}
      </tbody>
    </table>
    </LoadingBlock>
      {accountPager}
    </>
  )

  // 負責獎項/分組資料由「分組與評審指派」功能管理(後端尚未提供),先以 — 佔位
  const viewersTable = (
    <>
    <LoadingBlock pending={accountsLoading} rows={6}>
    <table className="tb fixed" style={{ minWidth: 760 }}>
      <Cols widths={['14%', '16%', 'auto', 90, 84, 178]} />
      <thead>
        <tr><th scope="col">評審</th><th scope="col">帳號</th><th scope="col">負責獎項</th><th scope="col">分組</th><th scope="col">狀態</th><th scope="col" className="r">動作</th></tr>
      </thead>
      <tbody>
        {accountRows.map((a) => (
          <tr key={a.id}>
            <td className="cell-clip" title={a.name} style={{ fontWeight: 500 }}>{a.name}</td>
            <td className="num cell-clip" title={a.username} style={{ color: 'var(--steel)' }}>{a.username}</td>
            <td style={{ fontSize: 13, color: 'var(--muted)' }}>—</td>
            <td style={{ fontSize: 13, color: 'var(--muted)' }}>—</td>
            <td><ActiveTag active={a.active} /></td>
            {actions(a)}
          </tr>
        ))}
        {errorRow(6)}
        {accountRows.length === 0 && emptyRow(6)}
      </tbody>
    </table>
    </LoadingBlock>
      {accountPager}
    </>
  )

  // ---- 社團 tab:前端過濾(社團名/帳號)+ client 分頁 ----
  const clubKeyword = clubSearch.trim().toLowerCase()
  const filteredClubs = clubKeyword
    ? clubs.filter(
        (c) =>
          c.name.toLowerCase().includes(clubKeyword) ||
          (c.username ?? '').toLowerCase().includes(clubKeyword),
      )
    : clubs
  // 過濾造成頁數縮減時鉗回最末頁,避免停在空白頁
  const clubPageSafe = Math.min(
    clubPage,
    Math.max(1, Math.ceil(filteredClubs.length / CLUB_PAGE_SIZE)),
  )
  const pagedClubs = filteredClubs.slice(
    (clubPageSafe - 1) * CLUB_PAGE_SIZE,
    clubPageSafe * CLUB_PAGE_SIZE,
  )

  const clubsTable = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="搜尋社團名稱或帳號"
          style={{ width: 260 }}
          value={clubSearch}
          onChange={(e) => {
            setClubSearch(e.target.value)
            setClubPage(1)
          }}
        />
      </div>
      <LoadingBlock pending={clubsQuery.isPending} rows={6}>
      <table className="tb fixed" style={{ minWidth: 760 }}>
        <Cols widths={['auto', 110, '20%', 140, 160]} />
        <thead>
          <tr><th scope="col">社團名稱</th><th scope="col">性質</th><th scope="col">帳號</th><th scope="col">狀態</th><th scope="col" className="r">動作</th></tr>
        </thead>
        <tbody>
          {pagedClubs.map((c) => (
            <tr key={c.id}>
              <td className="cell-clip" title={c.name} style={{ fontWeight: 500 }}>{c.name}</td>
              <td style={{ fontSize: 13, color: 'var(--steel)' }}>{c.attribute ?? '—'}</td>
              <td className="cell-clip" title={c.username ?? undefined}>
                {c.username != null ? (
                  <span className="num" style={{ color: 'var(--steel)' }}>{c.username}</span>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>尚未建立</span>
                )}
              </td>
              <td>
                <ActiveTag active={c.isActive} inactiveLabel="停用" />
                {/* 停權(器材逾期)與帳號啟停是兩回事:停權中但仍啟用的社團在這裡本來看起來完全正常 */}
                {suspendedNow(c.suspendedUntil) && (
                  <Tooltip title="停權中，期間不得申請借用">
                    <div className="num" style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>
                      停權至 {c.suspendedUntil}
                    </div>
                  </Tooltip>
                )}
              </td>
              <td className="r" style={{ whiteSpace: 'nowrap' }}>
                {/* 這三個動作歸「社團管理項目」那把鍵(decisions.md ISS-25);
                    沒有就反灰,不要讓人按了才吃 403 —— 與本頁權限勾選框同一條規則 */}
                <Tooltip title={canClubSettings ? undefined : '需要「社團管理項目」權限'}>
                  <span>
                    {c.username != null ? (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={!canClubSettings}
                        onClick={() => askResetClubPassword(c)}
                      >
                        重設密碼
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={!canClubSettings}
                        onClick={() => openClubAccountModal(c)}
                      >
                        建立帳號
                      </button>
                    )}
                    <button
                      type="button"
                      className="link-btn"
                      disabled={!canClubSettings}
                      onClick={() => toggleClubActive(c)}
                    >
                      {c.isActive ? '停權' : '恢復'}
                    </button>
                  </span>
                </Tooltip>
              </td>
            </tr>
          ))}
          {clubsQuery.isError && (
            <tr className="no-hover">
              <td colSpan={5}>
                <QueryError
                  compact
                  title="社團列表載入失敗"
                  error={clubsQuery.error}
                  onRetry={() => clubsQuery.refetch()}
                />
              </td>
            </tr>
          )}
          {!clubsQuery.isPending && !clubsQuery.isError && filteredClubs.length === 0 && (
            <tr className="no-hover">
              <td colSpan={5} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                {clubKeyword ? '沒有符合搜尋的社團' : '尚無社團資料'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </LoadingBlock>
      <Pager
        page={clubPageSafe}
        pageSize={CLUB_PAGE_SIZE}
        total={filteredClubs.length}
        onChange={setClubPage}
      />
    </div>
  )

  return (
    <div>
      <PageHeader
        title="帳號管理"
        extra={
          // 社團 tab 不提供「+ 新增」:建立帳號走列上動作(僅無帳號社團)
          tab !== 'clubs' && (
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              + 新增{roleLabel}
            </Button>
          )
        }
      />

      <div className="card" style={{ marginTop: 16, overflowX: 'auto', paddingTop: 8 }}>
        {/* Skeleton 收在各分頁內:分頁列本身不隨查詢消失,否則換角色/換頁時看不到自己在哪一頁 */}
        <Tabs
          activeKey={tab}
          onChange={(next) => {
            setTab(next)
            setAccountPage(1) // 換分頁=換角色,頁碼不共用
          }}
          style={{ padding: '0 20px' }}
          items={[
            { key: 'admins', label: '管理員', children: adminsTable },
            { key: 'staff', label: '工讀生', children: staffTable },
            { key: 'viewers', label: '評審', children: viewersTable },
            { key: 'clubs', label: '社團', children: clubsTable },
          ]}
        />
      </div>

      {/* 新增帳號:建立後顯示帳號與一次性密碼;destroyOnHidden+取消清空,重開不殘留 */}
      <Modal
        open={createOpen}
        title={`新增${roleLabel}`}
        okText="建立帳號"
        cancelText="取消"
        destroyOnHidden
        confirmLoading={create.isPending}
        onOk={createAccount}
        onCancel={() => {
          setCreateOpen(false)
          setNewName('')
          setNewAccount('')
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              <span style={{ color: '#C13B34' }}>*</span> 姓名
            </div>
            <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              <span style={{ color: '#C13B34' }}>*</span> 帳號
            </div>
            <Input className="num" value={newAccount} onChange={(e) => setNewAccount(e.target.value)} placeholder={USERNAME_HINT} />
          </div>
        </div>
      </Modal>

      {/* 權限設定(一般管理員):變更的項目以橘框標示,按「儲存」才生效 */}
      {(() => {
        const original = permTarget ? permTarget.permissions.filter((k) => pageKeySet.has(k)) : []
        // 目錄以外的既有鍵不受此彈窗管理,儲存時原樣保留
        const extraKeys = permTarget ? permTarget.permissions.filter((k) => !pageKeySet.has(k)) : []
        const permDirty =
          permDraft.length !== original.length || permDraft.some((k) => !original.includes(k))
        const closePerm = () => {
          if (!permDirty) {
            setPermOpen(false)
            return
          }
          confirmDialog(modal, {
            title: '尚有未儲存的變更',
            content: '離開將會遺失所做的權限調整',
            okText: '放棄變更並離開',
            okButtonProps: { danger: true },
            cancelText: '留在此頁',
            onOk: () => setPermOpen(false),
          })
        }
        return (
          <Modal
            open={permOpen}
            afterClose={() => setPermTarget(null)}
            title={`頁面權限 — ${permTarget?.name ?? ''}`}
            okText="儲存"
            cancelText="取消"
            confirmLoading={setPermissions.isPending}
            onOk={() => {
              if (!permTarget) return
              setPermissions.mutate(
                { id: permTarget.id, permissions: [...extraKeys, ...permDraft] },
                {
                  onSuccess: () => {
                    setPermOpen(false)
                    message.success(`已更新 ${permTarget.name} 的權限`)
                  },
                  onError: (e) => message.error(e.message),
                },
              )
            }}
            onCancel={closePerm}
            footer={(node) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {permDirty && <span style={{ fontSize: 12, color: '#8A5A00' }}>尚未儲存</span>}
                <div style={{ flex: 1 }} />
                {node}
              </div>
            )}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              {grantKeys.map(({ key: value, label }) => {
                const changed = permDraft.includes(value) !== original.includes(value)
                const locked = !grantable(value) && !original.includes(value)
                return (
                  <label
                    key={value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 8px',
                      borderRadius: 6,
                      cursor: locked ? 'not-allowed' : 'pointer',
                      border: changed ? '1px solid #d48806' : '1px solid transparent',
                      boxShadow: changed ? '0 0 0 1px rgba(212, 136, 6, 0.45)' : undefined,
                    }}
                    title={locked ? '你沒有權限' : undefined}
                  >
                    <Checkbox
                      checked={permDraft.includes(value)}
                      disabled={locked}
                      onChange={(e) =>
                        setPermDraft((d) => (e.target.checked ? [...d, value] : d.filter((k) => k !== value)))
                      }
                    />
                    <span style={{ fontSize: 13, color: locked ? 'var(--steel)' : undefined }}>
                      {label}
                    </span>
                  </label>
                )
              })}
            </div>
          </Modal>
        )
      })()}

      {/* 建立社團帳號:僅無帳號社團;成功後顯示帳號與一次性密碼 */}
      <Modal
        open={clubAccountOpen}
        afterClose={() => setClubAccountTarget(null)}
        title={`建立社團帳號 — ${clubAccountTarget?.name ?? ''}`}
        okText="建立帳號"
        cancelText="取消"
        destroyOnHidden
        confirmLoading={clubMutations.createAccount.isPending}
        onOk={submitClubAccount}
        onCancel={() => setClubAccountOpen(false)}
      >
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            <span style={{ color: '#C13B34' }}>*</span> 帳號
          </div>
          <Input
            autoFocus
            className="num"
            value={clubUsername}
            onChange={(e) => setClubUsername(e.target.value)}
            onPressEnter={submitClubAccount}
            placeholder={USERNAME_HINT}
          />
          <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 8 }}>
            建立後將產生一次性密碼
          </div>
        </div>
      </Modal>

      {pwTarget && (
        <OneTimePasswordModal
          key={pwTarget.account}
          title={pwTarget.title}
          account={pwTarget.account}
          password={pwTarget.password}
          open={pwOpen}
          onClose={() => setPwOpen(false)}
          afterClose={() => setPwTarget(null)}
        />
      )}
    </div>
  )
}
