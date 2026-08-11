import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { App, Button, Checkbox, DatePicker, Form, Input, Select, Switch } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import PageHeader from '../../components/ui/PageHeader'
import AnnouncementModal from '../../components/ui/AnnouncementModal'
import QueryError from '../../components/ui/QueryError'
import { Pager } from '../../components/ui/tableControls'
import { confirmDialog } from '../../lib/confirm'
import {
  resolveClubId,
  useAdminAnnouncements,
  useAnnouncementMutations,
  type AdminAnnouncement,
  type AnnouncementTarget,
} from '../../api/announcementsAdmin'
import { CLUB_ATTRIBUTES, useClubOptions } from '../../api/adminClubs'
import ClubCascader from './ClubCascader'
import { clickableProps } from '../../lib/clickable'

const PAGE_SIZE = 20

interface FormValues {
  title: string
  content: string
  target: AnnouncementTarget
  attrs?: string[]
  club?: string
  takeover?: boolean
  takeoverUntil?: Dayjs
  notify?: boolean
}

export default function AnnouncementsPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const target = Form.useWatch('target', form) as string | undefined
  const takeover = Form.useWatch('takeover', form) as boolean | undefined
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<AdminAnnouncement | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  // 蓋板開關已撥到「開」但尚未選截止日:未選日期前蓋板不生效
  const [takeoverDraft, setTakeoverDraft] = useState(false)

  const listQuery = useAdminAnnouncements({ page, pageSize: PAGE_SIZE })
  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  // 與 ClubCascader 同一份選項快取(任何管理員可讀):名稱 → id 對照用
  const clubsQuery = useClubOptions()
  const { create, setTakeover, remove } = useAnnouncementMutations()

  // 詳情彈窗顯示列表中的最新版本(切換蓋板即時反映);已刪除者退回快照,供關閉動畫期間顯示
  const shown = viewing ? (items.find((i) => i.id === viewing.id) ?? viewing) : null

  const view = (a: AdminAnnouncement) => {
    setViewing(a)
    setViewOpen(true)
    setTakeoverDraft(false)
  }

  const setTakeoverUntil = (id: number, until?: string) => {
    setTakeover.mutate(
      { id, until: until ?? null },
      { onError: (e) => message.error(e.message) },
    )
  }

  const onPublish = (values: FormValues) => {
    const clubId = values.target === 'club' ? resolveClubId(clubsQuery.data, values.club) : undefined
    if (values.target === 'club' && clubId == null) {
      message.error('無法識別所選社團,請重新選擇')
      return
    }
    create.mutate(
      {
        title: values.title,
        content: values.content,
        target: values.target,
        attrs: values.attrs,
        clubId,
        takeoverUntil: values.takeover && values.takeoverUntil ? values.takeoverUntil.format('YYYY/MM/DD') : undefined,
        notify: !!values.notify,
      },
      {
        onSuccess: () => {
          message.success(values.notify ? '公告已發布,並已寄送通知' : '公告已發布')
          form.resetFields()
          setPage(1)
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  const confirmDelete = (a: AdminAnnouncement, fromModal = false) =>
    confirmDialog(modal, {
      title: '刪除公告',
      content: `「${a.title}」刪除後將無法復原`,
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        remove.mutate(a.id, {
          onSuccess: () => {
            if (fromModal) setViewOpen(false)
            message.success('公告已刪除')
          },
          onError: (e) => message.error(e.message),
        })
      },
    })

  return (
    <div>
      <PageHeader title="發布系統公告" />

      <div className="card" style={{ marginTop: 20, padding: 24 }}>
        <Form form={form} layout="vertical" requiredMark initialValues={{ target: 'all' }} onFinish={onPublish}>
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
                <DatePicker
                  placeholder="蓋板截止日期"
                  format="YYYY/MM/DD"
                  disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
                />
              </Form.Item>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <Form.Item name="notify" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Checkbox>通知(寄送 Email 給各社聯絡人;已設定 Discord Webhook 的社團一併推送)</Checkbox>
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="primary" htmlType="submit" loading={create.isPending} disabled={create.isPending}>發布</Button>
          </div>
        </Form>
      </div>

      <LoadingBlock pending={listQuery.isPending}>
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: '16px 20px 8px' }}>已發布公告</div>
          {items.map((a) => (
            <div
              key={a.id}
              className="click-tint"
              {...clickableProps(() => view(a))}
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
          {listQuery.isError && (
            <div style={{ borderTop: '1px solid var(--line)' }}>
              <QueryError compact title="公告載入失敗" error={listQuery.error} onRetry={() => listQuery.refetch()} />
            </div>
          )}
          {!listQuery.isPending && !listQuery.isError && items.length === 0 && (
            <div style={{ padding: '18px 20px 22px', fontSize: 13, color: 'var(--steel)', borderTop: '1px solid var(--line)' }}>
              尚未發布任何公告
            </div>
          )}
        </div>
      </LoadingBlock>
      <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} style={{ padding: 0, marginTop: 14 }} />

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
                loading={setTakeover.isPending}
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
                  disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
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
