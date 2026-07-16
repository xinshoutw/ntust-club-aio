import { useState } from 'react'
import dayjs from 'dayjs'
import { App, Button, Checkbox, DatePicker, Form, Input, Select, Switch } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import AnnouncementModal from '../../components/ui/AnnouncementModal'
import { confirmDialog } from '../../lib/confirm'
import { ANNOUNCEMENTS, type Announcement } from '../activities/mock'
import ClubCascader from './ClubCascader'
import { CLUB_ATTRIBUTES } from './clubsMock'

export default function AnnouncementsPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm()
  const target = Form.useWatch('target', form) as string | undefined
  const takeover = Form.useWatch('takeover', form) as boolean | undefined
  const notify = Form.useWatch('notify', form) as boolean | undefined
  const [items, setItems] = useState<Announcement[]>(ANNOUNCEMENTS)
  const [viewing, setViewing] = useState<Announcement | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  // 蓋板開關已撥到「開」但尚未選截止日:未選日期前蓋板不生效
  const [takeoverDraft, setTakeoverDraft] = useState(false)

  // 詳情彈窗顯示列表中的最新版本(切換蓋板即時反映);已刪除者退回快照,供關閉動畫期間顯示
  const shown = viewing ? (items.find((i) => i.id === viewing.id) ?? viewing) : null

  const view = (a: Announcement) => {
    setViewing(a)
    setViewOpen(true)
    setTakeoverDraft(false)
  }

  const setTakeoverUntil = (id: string, until?: string) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, takeoverUntil: until } : x)))
  }

  const confirmDelete = (a: Announcement, fromModal = false) =>
    confirmDialog(modal, {
      title: '刪除公告',
      content: `「${a.title}」刪除後將無法復原`,
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        setItems((prev) => prev.filter((x) => x.id !== a.id))
        if (fromModal) setViewOpen(false)
        message.success('公告已刪除')
      },
    })

  return (
    <div>
      <PageHeader title="發布系統公告" />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          initialValues={{ target: 'all' }}
          onFinish={() => {
            message.success(notify ? '公告已發布,並已寄送通知' : '公告已發布')
            form.resetFields()
          }}
        >
          <Form.Item name="title" label="標題" rules={[{ required: true, message: '請輸入標題' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label="內容(支援 Markdown)" rules={[{ required: true, message: '請輸入內容' }]}>
            <Input.TextArea rows={5} placeholder="支援 **粗體**、清單、連結等 Markdown 語法" />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item name="target" label="發布對象" style={{ marginBottom: 0 }}>
              <Select
                options={[
                  { value: 'all', label: '全校社團' },
                  { value: 'attr', label: '依社團性質' },
                  { value: 'club', label: '單一社團' },
                ]}
              />
            </Form.Item>
            {target === 'attr' && (
              <Form.Item name="attrs" label="性質(可複選)" preserve={false} rules={[{ required: true, message: '請選擇性質' }]} style={{ marginBottom: 0 }}>
                <Select mode="multiple" options={CLUB_ATTRIBUTES.map((a) => ({ value: a, label: a }))} placeholder="請選擇" />
              </Form.Item>
            )}
            {target === 'club' && (
              <Form.Item name="club" label="社團" preserve={false} rules={[{ required: true, message: '請選擇社團' }]} style={{ marginBottom: 0 }}>
                <ClubCascader width="100%" placeholder="請選擇" />
              </Form.Item>
            )}
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 18, alignItems: 'center' }}>
            <Form.Item name="takeover" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Checkbox>蓋板(每次登入全版顯示,5 秒後可關閉)</Checkbox>
            </Form.Item>
            {takeover && (
              <Form.Item
                name="takeoverUntil"
                preserve={false}
                rules={[{ required: true, message: '請選擇蓋板截止日期' }]}
                style={{ marginBottom: 0 }}
              >
                <DatePicker placeholder="蓋板截止日期" format="YYYY/MM/DD" />
              </Form.Item>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <Form.Item name="notify" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Checkbox>通知(寄送 Email 給各社聯絡人;已設定 Discord Webhook 的社團一併推送)</Checkbox>
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit">發布</Button>
          </div>
        </Form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>已發布公告</div>
        {items.map((a) => (
          <div
            key={a.id}
            className="click-tint"
            role="button"
            tabIndex={0}
            onClick={() => view(a)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                view(a)
              }
            }}
            style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{a.title}</div>
              {a.takeoverUntil && (
                <span className="num" style={{ fontSize: 12, color: '#8A5A00', background: '#FFF3D6', borderRadius: 4, padding: '1px 6px' }}>
                  蓋板至 {a.takeoverUntil}
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--steel)', background: '#EEF0F3', borderRadius: 4, padding: '1px 6px' }}>{a.scope}</span>
              <span className="num" style={{ fontSize: 12, color: 'var(--steel)' }}>{a.date}</span>
              <button
                type="button"
                className="link-btn danger"
                onClick={(e) => {
                  e.stopPropagation()
                  confirmDelete(a)
                }}
              >
                刪除
              </button>
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--steel)',
                lineHeight: 1.7,
                marginTop: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {a.content}
            </div>
          </div>
        ))}
      </div>

      <AnnouncementModal
        announcement={shown}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        afterClose={() => setViewing(null)}
        footerExtra={
          shown && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--steel)' }}>蓋板</span>
              <Switch
                checked={!!shown.takeoverUntil || takeoverDraft}
                onChange={(checked) => {
                  if (checked) {
                    // 開啟需先選截止日:未選日期前僅顯示日期欄,蓋板不生效
                    setTakeoverDraft(true)
                  } else {
                    setTakeoverDraft(false)
                    if (shown.takeoverUntil) setTakeoverUntil(shown.id, undefined)
                  }
                }}
              />
              {(!!shown.takeoverUntil || takeoverDraft) && (
                <DatePicker
                  value={shown.takeoverUntil ? dayjs(shown.takeoverUntil, 'YYYY/MM/DD') : null}
                  format="YYYY/MM/DD"
                  placeholder="蓋板截止日期"
                  onChange={(d) => {
                    if (d) {
                      setTakeoverUntil(shown.id, d.format('YYYY/MM/DD'))
                      setTakeoverDraft(false)
                    } else {
                      // 清除日期=蓋板失效,開關留在「開」等待重新選日
                      setTakeoverUntil(shown.id, undefined)
                      setTakeoverDraft(true)
                    }
                  }}
                />
              )}
              <div style={{ flex: 1 }} />
              <Button danger onClick={() => confirmDelete(shown, true)}>
                刪除
              </Button>
            </div>
          )
        }
      />
    </div>
  )
}
