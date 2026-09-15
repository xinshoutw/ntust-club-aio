import { useState } from 'react'
import { App, Button, Form, Input } from 'antd'
import { confirmDialog } from '../../lib/confirm'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import SuspensionNote from '../../components/ui/SuspensionNote'
import { useUnsavedGuard } from '../../app/unsaved'
import { useClubProfile, useUpdateClubProfile, type ClubProfile } from '../../api/clubProfile'
import PublicSection from './PublicSection'
import {
  fromProfile,
  normalizeValue,
  profileChanged,
  toProfileInput,
  type SettingsValues,
} from './fields'

const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, marginBottom: 16 }

// 載入完成後才掛表單(initialValues 僅於掛載時生效)
export default function ClubSettingsPage() {
  const profileQuery = useClubProfile()
  if (!profileQuery.data) {
    return (
      <div>
        <PageHeader title="管理項目" />
        {profileQuery.isError ? (
          <div style={{ marginTop: 20 }}>
            <QueryError
              title="社團資料載入失敗"
              error={profileQuery.error}
              onRetry={() => void profileQuery.refetch()}
            />
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
  const { message, modal } = App.useApp()
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
      // 標籤是陣列、黑化程度是數字:`?? ''` 比不出差異(見 fields.normalizeValue)
      (k) => normalizeValue(cur[k]) !== normalizeValue(baseline[k]),
    )
    setDirty(new Set(keys))
  }

  const itemClass = (k: keyof SettingsValues) => (dirty.has(k) ? 'field-dirty' : undefined)

  // 預覽開的是公開頁,看到的是**已儲存**的內容 —— 有未存變更時先講清楚
  const previewPublicPage = () => {
    const open = () => window.open(`/clubs/${profile.id}`, '_blank', 'noopener')
    if (dirty.size === 0) {
      open()
      return
    }
    confirmDialog(modal, {
      title: '尚有未儲存的變更',
      content: '預覽顯示的是已儲存的內容，未儲存的修改不會出現',
      okText: '仍要預覽',
      cancelText: '取消',
      onOk: open,
    })
  }

  // 網頁連結與詳細介紹必填(D-19),但只在**這次真的要存 profile** 時擋:遷入的社團
  // 有一批簡介是空字串、網頁連結是 NULL(`migration/cms_import.py`),開頁就擋等於那些
  // 社團什麼都動不了。一旦動到 profile 的任何一欄,這兩欄就得補齊
  const requiredOnProfileSave = (msg: string) => ({
    validator: (_: unknown, v: string | undefined) => {
      const cur = form.getFieldsValue(true) as SettingsValues
      return profileChanged(cur, saved) && !v?.trim() ? Promise.reject(new Error(msg)) : Promise.resolve()
    },
  })

  const onFinish = async (v: SettingsValues) => {
    if (!profileChanged(v, saved)) {
      message.success('設定已儲存')
      return
    }
    let baseline = saved
    setSaving(true)
    try {
      const next = await update.mutateAsync(toProfileInput(v))
      baseline = fromProfile(next)
      setSaved(baseline)
      // 欄位要跟著回填:後端會正規化(instagram 取出帳號、主檔外的標籤丟掉、
      // 空白收成 null),不回填的話畫面上留著的是送出去的原始輸入,而基準已經
      // 前移 —— dirty 判定從此永遠為真,橘框不消、離頁一直被攔,資料其實早就存好了
      form.setFieldsValue(baseline)
      message.success('設定已儲存')
    } catch (e) {
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
        {/* 指導老師與內部聯絡設定並排 */}
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
              <Form.Item name="advisorDept" label="系所 / 職稱" className={itemClass('advisorDept')} style={{ marginBottom: 0 }}>
                <Input />
              </Form.Item>
              <Form.Item
                name="advisorEmail"
                label="Email"
                className={itemClass('advisorEmail')}
                rules={[{ type: 'email', message: 'Email 格式不正確' }]}
                // 電話移除後這一欄落單:讓 Email 跨滿一列(位址本來就長)
                style={{ marginBottom: 0, gridColumn: '1 / -1' }}
              >
                <Input />
              </Form.Item>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--steel)', margin: '16px 0 8px' }}>校外（選填）</div>
            <div className="form-grid-2">
              <Form.Item name="advisorOutName" label="姓名" className={itemClass('advisorOutName')} style={{ marginBottom: 0 }}>
                <Input />
              </Form.Item>
              <Form.Item name="advisorOutDept" label="單位 / 職稱" className={itemClass('advisorOutDept')} style={{ marginBottom: 0 }}>
                <Input />
              </Form.Item>
              <Form.Item
                name="advisorOutEmail"
                label="Email"
                className={itemClass('advisorOutEmail')}
                rules={[{ type: 'email', message: 'Email 格式不正確' }]}
                style={{ marginBottom: 0, gridColumn: '1 / -1' }}
              >
                <Input />
              </Form.Item>
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>內部聯絡與通知</div>
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
        </div>


        {/* 對外公開資料:唯一會被校外看到的一段,獨立成全寬區塊擺在對內設定之下 */}
        <PublicSection
          image={profile.public}
          name={profile.name}
          enName={profile.enName}
          itemClass={itemClass}
          onPreview={previewPublicPage}
          publicVisible={profile.publicVisible}
          requiredOnSave={requiredOnProfileSave}
        />

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
