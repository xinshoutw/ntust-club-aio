import { useEffect, useRef, useState } from 'react'
import { App, Button, Input, Switch } from 'antd'
import { confirmDialog } from '../../lib/confirm'
import PageHeader from '../../components/ui/PageHeader'
import { useUnsavedGuard } from '../../app/unsaved'
import { CLUB_PROFILE } from '../club-settings/mock'
import ClubSelect from './ClubSelect'
import OneTimePasswordModal from './OneTimePasswordModal'
import { CLUBS_MASTER } from './clubsMock'
import { useAdminClub } from './clubContext'

const label: React.CSSProperties = { color: 'var(--steel)' }

// 行政端管理項目:社團自行維護的內容唯讀;可改名稱/帳號、重設密碼、啟停用
export default function AdminClubSettingsPage() {
  const { club, setClub } = useAdminClub()
  const { message, modal } = App.useApp()
  const master = CLUBS_MASTER.find((c) => c.name === club)

  // 已儲存基準:dirty 與「上次儲存值」比較,儲存成功即更新基準
  const [saved, setSaved] = useState(() => ({ name: club, account: master?.account ?? '', active: master?.active ?? true }))
  const [name, setName] = useState(saved.name)
  const [account, setAccount] = useState(saved.account)
  const [active, setActive] = useState(saved.active)
  const [nameError, setNameError] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [pwMounted, setPwMounted] = useState(false)

  const dirty = name !== saved.name || account !== saved.account || active !== saved.active
  // 未儲存離開警告:側欄/頂欄導航由 shell 攔截,關閉分頁由 beforeunload 攔截
  useUnsavedGuard(dirty)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  // 切換社團:乾淨時直接重置;dirty 時跳確認,取消則留在原社團
  const [lastClub, setLastClub] = useState(club)
  useEffect(() => {
    if (club === lastClub) return
    const resetTo = (c: string) => {
      const m = CLUBS_MASTER.find((x) => x.name === c)
      const base = { name: c, account: m?.account ?? '', active: m?.active ?? true }
      setSaved(base)
      setName(base.name)
      setAccount(base.account)
      setActive(base.active)
      setNameError(false)
      setLastClub(c)
    }
    if (!dirtyRef.current) {
      resetTo(club)
      return
    }
    confirmDialog(modal, {
      title: '尚有未儲存的變更',
      content: '切換社團將遺失尚未儲存的修改',
      okText: '放棄變更並切換',
      okButtonProps: { danger: true },
      cancelText: '留在此頁',
      onOk: () => resetTo(club),
      onCancel: () => setClub(lastClub),
    })
  }, [club, lastClub, modal, setClub])

  // 開關本身不警告;切到「停用」後按「儲存」才確認(需求方 2026-07-16)
  const save = () => {
    // 社團名稱強制以「社」或「會」結尾(社長/會長身份顯示依此推導),無例外
    if (!/[社會]$/.test(name.trim())) {
      setNameError(true)
      message.error('社團名稱必須以「社」或「會」結尾')
      return
    }
    const doSave = () => {
      setSaved({ name: name.trim(), account, active })
      message.success(active ? `已儲存 ${name.trim()} 帳號設定` : `已停用 ${name.trim()} 帳號`)
    }
    if (saved.active && !active) {
      confirmDialog(modal, {
        title: `停用 ${club} 帳號`,
        content: '社團將無法登入，將不會影響進行中的申請',
        okText: '確認並儲存',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: doSave,
      })
      return
    }
    doSave()
  }

  return (
    <div>
      <PageHeader title="管理項目" extra={<ClubSelect />} />

      <div className="form-grid-2" style={{ marginTop: 20, alignItems: 'stretch' }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>社團資料</div>
          <div style={{ display: 'grid', gridTemplateColumns: '104px 1fr', gap: '10px 12px', fontSize: 13 }}>
            <div style={label}>指導老師</div><div>張教授 · 資訊工程系 · 分機 <span className="num">6000</span></div>
            <div style={label}>網頁連結</div>
            <div>{CLUB_PROFILE.url ? <a href={CLUB_PROFILE.url} target="_blank" rel="noopener noreferrer">{CLUB_PROFILE.url}</a> : '—'}</div>
            <div style={label}>簡介</div><div style={{ lineHeight: 1.7 }}>{CLUB_PROFILE.intro || '—'}</div>
            <div style={label}>聯絡 Email</div><div className="num">{CLUB_PROFILE.emails.filter(Boolean).join('、') || '—'}</div>
            <div style={label}>Discord Webhook</div><div>{'已設定' /* mock:實值不顯示 */}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>帳號與狀態</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className={name !== saved.name ? 'field-dirty' : undefined}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>社團名稱</div>
              <Input
                value={name}
                status={nameError ? 'error' : undefined}
                onChange={(e) => {
                  setNameError(false)
                  setName(e.target.value)
                }}
              />
              {nameError && (
                <div style={{ fontSize: 12, color: '#C13B34', marginTop: 4 }}>社團名稱必須以「社」或「會」結尾</div>
              )}
            </div>
            <div className={account !== saved.account ? 'field-dirty' : undefined}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>社團帳號</div>
              <Input className="num" value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>帳號狀態</span>
              <Switch checked={active} onChange={setActive} />
              <span style={{ fontSize: 13, color: active ? '#1F6B45' : '#B03A2E' }}>{active ? '啟用中' : '已停用'}</span>
              {active !== saved.active && (
                <span style={{ fontSize: 12, color: '#d48806' }}>未儲存</span>
              )}
            </div>
            {/* 重設密碼獨立生效(不需儲存),與儲存鈕相鄰 */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4, justifyContent: 'flex-end' }}>
              <Button
                onClick={() => {
                  setPwMounted(true)
                  setPwOpen(true)
                }}
              >
                重設密碼
              </Button>
              <Button type="primary" onClick={save}>儲存</Button>
            </div>
          </div>
        </div>
      </div>

      {/* 每次掛載重新產生一組密碼;關閉動畫結束後卸載 */}
      {pwMounted && (
        <OneTimePasswordModal
          title={`重設密碼 — ${club}`}
          okLabel="確認重設"
          open={pwOpen}
          onOk={() => {
            // 僅按「確認重設」才生效;Esc/點遮罩=取消不重設
            message.success(`已重設 ${club} 的密碼`)
            setPwOpen(false)
          }}
          onClose={() => setPwOpen(false)}
          afterClose={() => setPwMounted(false)}
        />
      )}
    </div>
  )
}
