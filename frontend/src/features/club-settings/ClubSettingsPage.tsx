import { useState } from 'react'
import { App, Button, Form, Input } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import SuspensionNote from '../../components/ui/SuspensionNote'
import { useAuth } from '../../app/auth'
import { useUnsavedGuard } from '../../app/unsaved'
import { changePasswordApi } from '../../api/auth'
import { useClubProfile, useUpdateClubProfile, type ClubProfile } from '../../api/clubProfile'

// 密碼政策(與後端一致):≥10 碼且含大小寫、數字、特殊符號
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/

interface SettingsValues {
  advisorName: string
  advisorDept?: string
  advisorEmail?: string
  advisorExt?: string
  advisorOutName?: string
  advisorOutDept?: string
  advisorOutEmail?: string
  advisorOutPhone?: string
  enName?: string
  url?: string
  intro?: string
  email1: string
  email2?: string
  email3?: string
  discordWebhook?: string
  pwCurrent?: string
  pwNew?: string
  pwConfirm?: string
}

// PATCH /club/profile 涵蓋的欄位(密碼另走 /auth/change-password)
const PROFILE_KEYS = [
  'advisorName',
  'advisorDept',
  'advisorEmail',
  'advisorExt',
  'advisorOutName',
  'advisorOutDept',
  'advisorOutEmail',
  'advisorOutPhone',
  'enName',
  'url',
  'intro',
  'email1',
  'email2',
  'email3',
  'discordWebhook',
] as const satisfies readonly (keyof SettingsValues)[]

// dirty 基準=最後載入/儲存的 server 值;密碼欄基準恆為空
const fromProfile = (p: ClubProfile): SettingsValues => ({
  advisorName: p.advisorName,
  advisorDept: p.advisorDept,
  advisorEmail: p.advisorEmail,
  advisorExt: p.advisorExt,
  advisorOutName: p.advisorOutName,
  advisorOutDept: p.advisorOutDept,
  advisorOutEmail: p.advisorOutEmail,
  advisorOutPhone: p.advisorOutPhone,
  enName: p.enName,
  url: p.url,
  intro: p.intro,
  email1: p.emails[0],
  email2: p.emails[1],
  email3: p.emails[2],
  discordWebhook: p.discordWebhook,
  pwCurrent: '',
  pwNew: '',
  pwConfirm: '',
})

const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, marginBottom: 16 }

// 載入完成後才掛表單(initialValues 僅於掛載時生效)
export default function ClubSettingsPage() {
  const profileQuery = useClubProfile()
  if (!profileQuery.data) {
    return (
      <div>
        <PageHeader title="管理項目" />
        {profileQuery.isError ? (
          <div className="card" style={{ marginTop: 20, padding: 24, color: 'var(--steel)' }}>
            載入失敗:{profileQuery.error.message}
          </div>
        ) : (
          <LoadingBlock pending rows={6} />
        )}
      </div>
    )
  }
  return <SettingsForm profile={profileQuery.data} />
}

// 全頁單一表單:被修改的欄位以橘黃外框標示(.field-dirty),右下角統一儲存
function SettingsForm({ profile }: { profile: ClubProfile }) {
  const { refresh } = useAuth()
  const { message } = App.useApp()
  const update = useUpdateClubProfile()
  const [form] = Form.useForm<SettingsValues>()
  const [saved, setSaved] = useState<SettingsValues>(() => fromProfile(profile))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set())
  // 有未儲存變更時:關閉分頁與側欄/頂欄導航都會先確認
  useUnsavedGuard(dirty.size > 0)

  const recomputeDirty = (baseline: SettingsValues = saved) => {
    const cur = form.getFieldsValue(true) as SettingsValues
    const keys = (Object.keys(baseline) as (keyof SettingsValues)[]).filter(
      (k) => (cur[k] ?? '') !== (baseline[k] ?? ''),
    )
    setDirty(new Set(keys))
  }

  const itemClass = (k: keyof SettingsValues) => (dirty.has(k) ? 'field-dirty' : undefined)

  const onFinish = async (v: SettingsValues) => {
    const changingPw = !!(v.pwCurrent || v.pwNew || v.pwConfirm)
    const profileChanged = PROFILE_KEYS.some((k) => (v[k] ?? '') !== (saved[k] ?? ''))
    let baseline = saved
    setSaving(true)
    try {
      if (profileChanged) {
        const next = await update.mutateAsync({
          intro: v.intro ?? '',
          url: v.url ?? '',
          emails: [v.email1, v.email2 ?? '', v.email3 ?? ''],
          discordWebhook: v.discordWebhook ?? '',
          advisorName: v.advisorName,
          advisorDept: v.advisorDept ?? '',
          advisorEmail: v.advisorEmail ?? '',
          advisorExt: v.advisorExt ?? '',
          advisorOutName: v.advisorOutName ?? '',
          advisorOutDept: v.advisorOutDept ?? '',
          advisorOutEmail: v.advisorOutEmail ?? '',
          advisorOutPhone: v.advisorOutPhone ?? '',
          enName: v.enName ?? '',
        })
        baseline = fromProfile(next)
        setSaved(baseline)
      }
      if (changingPw) {
        await changePasswordApi(v.pwCurrent ?? '', v.pwNew ?? '')
        form.setFieldsValue({ pwCurrent: '', pwNew: '', pwConfirm: '' })
        // 首登強制改密等使用者旗標可能變動,原地更新 auth context
        void refresh()
      }
      message.success(changingPw ? '設定已儲存,密碼已更新' : '設定已儲存')
    } catch (e) {
      // 簡介儲存成功、密碼失敗時:簡介基準已前移,僅密碼欄維持 dirty
      message.error(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
      recomputeDirty(baseline)
    }
  }

  return (
    <div>
      {/* 停權只在送借用撞 403 時才顯形 —— 社團自己的頁面要看得到(與借用四頁共用同一則標示) */}
      <PageHeader title="管理項目" sub={<SuspensionNote />} />
      <Form
        form={form}
        layout="vertical"
        initialValues={saved}
        onValuesChange={() => recomputeDirty()}
        onFinish={(v) => void onFinish(v)}
        onFinishFailed={({ errorFields }) => {
          const first = errorFields[0]?.errors?.[0]
          if (first) message.error(first)
        }}
        requiredMark
      >
        {/* 指導老師與社團簡介並排 */}
        <div className="form-grid-2" style={{ marginTop: 20, alignItems: 'stretch' }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>指導老師</div>
            {/* 校內/校外各至多一位 */}
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--steel)', marginBottom: 8 }}>校內</div>
            <div className="form-grid-2">
              <Form.Item
                name="advisorName"
                label="姓名"
                className={itemClass('advisorName')}
                rules={[{ required: true, message: '請輸入指導老師姓名' }]}
                style={{ marginBottom: 0 }}
              >
                <Input />
              </Form.Item>
              <Form.Item name="advisorDept" label="系所" className={itemClass('advisorDept')} style={{ marginBottom: 0 }}>
                <Input />
              </Form.Item>
              <Form.Item
                name="advisorEmail"
                label="Email"
                className={itemClass('advisorEmail')}
                rules={[{ type: 'email', message: 'Email 格式不正確' }]}
                style={{ marginBottom: 0 }}
              >
                <Input />
              </Form.Item>
              <Form.Item name="advisorExt" label="分機" className={itemClass('advisorExt')} style={{ marginBottom: 0 }}>
                <Input className="num" />
              </Form.Item>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--steel)', margin: '16px 0 8px' }}>校外(選填)</div>
            <div className="form-grid-2">
              <Form.Item name="advisorOutName" label="姓名" className={itemClass('advisorOutName')} style={{ marginBottom: 0 }}>
                <Input />
              </Form.Item>
              <Form.Item name="advisorOutDept" label="單位/職稱" className={itemClass('advisorOutDept')} style={{ marginBottom: 0 }}>
                <Input />
              </Form.Item>
              <Form.Item
                name="advisorOutEmail"
                label="Email"
                className={itemClass('advisorOutEmail')}
                rules={[{ type: 'email', message: 'Email 格式不正確' }]}
                style={{ marginBottom: 0 }}
              >
                <Input />
              </Form.Item>
              <Form.Item name="advisorOutPhone" label="電話" className={itemClass('advisorOutPhone')} style={{ marginBottom: 0 }}>
                <Input className="num" />
              </Form.Item>
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>社團簡介</div>
            <Form.Item label="社團名稱">
              <Input readOnly value={profile.name} style={{ background: 'var(--paper)' }} />
            </Form.Item>
            <Form.Item name="enName" label="英文名稱" className={itemClass('enName')}>
              <Input placeholder="English name（選填）" />
            </Form.Item>
            <Form.Item
              name="url"
              label="社團網頁連結"
              className={itemClass('url')}
              rules={[{ type: 'url', message: '網址格式不正確' }]}
            >
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item name="intro" label="簡介" className={itemClass('intro')} style={{ marginBottom: 0 }}>
              <Input.TextArea rows={3} placeholder="社團宗旨、特色" />
            </Form.Item>
          </div>
        </div>

        {/* 聯絡與通知、更換密碼並排 */}
        <div className="form-grid-2" style={{ marginTop: 16, alignItems: 'stretch' }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>聯絡與通知</div>
            <Form.Item
              name="email1"
              label="聯絡通知信箱"
              className={itemClass('email1')}
              rules={[
                { required: true, message: '請至少填寫一組聯絡信箱' },
                { type: 'email', message: '信箱格式不正確' },
              ]}
            >
              <Input placeholder="主要聯絡信箱" />
            </Form.Item>
            <Form.Item
              name="email2"
              className={itemClass('email2')}
              rules={[{ type: 'email', message: '信箱格式不正確' }]}
            >
              <Input placeholder="聯絡信箱 2（選填）" />
            </Form.Item>
            <Form.Item
              name="email3"
              className={itemClass('email3')}
              rules={[{ type: 'email', message: '信箱格式不正確' }]}
            >
              <Input placeholder="聯絡信箱 3（選填）" />
            </Form.Item>
            <Form.Item
              name="discordWebhook"
              label="Discord Webhook URL"
              className={itemClass('discordWebhook')}
              rules={[
                {
                  pattern: /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/.+/,
                  message: '格式須為 https://discord.com/api/webhooks/…',
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder="https://discord.com/api/webhooks/…" />
            </Form.Item>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>更換密碼</div>
            <Form.Item
              name="pwCurrent"
              label="目前密碼"
              className={itemClass('pwCurrent')}
              dependencies={['pwNew']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, v: string) =>
                    !v && getFieldValue('pwNew') ? Promise.reject(new Error('請輸入目前密碼')) : Promise.resolve(),
                }),
              ]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              name="pwNew"
              label="新密碼"
              className={itemClass('pwNew')}
              dependencies={['pwCurrent']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, v: string) => {
                    if (!v) {
                      return getFieldValue('pwCurrent')
                        ? Promise.reject(new Error('請輸入新密碼'))
                        : Promise.resolve()
                    }
                    return PASSWORD_RULE.test(v)
                      ? Promise.resolve()
                      : Promise.reject(new Error('新密碼須至少 10 碼,含大小寫字母、數字與特殊符號'))
                  },
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="pwConfirm"
              label="確認新密碼"
              className={itemClass('pwConfirm')}
              dependencies={['pwNew']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, v: string) => {
                    const pwNew = getFieldValue('pwNew')
                    if (!pwNew && !v) return Promise.resolve()
                    return v === pwNew ? Promise.resolve() : Promise.reject(new Error('兩次輸入的新密碼不一致'))
                  },
                }),
              ]}
              style={{ marginBottom: 8 }}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16 }}>
          {dirty.size > 0 && (
            <span style={{ fontSize: 12, color: '#8A5A00' }}>
              尚未儲存
            </span>
          )}
          <Button type="primary" htmlType="submit" loading={saving} disabled={saving}>儲存</Button>
        </div>
      </Form>
    </div>
  )
}
