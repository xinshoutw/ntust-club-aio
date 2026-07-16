import { useState } from 'react'
import { App, Button, Checkbox, Input, Modal, Spin, Tabs } from 'antd'
import { confirmDialog } from '../../lib/confirm'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import OneTimePasswordModal from './OneTimePasswordModal'
import {
  USERNAME_HINT,
  USERNAME_RE,
  useAccountMutations,
  useAccounts,
  type Account,
  type ManagedRole,
} from '../../api/adminAccounts'

// 頁面權限鍵(與後端 permissions 對齊;super 不受限)
const PERMISSION_KEYS = [
  ['areview', '申請審核'],
  ['aclose', '結案審核'],
  ['asignup', '活動管理'],
  ['aannounce', '發布公告'],
  ['abooking', '臨時場地器材借用審核'],
  ['aroom', '教室固定借用審核'],
  ['amember', '社團管理'],
  ['aeval', '行政分審核'],
  ['amaint', '維修管理'],
  ['aviol', '違規管理'],
  ['afiles', '檔案管理'],
] as const

const PAGE_KEY_SET = new Set<string>(PERMISSION_KEYS.map(([k]) => k))

// 權限彈窗以外的既有鍵(簽核關卡等)僅供顯示;儲存時原樣保留
const EXTRA_KEY_LABELS: Record<string, string> = {
  approve_advisor: '輔導老師簽核',
  approve_chief: '組長簽核',
  approve_dean: '學務長簽核',
  aact: '活動管理(舊鍵)',
  areg: '報名管理(舊鍵)',
}

const permsText = (a: Account): string => {
  if (a.isSuper) return '全部'
  const labels = a.permissions.map(
    (k) => PERMISSION_KEYS.find(([key]) => key === k)?.[1] ?? EXTRA_KEY_LABELS[k] ?? k,
  )
  return labels.length ? labels.join('、') : '—'
}

const TAB_ROLE: Record<string, ManagedRole> = { admins: 'admin', staff: 'staff', viewers: 'viewer' }

function ActiveTag({ active }: { active: boolean }) {
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
      {active ? '啟用' : '停權'}
    </span>
  )
}

// 帳號管理合一頁:新增/刪除/停權/重設密碼/權限設定集中於此(社團帳號在「社團管理 > 管理項目」)
export default function AccountsPage() {
  const { message, modal } = App.useApp()
  const [tab, setTab] = useState('admins')

  const accountsQuery = useAccounts()
  const accounts = accountsQuery.data ?? []
  const admins = accounts.filter((a) => a.role === 'admin')
  const staff = accounts.filter((a) => a.role === 'staff')
  const viewers = accounts.filter((a) => a.role === 'viewer')
  const { create, remove, setActive, resetPassword, setPermissions } = useAccountMutations()

  // 一次性密碼彈窗:密碼由後端於建立/重設當次回傳,關閉後不再顯示
  const [pwTarget, setPwTarget] = useState<{ title: string; account: string; password: string } | null>(null)
  const [pwOpen, setPwOpen] = useState(false)
  // 權限設定彈窗:草稿受控,按「儲存」才生效;未存關閉須確認
  const [permTarget, setPermTarget] = useState<Account | null>(null)
  const [permOpen, setPermOpen] = useState(false)
  const [permDraft, setPermDraft] = useState<string[]>([])
  // 新增帳號彈窗(依分頁角色)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAccount, setNewAccount] = useState('')

  const roleLabel = tab === 'admins' ? '管理員' : tab === 'staff' ? '工讀生' : '評審'

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
          onSuccess: () => message.success(`已刪除 ${a.name}(${a.username})`),
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
      content: '重設後原密碼立即失效,並須於首次登入時變更密碼',
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
      { role: TAB_ROLE[tab], name, username },
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
    !accountsQuery.isPending && !accountsQuery.isError && (
      <tr className="no-hover">
        <td colSpan={colSpan} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
          尚無{roleLabel}帳號
        </td>
      </tr>
    )

  const adminsTable = (
    <table className="tb" style={{ minWidth: 760 }}>
      <thead>
        <tr><th>姓名</th><th>帳號</th><th>權限層級</th><th>頁面權限</th><th>狀態</th><th className="r">動作</th></tr>
      </thead>
      <tbody>
        {admins.map((a) => (
          <tr key={a.id}>
            <td style={{ fontWeight: 500 }}>{a.name}</td>
            <td className="num" style={{ color: 'var(--steel)' }}>{a.username}</td>
            <td>{a.isSuper ? '最高權限' : '一般'}</td>
            <td style={{ fontSize: 13, color: 'var(--steel)' }}>{permsText(a)}</td>
            <td><ActiveTag active={a.active} /></td>
            {actions(
              a,
              !a.isSuper && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setPermTarget(a)
                    setPermDraft(a.permissions.filter((k) => PAGE_KEY_SET.has(k)))
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
        {admins.length === 0 && emptyRow(6)}
      </tbody>
    </table>
  )

  const staffTable = (
    <table className="tb" style={{ minWidth: 560 }}>
      <thead>
        <tr><th>姓名</th><th>帳號</th><th>狀態</th><th className="r">動作</th></tr>
      </thead>
      <tbody>
        {staff.map((a) => (
          <tr key={a.id}>
            <td style={{ fontWeight: 500 }}>{a.name}</td>
            <td className="num" style={{ color: 'var(--steel)' }}>{a.username}</td>
            <td><ActiveTag active={a.active} /></td>
            {actions(a)}
          </tr>
        ))}
        {errorRow(4)}
        {staff.length === 0 && emptyRow(4)}
      </tbody>
    </table>
  )

  // 負責獎項/分組資料由「分組與評審指派」功能管理(後端尚未提供),先以 — 佔位
  const viewersTable = (
    <table className="tb" style={{ minWidth: 760 }}>
      <thead>
        <tr><th>評審</th><th>帳號</th><th>負責獎項</th><th>分組</th><th>狀態</th><th className="r">動作</th></tr>
      </thead>
      <tbody>
        {viewers.map((a) => (
          <tr key={a.id}>
            <td style={{ fontWeight: 500 }}>{a.name}</td>
            <td className="num" style={{ color: 'var(--steel)' }}>{a.username}</td>
            <td style={{ fontSize: 13, color: 'var(--muted)' }}>—</td>
            <td style={{ fontSize: 13, color: 'var(--muted)' }}>—</td>
            <td><ActiveTag active={a.active} /></td>
            {actions(a)}
          </tr>
        ))}
        {errorRow(6)}
        {viewers.length === 0 && emptyRow(6)}
      </tbody>
    </table>
  )

  return (
    <div>
      <PageHeader
        title="帳號管理"
        extra={
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            + 新增{roleLabel}
          </Button>
        }
      />

      <Spin spinning={accountsQuery.isPending}>
        <div className="card" style={{ marginTop: 16, overflowX: 'auto', paddingTop: 8 }}>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            style={{ padding: '0 20px' }}
            items={[
              { key: 'admins', label: '管理員', children: adminsTable },
              { key: 'staff', label: '工讀生', children: staffTable },
              { key: 'viewers', label: '評審', children: viewersTable },
            ]}
          />
        </div>
      </Spin>

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
        const original = permTarget ? permTarget.permissions.filter((k) => PAGE_KEY_SET.has(k)) : []
        // 頁面清單以外的既有鍵(簽核關卡等)不受此彈窗管理,儲存時原樣保留
        const extraKeys = permTarget ? permTarget.permissions.filter((k) => !PAGE_KEY_SET.has(k)) : []
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
                    message.success(`已更新 ${permTarget.name} 的頁面權限`)
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
              {PERMISSION_KEYS.map(([value, label]) => {
                const changed = permDraft.includes(value) !== original.includes(value)
                return (
                  <label
                    key={value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: changed ? '1px solid #d48806' : '1px solid transparent',
                      boxShadow: changed ? '0 0 0 1px rgba(212, 136, 6, 0.45)' : undefined,
                    }}
                  >
                    <Checkbox
                      checked={permDraft.includes(value)}
                      onChange={(e) =>
                        setPermDraft((d) => (e.target.checked ? [...d, value] : d.filter((k) => k !== value)))
                      }
                    />
                    <span style={{ fontSize: 13 }}>{label}</span>
                  </label>
                )
              })}
            </div>
          </Modal>
        )
      })()}

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
