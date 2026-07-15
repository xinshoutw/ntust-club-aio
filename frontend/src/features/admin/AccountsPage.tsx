import { useState } from 'react'
import { App, Button, Checkbox, Input, Modal, Tabs } from 'antd'
import { confirmDialog } from '../../lib/confirm'
import PageHeader from '../../components/ui/PageHeader'
import OneTimePasswordModal from './OneTimePasswordModal'

// 頁面權限鍵(與後端 permissions 對齊;super 不受限)
const PERMISSION_KEYS = [
  ['areview', '活動申請審核'],
  ['aclose', '結案審核'],
  ['asignup', '報名管理'],
  ['aannounce', '發布公告'],
  ['abooking', '臨時場地器材借用審核'],
  ['aroom', '教室固定借用審核'],
  ['amember', '社團管理'],
  ['aeval', '行政分審核'],
  ['amaint', '維修管理'],
  ['aviol', '違規管理'],
  ['afiles', '檔案管理'],
] as const

interface Account {
  name: string
  account: string
  active: boolean
  scope?: string // 管理員:最高權限/一般/受限
  perms?: string
  permKeys?: string[] // 管理員:實際頁面權限鍵(權限彈窗預設值)
  awards?: string // 評審:負責獎項
  group?: string // 評審:分組
}

const ADMINS: Account[] = [
  { name: '王組長', account: 'admin_wang', active: true, scope: '最高權限', perms: '全部' },
  { name: '李承辦', account: 'admin_lee', active: true, scope: '一般', perms: '活動審核、結案審核、報名管理', permKeys: ['areview', 'aclose', 'asignup'] },
  { name: '陳助理', account: 'admin_chen', active: true, scope: '一般', perms: '借用審核、維修、違規、社團管理', permKeys: ['abooking', 'aroom', 'amaint', 'aviol', 'amember'] },
  { name: '學務長', account: 'dean', active: true, scope: '受限(僅簽核)', perms: '學務長簽核關', permKeys: [] },
]

const STAFF: Account[] = [
  { name: '李工讀', account: 'staff_lee', active: true },
  { name: '陳工讀', account: 'staff_chen', active: true },
]

const VIEWERS: Account[] = [
  { name: '張老師', account: 'viewer01', active: true, awards: '最佳社團獎、最佳活動獎', group: '第 1 組(資工系學會、電機系學會)' },
  { name: '李老師', account: 'viewer02', active: true, awards: '最佳財務獎、最佳成果發表獎', group: '第 1 組(資工系學會、電機系學會)' },
  { name: '陳老師', account: 'viewer03', active: false, awards: '最佳社團負責人獎', group: '第 2 組(學生會)' },
]

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
  // 管理員列表為 state:權限彈窗「儲存」須實際落地(重開/列表即時反映)
  const [admins, setAdmins] = useState<Account[]>(ADMINS)
  // 一次性密碼彈窗:目標帳號 + 顯示開關(關閉動畫結束後卸載);重設流程按鈕文字為「確認重設」
  const [pwTarget, setPwTarget] = useState<{ title: string; account?: string; okLabel?: string } | null>(null)
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

  const showPassword = (title: string, account?: string, okLabel?: string) => {
    setPwTarget({ title, account, okLabel })
    setPwOpen(true)
  }

  const confirmDelete = (a: Account) =>
    confirmDialog(modal, {
      title: `刪除帳號 ${a.name}`,
      content: '確認刪除後將無法復原',
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => message.success(`已刪除 ${a.name}(${a.account})`),
    })

  const toggleActive = (a: Account) => {
    if (a.active) {
      confirmDialog(modal, {
        title: `停權 ${a.name}`,
        content: '停權後無法登入,可隨時恢復。',
        okText: '確認停權',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => message.success(`已停權 ${a.name}`),
      })
    } else {
      message.success(`已恢復 ${a.name} 的帳號`)
    }
  }

  const createAccount = () => {
    if (!newName.trim()) {
      message.error('請輸入姓名。')
      return
    }
    const account = newAccount.trim() || `${tab === 'admins' ? 'admin' : tab === 'staff' ? 'staff' : 'viewer'}_${newName.trim().toLowerCase()}`
    setCreateOpen(false)
    setNewName('')
    setNewAccount('')
    // 建立後直接顯示帳號與一次性密碼
    showPassword(`已建立${roleLabel}帳號 — ${newName.trim()}`, account)
  }

  const actions = (a: Account, extra?: React.ReactNode) => (
    <td className="r" style={{ whiteSpace: 'nowrap' }}>
      {extra}
      <button type="button" className="link-btn" onClick={() => showPassword(`重設密碼 — ${a.name}`, a.account, '確認重設')}>
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

  const adminsTable = (
    <table className="tb" style={{ minWidth: 760 }}>
      <thead>
        <tr><th>姓名</th><th>帳號</th><th>權限層級</th><th>頁面權限</th><th>狀態</th><th className="r">動作</th></tr>
      </thead>
      <tbody>
        {admins.map((a) => (
          <tr key={a.account}>
            <td style={{ fontWeight: 500 }}>{a.name}</td>
            <td className="num" style={{ color: 'var(--steel)' }}>{a.account}</td>
            <td>{a.scope}</td>
            <td style={{ fontSize: 13, color: 'var(--steel)' }}>{a.perms}</td>
            <td><ActiveTag active={a.active} /></td>
            {actions(
              a,
              a.scope !== '最高權限' && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setPermTarget(a)
                    setPermDraft(a.permKeys ?? [])
                    setPermOpen(true)
                  }}
                >
                  權限
                </button>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )

  const staffTable = (
    <table className="tb" style={{ minWidth: 560 }}>
      <thead>
        <tr><th>姓名</th><th>帳號</th><th>狀態</th><th className="r">動作</th></tr>
      </thead>
      <tbody>
        {STAFF.map((a) => (
          <tr key={a.account}>
            <td style={{ fontWeight: 500 }}>{a.name}</td>
            <td className="num" style={{ color: 'var(--steel)' }}>{a.account}</td>
            <td><ActiveTag active={a.active} /></td>
            {actions(a)}
          </tr>
        ))}
      </tbody>
    </table>
  )

  const viewersTable = (
    <>
      <div style={{ fontSize: 13, color: 'var(--steel)', padding: '0 20px 8px' }}>
        評審對社團匿名呈現(依組內排序顯示為評審A、評審B);分組與獎項指派接後端後在此調整。
      </div>
      <table className="tb" style={{ minWidth: 760 }}>
        <thead>
          <tr><th>評審</th><th>帳號</th><th>負責獎項</th><th>分組</th><th>狀態</th><th className="r">動作</th></tr>
        </thead>
        <tbody>
          {VIEWERS.map((a) => (
            <tr key={a.account}>
              <td style={{ fontWeight: 500 }}>{a.name}</td>
              <td className="num" style={{ color: 'var(--steel)' }}>{a.account}</td>
              <td style={{ fontSize: 13 }}>{a.awards}</td>
              <td style={{ fontSize: 13, color: 'var(--steel)' }}>{a.group}</td>
              <td><ActiveTag active={a.active} /></td>
              {actions(a)}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )

  return (
    <div>
      <PageHeader
        title="帳號管理"
        extra={
          <Button type="primary" style={{ height: 36 }} onClick={() => setCreateOpen(true)}>
            + 新增{roleLabel}
          </Button>
        }
      />

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

      {/* 新增帳號:建立後顯示帳號與一次性密碼;destroyOnHidden+取消清空,重開不殘留 */}
      <Modal
        open={createOpen}
        title={`新增${roleLabel}`}
        okText="建立帳號"
        cancelText="取消"
        destroyOnHidden
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
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>帳號</div>
            <Input className="num" value={newAccount} onChange={(e) => setNewAccount(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* 權限設定(一般管理員):變更的項目以橘框標示,按「儲存」才生效 */}
      {(() => {
        const original = permTarget?.permKeys ?? []
        const permDirty =
          permDraft.length !== original.length || permDraft.some((k) => !original.includes(k))
        const closePerm = () => {
          if (!permDirty) {
            setPermOpen(false)
            return
          }
          confirmDialog(modal, {
            title: '尚有未儲存的變更',
            content: '離開將遺失已調整的權限勾選。',
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
            onOk={() => {
              // 儲存落地:寫回列表(頁面權限欄同步),重開彈窗即顯示新勾選
              const permsText = permDraft.length
                ? PERMISSION_KEYS.filter(([k]) => permDraft.includes(k)).map(([, l]) => l).join('、')
                : '—'
              setAdmins((list) =>
                list.map((a) =>
                  a.account === permTarget?.account ? { ...a, permKeys: [...permDraft], perms: permsText } : a,
                ),
              )
              setPermOpen(false)
              message.success(`已更新 ${permTarget?.name} 的頁面權限`)
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
          key={pwTarget.account ?? pwTarget.title}
          title={pwTarget.title}
          account={pwTarget.account}
          okLabel={pwTarget.okLabel}
          open={pwOpen}
          onClose={() => setPwOpen(false)}
          afterClose={() => setPwTarget(null)}
        />
      )}
    </div>
  )
}
