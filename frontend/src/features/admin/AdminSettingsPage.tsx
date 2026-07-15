import { App, Button, DatePicker, Form, InputNumber, Select, Switch } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { BUDGET_CATEGORIES } from '../activities/types'
import { VIOL_ITEMS } from '../violations/mock'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1} 月` }))

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 14 }

// 系統設定(system_settings):散落各流程的可調參數集中於此;mock 儲存以 toast 示意
export default function AdminSettingsPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()

  return (
    <div>
      <PageHeader title="系統設定" />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        變更即時生效於對應流程;所有變更皆記入稽核軌跡。
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={() => message.success('系統設定已儲存')}
        initialValues={{
          fixedMonths: [6, 1],
          fixedOpenNow: true,
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
            <div style={sectionTitle}>報名與借用</div>
            <Form.Item name="regWindow" label="線上報名時間窗(窗外不可送出報名)">
              <DatePicker.RangePicker style={{ width: '100%' }} format="YYYY/MM/DD" />
            </Form.Item>
            <Form.Item name="fixedMonths" label="固定場地借用開放月份">
              <Select mode="multiple" options={MONTHS} placeholder="請選擇月份" />
            </Form.Item>
            <Form.Item name="fixedOpenNow" label="固定場地借用手動加開(不受月份限制)" valuePropName="checked">
              <Switch />
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
              <Select mode="tags" placeholder="輸入後按 Enter 新增" open={false} suffixIcon={null} />
            </Form.Item>
          </div>
          <div className="card" style={{ padding: 24 }}>
            <div style={sectionTitle}>經費科目</div>
            <Form.Item name="budgetCats" style={{ marginBottom: 0 }}>
              <Select mode="tags" placeholder="輸入後按 Enter 新增" open={false} suffixIcon={null} />
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
