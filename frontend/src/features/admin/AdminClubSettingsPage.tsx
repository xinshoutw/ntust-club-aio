import { useState } from 'react'
import { App, Button, Input, Switch } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { CLUB_PROFILE } from '../club-settings/mock'
import ClubSelect from './ClubSelect'
import OneTimePasswordModal from './OneTimePasswordModal'
import { CLUBS_MASTER } from './clubsMock'
import { useAdminClub } from './clubContext'

const label: React.CSSProperties = { color: 'var(--steel)' }

// 行政端管理項目:社團自行維護的內容唯讀;可改名稱/帳號、重設密碼、啟停用
export default function AdminClubSettingsPage() {
  const { club } = useAdminClub()
  const { message, modal } = App.useApp()
  const master = CLUBS_MASTER.find((c) => c.name === club)

  const [name, setName] = useState(club)
  const [account, setAccount] = useState(master?.account ?? '')
  const [active, setActive] = useState(master?.active ?? true)
  const [pwOpen, setPwOpen] = useState(false)
  const [pwMounted, setPwMounted] = useState(false)

  // 切換社團時重置編輯欄位
  const [lastClub, setLastClub] = useState(club)
  if (club !== lastClub) {
    setLastClub(club)
    setName(club)
    setAccount(master?.account ?? '')
    setActive(master?.active ?? true)
  }

  const toggleActive = (next: boolean) => {
    if (next) {
      setActive(true)
      message.success(`已啟用 ${club} 帳號`)
      return
    }
    modal.confirm({
      title: `停用 ${club} 帳號`,
      content: '停用後社團將無法登入,進行中的申請不受影響。',
      okText: '確認停用',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        setActive(false)
        message.success(`已停用 ${club} 帳號`)
      },
    })
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
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>社團名稱</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>社團帳號</div>
              <Input className="num" value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>帳號狀態</span>
              <Switch checked={active} onChange={toggleActive} />
              <span style={{ fontSize: 13, color: active ? '#1F6B45' : '#B03A2E' }}>{active ? '啟用中' : '已停用'}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
              <Button
                onClick={() => {
                  setPwMounted(true)
                  setPwOpen(true)
                }}
              >
                重設密碼
              </Button>
              <span style={{ flex: 1 }} />
              <Button type="primary" onClick={() => message.success(`已儲存 ${name} 帳號設定`)}>儲存</Button>
            </div>
          </div>
        </div>
      </div>

      {/* 每次掛載重新產生一組密碼;關閉動畫結束後卸載 */}
      {pwMounted && (
        <OneTimePasswordModal
          title={`重設密碼 — ${club}`}
          open={pwOpen}
          onClose={() => setPwOpen(false)}
          afterClose={() => setPwMounted(false)}
        />
      )}
    </div>
  )
}
