import { useState } from 'react'
import { useNavigate } from 'react-router'
import { App, Button, DatePicker, Input, InputNumber, Select, TimePicker, Upload } from 'antd'
import { FileTextOutlined, InboxOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import StampTrail from '../../components/ui/StampTrail'
import { BUDGET_CATEGORIES, fmtMoney } from './types'

interface DraftBudgetRow {
  key: number
  category: string
  description: string
  selfFund: number | null
  requestedSubsidy: number | null
}

const field: React.CSSProperties = { display: 'block' }
const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginBottom: 6 }
const required = <span style={{ color: '#C13B34' }}> *</span>

export default function ActivityFormPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [rows, setRows] = useState<DraftBudgetRow[]>([
    { key: 1, category: '演講/裁判費', description: '', selfFund: null, requestedSubsidy: null },
  ])
  const [nextKey, setNextKey] = useState(2)

  const totals = rows.reduce(
    (acc, r) => ({ self: acc.self + (r.selfFund ?? 0), requested: acc.requested + (r.requestedSubsidy ?? 0) }),
    { self: 0, requested: 0 },
  )

  const updateRow = (key: number, patch: Partial<DraftBudgetRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const addRow = () => {
    setRows((rs) => [...rs, { key: nextKey, category: '印刷費', description: '', selfFund: null, requestedSubsidy: null }])
    setNextKey((k) => k + 1)
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title="活動申請" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        申請活動或社課,核准後辦理;辦理後 <span className="num">1</span> 個月內須完成結案。
      </div>

      <div className="card" style={{ marginTop: 20, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--steel)' }}>送出後審核流程</div>
          <StampTrail
            width={340}
            stages={[
              { char: '輔', label: '輔導老師', state: 'todo' },
              { char: '組', label: '組長', state: 'todo' },
              { char: '長', label: '學務長', state: 'todo' },
            ]}
          />
          <div style={{ fontSize: 12, color: 'var(--steel)', flex: 1, minWidth: 160 }}>
            含經費之申請經三關審核;無經費活動僅輔導老師單關。
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>基本資料</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-grid-2">
            <label style={field}>
              <div style={fieldLabel}>活動名稱{required}</div>
              <Input placeholder="活動名稱" />
            </label>
            <label style={field}>
              <div style={fieldLabel}>活動類型{required}</div>
              <Select
                style={{ width: '100%' }}
                defaultValue="一般活動"
                options={['一般活動', '社課', '大型活動'].map((v) => ({ value: v, label: v }))}
              />
            </label>
          </div>
          <div className="form-grid-2">
            <label style={field}>
              <div style={fieldLabel}>活動日期{required}</div>
              <DatePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
            </label>
            <label style={field}>
              <div style={fieldLabel}>活動時間</div>
              <TimePicker.RangePicker style={{ width: '100%' }} format="HH:mm" />
            </label>
          </div>
          <div className="form-grid-2">
            <label style={field}>
              <div style={fieldLabel}>地點</div>
              <Input placeholder="活動地點" />
            </label>
            <div>
              <div style={fieldLabel}>參加人數(校內 / 校外)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <InputNumber style={{ width: '100%' }} min={0} aria-label="校內人數" placeholder="校內" />
                <InputNumber style={{ width: '100%' }} min={0} aria-label="校外人數" placeholder="校外" />
              </div>
            </div>
          </div>
          <label style={field}>
            <div style={fieldLabel}>活動內容</div>
            <Input.TextArea rows={3} placeholder="活動目的、內容、預期效益" />
          </label>
          <label style={field}>
            <div style={fieldLabel}>工作分配</div>
            <Input placeholder="例:總召>顏志明;器材>張晉安" />
          </label>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>經費明細</div>
          <div style={{ fontSize: 12, color: 'var(--steel)' }}>逐項編列;送出後由各關逐項核定金額</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tb" style={{ marginTop: 12, minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 0, width: 160 }}>摘要</th>
                <th>經費說明</th>
                <th className="r" style={{ width: 110 }}>自籌</th>
                <th className="r" style={{ width: 110 }}>擬請補助</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="no-hover">
                  <td style={{ paddingLeft: 0, padding: '8px 12px 8px 0' }}>
                    <Select
                      size="middle"
                      style={{ width: '100%' }}
                      value={r.category}
                      onChange={(v) => updateRow(r.key, { category: v })}
                      options={BUDGET_CATEGORIES.map((c) => ({ value: c, label: c }))}
                    />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <Input
                      value={r.description}
                      onChange={(e) => updateRow(r.key, { description: e.target.value })}
                      placeholder="用途說明"
                    />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={r.selfFund}
                      onChange={(v) => updateRow(r.key, { selfFund: v })}
                      controls={false}
                    />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={r.requestedSubsidy}
                      onChange={(v) => updateRow(r.key, { requestedSubsidy: v })}
                      controls={false}
                    />
                  </td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ padding: '12px 12px 4px 0', fontSize: 13, fontWeight: 500, textAlign: 'right', borderBottom: 'none' }}>
                  合計
                </td>
                <td className="r num" style={{ padding: '12px 12px 4px', fontWeight: 500, borderBottom: 'none' }}>
                  {fmtMoney(totals.self)}
                </td>
                <td className="r num" style={{ padding: '12px 12px 4px', fontWeight: 500, borderBottom: 'none' }}>
                  {fmtMoney(totals.requested)}
                </td>
                <td style={{ borderBottom: 'none' }} />
              </tr>
            </tfoot>
          </table>
        </div>
        <Button style={{ marginTop: 12, height: 34 }} onClick={addRow}>
          + 新增經費項目
        </Button>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>附件</div>
        <Upload.Dragger multiple beforeUpload={() => false} showUploadList={false} style={{ background: 'transparent' }}>
          <p style={{ margin: '4px 0 8px' }}>
            <InboxOutlined style={{ fontSize: 28, color: 'var(--steel)' }} />
          </p>
          <p style={{ fontSize: 13, color: 'var(--steel)', margin: 0 }}>
            拖放檔案至此,或點擊選擇(企劃書、估價單;PDF)
          </p>
        </Upload.Dragger>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px 2px', fontSize: 13 }}>
          <FileTextOutlined style={{ color: 'var(--steel)' }} />
          <span style={{ fontWeight: 500 }}>資訊週_企劃書.pdf</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>2.1 MB</span>
          <span style={{ color: 'var(--steel)' }}>顏志明</span>
          <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>07/10 14:22</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="link-btn danger">移除</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <Button onClick={() => message.success('已暫存草稿')}>暫存草稿</Button>
        <Button
          type="primary"
          onClick={() => {
            message.success('已送出申請')
            navigate('/activities')
          }}
        >
          送出申請
        </Button>
      </div>
    </div>
  )
}
