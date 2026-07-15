import { useState } from 'react'
import { App, Button, DatePicker, Form, Input, InputNumber, Select, Tag } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { BUDGET_CATEGORIES } from '../activities/types'
import { VIOL_ITEMS } from '../violations/mock'

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 14 }

// 純 tag 輸入(無下拉選單):輸入後 Enter/逗號/頓號/失焦即新增
// (Select mode="tags" 會彈出下拉且 open={false} 會壞掉 Enter,需求方指定移除下拉)
function TagListInput({ value = [], onChange }: { value?: string[]; onChange?: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    // 同批輸入也去重(避免「甲,甲」產生重複 tag / 重複 key)
    const parts = [...new Set(raw.split(/[,、]/).map((s) => s.trim()))].filter((s) => s && !value.includes(s))
    if (parts.length) onChange?.([...value, ...parts])
    setDraft('')
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {value.map((item) => (
        <Tag
          key={item}
          closable
          onClose={(e) => {
            e.preventDefault()
            onChange?.(value.filter((x) => x !== item))
          }}
          style={{ margin: 0, fontSize: 13, padding: '2px 8px' }}
        >
          {item}
        </Tag>
      ))}
      <Input
        size="small"
        style={{ width: 180 }}
        placeholder="輸入後按 Enter 新增"
        value={draft}
        onChange={(e) => {
          // 打出逗號/頓號當下即成 tag(對齊原 tokenSeparators 行為)
          if (/[,、]$/.test(e.target.value)) commit(e.target.value)
          else setDraft(e.target.value)
        }}
        onPressEnter={(e) => {
          e.preventDefault()
          commit(draft)
        }}
        onBlur={() => draft.trim() && commit(draft)}
      />
    </div>
  )
}

// 系統設定(system_settings):散落各流程的可調參數集中於此;mock 儲存以 toast 示意
export default function AdminSettingsPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()

  return (
    <div>
      <PageHeader title="系統設定" />

      <Form
        form={form}
        layout="vertical"
        onFinish={() => message.success('系統設定已儲存')}
        initialValues={{
          loanBefore: 2,
          loanAfter: 1,
          closeLockMonths: 1,
          docMb: 50,
          imgMb: 10,
          zipMb: 100,
          videoMb: 200,
          violItems: VIOL_ITEMS,
          budgetCats: BUDGET_CATEGORIES,
          evalYearLabel: '116 年社團競賽',
        }}
      >
        <div className="form-grid-2" style={{ marginTop: 20, alignItems: 'stretch' }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>借用</div>
            <Form.Item name="fixedWindow" label="固定場地借用受理期間(期間外不開放申請)">
              <DatePicker.RangePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
            </Form.Item>
            <div className="form-grid-2">
              <Form.Item name="loanBefore" label="器材借用:活動前緩衝(工作天)" style={{ marginBottom: 0 }}>
                <InputNumber min={0} max={10} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="loanAfter" label="活動後緩衝(工作天)" style={{ marginBottom: 0 }}>
                <InputNumber min={0} max={10} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>活動與評鑑</div>
            <Form.Item name="closeLockMonths" label="活動結案期限(活動結束後 N 個月未結案即鎖定)">
              <InputNumber min={1} max={6} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="evalYearLabel" label="評鑑年度">
              <Select
                options={[
                  { value: '116 年社團競賽', label: '116 年(採計 2026/02/01 – 2027/01/31)' },
                  { value: '117 年社團競賽', label: '117 年(採計 2027/02/01 – 2028/01/31)' },
                ]}
              />
            </Form.Item>
            <div className="form-grid-2">
              <Form.Item name="docMb" label="文件上限(MB)" style={{ marginBottom: 0 }}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="imgMb" label="圖片上限(MB)" style={{ marginBottom: 0 }}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="zipMb" label="壓縮檔上限(MB)" style={{ marginBottom: 0 }}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="videoMb" label="維修影片上限(MB)" style={{ marginBottom: 0 }}>
                <InputNumber min={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </div>
        </div>

        <div className="form-grid-2" style={{ marginTop: 16, alignItems: 'stretch' }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>違規項目目錄</div>
            <Form.Item name="violItems" style={{ marginBottom: 0 }}>
              <TagListInput />
            </Form.Item>
          </div>
          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>經費科目</div>
            <Form.Item name="budgetCats" style={{ marginBottom: 0 }}>
              <TagListInput />
            </Form.Item>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button type="primary" htmlType="submit">儲存</Button>
        </div>
      </Form>
    </div>
  )
}
