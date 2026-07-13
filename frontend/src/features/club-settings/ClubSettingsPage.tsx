import { App, Button, Form, Input } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import { useAuth } from '../../app/auth'
import { CLUB_PROFILE } from './mock'

export default function ClubSettingsPage() {
  const { user } = useAuth()
  const { message } = App.useApp()

  return (
    <div>
      <PageHeader title="管理項目" sub={user?.club} />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>指導老師</div>
        <Form
          layout="vertical"
          onFinish={() => message.success('已儲存指導老師資料')}
          initialValues={{ name: '張教授', dept: '資訊工程系', email: 'advisor@mail.ntust.edu.tw', ext: '6000' }}
        >
          <div className="form-grid-2">
            <Form.Item name="name" label="姓名" rules={[{ required: true, message: '請輸入姓名' }]} style={{ marginBottom: 0 }}>
              <Input />
            </Form.Item>
            <Form.Item name="dept" label="系所" style={{ marginBottom: 0 }}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email 格式不正確' }]} style={{ marginBottom: 0 }}>
              <Input />
            </Form.Item>
            <Form.Item name="ext" label="分機" style={{ marginBottom: 0 }}>
              <Input className="num" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit">儲存</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>社團簡介</div>
        <Form
          layout="vertical"
          onFinish={(v: { url?: string; intro?: string }) => {
            // 寫回共用 mock:評鑑「網頁經營」行政分即時反映
            CLUB_PROFILE.url = v.url?.trim() ?? ''
            CLUB_PROFILE.intro = v.intro ?? ''
            message.success('社團簡介已更新')
          }}
          initialValues={{ name: user?.club, url: CLUB_PROFILE.url, intro: CLUB_PROFILE.intro }}
        >
          <Form.Item name="name" label="社團名稱">
            <Input readOnly style={{ background: 'var(--paper)' }} />
          </Form.Item>
          <Form.Item
            name="url"
            label="社團網頁連結(影響評鑑「網頁經營」行政分)"
            rules={[{ type: 'url', message: '請輸入正確的網址' }]}
          >
            <Input placeholder="https://" />
          </Form.Item>
          <Form.Item name="intro" label="簡介">
            <Input.TextArea rows={4} placeholder="社團宗旨、特色" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" htmlType="submit">儲存</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>即時通知 Webhook</div>
        <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 16 }}>
          審核結果與提醒將推送到你的 Discord 頻道;Telegram Bot 之後提供。
        </div>
        <Form
          layout="vertical"
          onFinish={() => message.success('Webhook 已儲存,將發送測試訊息')}
        >
          <Form.Item
            name="discordWebhook"
            label="Discord Webhook URL"
            rules={[
              {
                pattern: /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/.+/,
                message: '格式須為 https://discord.com/api/webhooks/…',
              },
            ]}
          >
            <Input placeholder="https://discord.com/api/webhooks/…" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" htmlType="submit">儲存</Button>
          </div>
        </Form>
      </div>
    </div>
  )
}
