import { useState } from 'react'
import { App, Button, Form, Input } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { useAuth } from '../../app/auth'
import { CLUB_PROFILE } from './mock'

// 密碼政策(與後端一致):≥10 碼且含大小寫、數字、特殊符號
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/

interface SettingsValues {
  advisorName: string
  advisorDept?: string
  advisorEmail?: string
  advisorExt?: string
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

// 掛載當下讀取共用 mock 活值:存檔會寫回 CLUB_PROFILE,remount 必須帶到最新值
const buildInitial = (): SettingsValues => ({
  advisorName: '張教授',
  advisorDept: '資訊工程系',
  advisorEmail: 'advisor@mail.ntust.edu.tw',
  advisorExt: '6000',
  url: CLUB_PROFILE.url,
  intro: CLUB_PROFILE.intro,
  email1: CLUB_PROFILE.emails[0] ?? '',
  email2: CLUB_PROFILE.emails[1] ?? '',
  email3: CLUB_PROFILE.emails[2] ?? '',
  discordWebhook: '',
  pwCurrent: '',
  pwNew: '',
  pwConfirm: '',
})

const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, marginBottom: 16 }

// 全頁單一表單:被修改的欄位以橘黃外框標示(.field-dirty),右下角統一儲存
export default function ClubSettingsPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm<SettingsValues>()
  const [saved, setSaved] = useState<SettingsValues>(buildInitial)
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set())

  const recomputeDirty = () => {
    const cur = form.getFieldsValue(true) as SettingsValues
    const keys = (Object.keys(saved) as (keyof SettingsValues)[]).filter(
      (k) => (cur[k] ?? '') !== (saved[k] ?? ''),
    )
    setDirty(new Set(keys))
  }

  const itemClass = (k: keyof SettingsValues) => (dirty.has(k) ? 'field-dirty' : undefined)

  const onFinish = (v: SettingsValues) => {
    const changingPw = !!(v.pwCurrent || v.pwNew || v.pwConfirm)
    // 寫回共用 mock:評鑑「網頁經營」行政分即時反映
    CLUB_PROFILE.url = v.url?.trim() ?? ''
    CLUB_PROFILE.intro = v.intro ?? ''
    CLUB_PROFILE.emails = [v.email1, v.email2 ?? '', v.email3 ?? ''].map((e) => e?.trim() ?? '')

    message.success(changingPw ? '設定已儲存,密碼已更新' : '設定已儲存')
    const next: SettingsValues = { ...v, pwCurrent: '', pwNew: '', pwConfirm: '' }
    form.setFieldsValue({ pwCurrent: '', pwNew: '', pwConfirm: '' })
    setSaved(next)
    setDirty(new Set())
  }

  return (
    <div>
      <PageHeader title="管理項目" sub={user?.club} />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        修改過的欄位以橘黃外框標示,按右下角「儲存」一次生效。
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={saved}
        onValuesChange={recomputeDirty}
        onFinish={onFinish}
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
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>社團簡介</div>
            <Form.Item label="社團名稱">
              <Input readOnly value={user?.club} style={{ background: 'var(--paper)' }} />
            </Form.Item>
            <Form.Item
              name="url"
              label="社團網頁連結(影響評鑑「網頁經營」行政分)"
              className={itemClass('url')}
              rules={[{ type: 'url', message: '請輸入正確的網址' }]}
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
              label="聯絡 Email(至少 1 組,至多 3 組)"
              className={itemClass('email1')}
              rules={[
                { required: true, message: '請至少填寫一組聯絡 Email' },
                { type: 'email', message: 'Email 格式不正確' },
              ]}
            >
              <Input placeholder="主要聯絡信箱" />
            </Form.Item>
            <Form.Item
              name="email2"
              className={itemClass('email2')}
              rules={[{ type: 'email', message: 'Email 格式不正確' }]}
            >
              <Input placeholder="聯絡 Email 2(選填)" />
            </Form.Item>
            <Form.Item
              name="email3"
              className={itemClass('email3')}
              rules={[{ type: 'email', message: 'Email 格式不正確' }]}
            >
              <Input placeholder="聯絡 Email 3(選填)" />
            </Form.Item>
            <Form.Item
              name="discordWebhook"
              label="Discord Webhook URL(審核結果與提醒推送)"
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
            <div style={{ fontSize: 12, color: 'var(--steel)' }}>
              更換密碼後,其他已登入的裝置將被登出。
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16 }}>
          {dirty.size > 0 && (
            <span style={{ fontSize: 12, color: '#8A5A00' }}>
              有 <span className="num">{dirty.size}</span> 個欄位尚未儲存
            </span>
          )}
          <Button type="primary" htmlType="submit">儲存</Button>
        </div>
      </Form>
    </div>
  )
}
