import { useEffect, useRef, useState } from 'react'
import { App, Button, Input, Select, Switch } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { confirmDialog } from '../../lib/confirm'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { suspendedNow } from '../../lib/status'
import { useUnsavedGuard } from '../../app/unsaved'
import {
  CLUB_ATTRIBUTES,
  useAdminClubDetail,
  useAdminClubMutations,
  type AdminClubDetail,
} from '../../api/adminClubs'
import ClubSelect from './ClubSelect'
import OneTimePasswordModal from './OneTimePasswordModal'
import { useAdminClub } from './clubContext'

const label: React.CSSProperties = { color: 'var(--steel)' }

interface FormState {
  name: string
  enName: string // 英文名稱:社團端唯讀,只有這裡改得動
  kind: string // 社團/學會;名稱結尾可推導時自動同步,推導不到時手動指定
  attribute: string // 社團性質;沒有性質的社團不會出現在社團漏斗,選錯了要改得回來
  account: string
  active: boolean
}

// 名稱結尾推導 社團/學會;推導不到回 null(與後端 derive_kind 同規則)
const deriveKind = (name: string): string | null =>
  name.endsWith('社') ? '社團' : name.endsWith('會') ? '學會' : null

const advisorText = (d: AdminClubDetail | undefined): string => {
  if (!d?.advisorName) return '—'
  return [d.advisorName, d.advisorDept].filter(Boolean).join(' · ')
}

const advisorOutText = (d: AdminClubDetail | undefined): string => {
  if (!d?.advisorOutName) return '—'
  return [d.advisorOutName, d.advisorOutDept].filter(Boolean).join(' · ')
}

// 行政端管理項目:社團自行維護的內容唯讀;可改名稱/英文名稱/帳號、重設密碼、啟停用
// (英文名稱在社團端是唯讀的,只有這裡改得動 —— decisions.md D-19)
export default function AdminClubSettingsPage() {
  const { club, clubId, setClub } = useAdminClub()
  const { message, modal } = App.useApp()
  const detailQuery = useAdminClubDetail(clubId)
  const detail = detailQuery.data
  const { update, resetPassword } = useAdminClubMutations()

  // 已儲存基準:與 form 一同以詳情初始化的快照(不直接派生自 detailQuery.data——
  // 切換社團當下新社團詳情尚未載入會使派生值變 null、dirty 誤判為 false,繞過切換確認)
  const [saved, setSaved] = useState<FormState | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  // 一次性密碼:API 回傳後才開彈窗;關閉動畫結束即卸載(明碼不留存)
  const [pw, setPw] = useState<{ password: string; account?: string } | null>(null)
  const [pwOpen, setPwOpen] = useState(false)

  const dirty =
    !!form &&
    !!saved &&
    (form.name !== saved.name ||
      form.enName !== saved.enName ||
      form.kind !== saved.kind ||
      form.attribute !== saved.attribute ||
      form.account !== saved.account ||
      form.active !== saved.active)
  // 未儲存離開警告:側欄/頂欄導航由 shell 攔截,關閉分頁由 beforeunload 攔截
  useUnsavedGuard(dirty)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  // 切換社團:乾淨時直接重置;dirty 時跳確認,取消則留在原社團
  const [lastClub, setLastClub] = useState(club)
  useEffect(() => {
    if (club === lastClub) return
    const resetTo = () => {
      setSaved(null)
      setForm(null)
      setLastClub(club)
    }
    if (!dirtyRef.current) {
      resetTo()
      return
    }
    confirmDialog(modal, {
      title: '尚有未儲存的變更',
      content: '切換社團將遺失尚未儲存的修改',
      okText: '放棄變更並切換',
      okButtonProps: { danger: true },
      cancelText: '留在此頁',
      onOk: resetTo,
      onCancel: () => setClub(lastClub),
    })
  }, [club, lastClub, modal, setClub])

  // 詳情載入後初始化基準與編輯值;切換社團(兩者歸 null)後以新社團詳情重新初始化
  useEffect(() => {
    if (form === null && detail && club === lastClub) {
      const base = {
        name: detail.name,
        enName: detail.enName,
        kind: detail.kind,
        // 停社遷入舊社的性質不可考(null):空字串=沒填,選了才送出去
        attribute: detail.attribute ?? '',
        account: detail.username ?? '',
        active: detail.isActive,
      }
      setSaved(base)
      setForm(base)
    }
  }, [form, detail, club, lastClub])

  // 開關本身不警告;切到「停用」後按「儲存」才確認
  const save = () => {
    if (!form || !saved || clubId == null) return
    const name = form.name.trim()
    if (!dirty) {
      message.info('內容未變更')
      return
    }
    const doSave = () => {
      update.mutate(
        {
          id: clubId,
          // 僅送有變更的欄位(undefined 不會進 JSON body)
          name: name !== saved.name ? name : undefined,
          enName: form.enName.trim() !== saved.enName ? form.enName.trim() : undefined,
          kind: form.kind !== saved.kind ? form.kind : undefined,
          attribute: form.attribute !== saved.attribute ? form.attribute : undefined,
          username: form.account.trim() !== saved.account ? form.account.trim() : undefined,
          isActive: form.active !== saved.active ? form.active : undefined,
        },
        {
          onSuccess: (res) => {
            const base = {
              name: res.name,
              enName: res.enName,
              kind: res.kind,
              attribute: res.attribute ?? '',
              account: res.username ?? '',
              active: res.isActive,
            }
            setSaved(base)
            setForm(base)
            message.success(res.isActive ? `已儲存 ${res.name} 帳號設定` : `已停用 ${res.name} 帳號`)
            // 名稱變更:跨頁選取以名稱續存,同步更新(先動 lastClub 避免切換確認誤觸發)
            if (res.name !== club) {
              setLastClub(res.name)
              setClub(res.name)
            }
          },
          onError: (e) => message.error(e.message),
        },
      )
    }
    if (saved.active && !form.active) {
      confirmDialog(modal, {
        title: `停用 ${club} 帳號`,
        content: '社團將無法登入，正進行中的申請將不受影響',
        okText: '確認並儲存',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: doSave,
      })
      return
    }
    doSave()
  }

  // 重設密碼:一次性明碼由後端產生,重設當下即生效並撤銷 session,
  // 故先確認再打 API;回傳明碼以彈窗一次性顯示,關閉即消失
  const doResetPassword = () => {
    if (clubId == null) return
    confirmDialog(modal, {
      title: `重設 ${club} 的密碼`,
      content: '產生一次性密碼並登出所有裝置，下次登入須立即更改密碼',
      okText: '確認重設',
      cancelText: '取消',
      onOk: () => {
        resetPassword.mutate(clubId, {
          onSuccess: (password) => {
            setPw({ password, account: detail?.username ?? undefined })
            setPwOpen(true)
          },
          onError: (e) => message.error(e.message),
        })
      },
    })
  }

  return (
    <div>
      <PageHeader title="管理項目" extra={<ClubSelect />} />

      <div className="form-grid-2" style={{ marginTop: 20, alignItems: 'stretch' }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>社團資料</div>
          <LoadingBlock pending={clubId != null && detailQuery.isPending}>
            {/* 手上還沒有資料就只顯示錯誤:整排 `—` 看起來像「這社什麼都沒填」(同社團總覽) */}
            {detailQuery.isError && !detail ? (
              <QueryError
                compact
                title="社團資料載入失敗"
                error={detailQuery.error}
                onRetry={() => void detailQuery.refetch()}
              />
            ) : (
            <>
            <div style={{ display: 'grid', gridTemplateColumns: '104px 1fr', gap: '10px 12px', fontSize: 13 }}>
              <div style={label}>校內指導老師</div><div>{advisorText(detail)}</div>
              <div style={label}>校外指導老師</div><div>{advisorOutText(detail)}</div>
              <div style={label}>網頁連結</div>
              <div>
                {detail?.websiteUrl ? (
                  <a href={detail.websiteUrl} target="_blank" rel="noopener noreferrer">{detail.websiteUrl}</a>
                ) : (
                  '—'
                )}
              </div>
              <div style={label}>簡介</div><div style={{ lineHeight: 1.7 }}>{detail?.intro || '—'}</div>
              <div style={label}>聯絡 Email</div>
              <div className="num">{detail?.contactEmails.filter(Boolean).join('、') || '—'}</div>
              <div style={label}>Discord Webhook</div>
              <div>{detail ? (detail.discordWebhookSet ? '已設定' : '未設定') : '—'}</div>
            </div>
            {/* 背景重抓失敗:資料照舊,底下補一行說明 */}
            {detailQuery.isError && detail && (
              <QueryError
                compact
                title="社團資料重新載入失敗"
                error={detailQuery.error}
                onRetry={() => void detailQuery.refetch()}
              />
            )}
            </>
            )}
          </LoadingBlock>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>帳號與狀態</div>
          {form && saved ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={form.name !== saved.name ? 'field-dirty' : undefined}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>社團名稱</div>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value
                    // 結尾社/會自動推導類型;推導不到保留原值由下方手動指定
                    setForm({ ...form, name, kind: deriveKind(name.trim()) ?? form.kind })
                  }}
                />
              </div>
              <div className={form.enName !== saved.enName ? 'field-dirty' : undefined}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>英文名稱</div>
                <Input
                  value={form.enName}
                  placeholder="English name"
                  onChange={(e) => setForm({ ...form, enName: e.target.value })}
                />
              </div>
              <div className={form.kind !== saved.kind ? 'field-dirty' : undefined}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>類型</div>
                <Select
                  value={form.kind}
                  style={{ width: 140 }}
                  options={[
                    { value: '社團', label: '社團' },
                    { value: '學會', label: '學會' },
                  ]}
                  disabled={deriveKind(form.name.trim()) != null}
                  onChange={(v) => setForm({ ...form, kind: v })}
                />
              </div>
              <div className={form.attribute !== saved.attribute ? 'field-dirty' : undefined}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>性質</div>
                {/* 沒有性質的社團不會出現在社團漏斗;既有的空值(停社遷入舊社)不強迫補,
                    但選了就不給再清成空白 */}
                <Select
                  value={form.attribute || undefined}
                  style={{ width: 140 }}
                  placeholder="未分類"
                  options={CLUB_ATTRIBUTES.map((a) => ({ value: a, label: a }))}
                  onChange={(v) => setForm({ ...form, attribute: v })}
                />
              </div>
              <div className={form.account !== saved.account ? 'field-dirty' : undefined}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>社團帳號</div>
                <Input
                  className="num"
                  value={form.account}
                  disabled={detail?.username == null}
                  placeholder={detail?.username == null ? '該社團尚未建立帳號' : undefined}
                  onChange={(e) => setForm({ ...form, account: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>帳號狀態</span>
                <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
                <span style={{ fontSize: 13, color: form.active ? '#1F6B45' : '#C13B34' }}>
                  {form.active ? '啟用中' : '已停用'}
                </span>
                {form.active !== saved.active && <span style={{ fontSize: 12, color: '#d48806' }}>未儲存</span>}
              </div>
              {/* 解除停權才會把日期清成 NULL,過期未清的殘留值不該一直顯示成停權中 */}
              {detail && suspendedNow(detail.suspendedUntil) && (
                <div style={{ fontSize: 12, color: '#C13B34' }}>
                  停權中至 <span className="num">{detail.suspendedUntil}</span>
                  {detail.suspendReason ? ` · ${detail.suspendReason}` : ''}
                </div>
              )}
              {/* 重設密碼獨立生效(不需儲存),與儲存鈕相鄰 */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4, justifyContent: 'flex-end' }}>
                <Button
                  disabled={detail?.username == null}
                  loading={resetPassword.isPending}
                  onClick={doResetPassword}
                >
                  重設密碼
                </Button>
                <Button type="primary" loading={update.isPending} onClick={save}>儲存</Button>
              </div>
            </div>
          ) : (
            <LoadingBlock pending={clubId != null && detailQuery.isPending}>
              {/* form 恆為 null 的另一種原因是詳情載入失敗:空白 120px 就是「查詢失敗長得像沒有資料」 */}
              {detailQuery.isError ? (
                <QueryError
                  compact
                  title="社團資料載入失敗"
                  error={detailQuery.error}
                  onRetry={() => void detailQuery.refetch()}
                />
              ) : (
                <div style={{ minHeight: 120 }} />
              )}
            </LoadingBlock>
          )}
        </div>
      </div>

      {/* 一次性明碼僅此回應可見;關閉動畫結束後卸載,不再顯示 */}
      {pw && (
        <OneTimePasswordModal
          title={`重設密碼 — ${club}`}
          account={pw.account}
          password={pw.password}
          open={pwOpen}
          onClose={() => setPwOpen(false)}
          afterClose={() => setPw(null)}
        />
      )}
    </div>
  )
}
