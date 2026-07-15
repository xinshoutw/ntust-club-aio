import { useMemo, useState } from 'react'
import { App, Button, Dropdown, Form, Input, Modal, Pagination, Popconfirm, Select, Upload } from 'antd'
import { DownOutlined, DownloadOutlined, EditOutlined, FilterOutlined, SwapOutlined, UploadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { neutralizeFormula } from '../../lib/csv'
import { CURRENT_SEMESTER, semesterOptions } from '../../lib/semester'
import { MEMBERS, type Member } from './mock'

const KINDS: Member['kind'][] = ['社員', '幹部', '副社長／副會長', '社長／會長']
const PAGE_SIZE = 50

export default function MembersPage() {
  const { message } = App.useApp()
  const [members, setMembers] = useState<Member[]>(MEMBERS)
  const [addOpen, setAddOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [csvSemester, setCsvSemester] = useState<string>(CURRENT_SEMESTER)
  const [semester, setSemester] = useState<string>(CURRENT_SEMESTER)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ key: 'kind' | 'title'; dir: 1 | -1 } | null>(null)
  const [kindFilter, setKindFilter] = useState<Member['kind'][]>([])
  const [editing, setEditing] = useState<{ id: number; field: 'kind' | 'title' } | null>(null)
  const [form] = Form.useForm()
  const kind = Form.useWatch('kind', form)

  const nextId = () => Math.max(0, ...members.map((m) => m.id)) + 1
  // 頁面目前顯示的學期(「全部學期」時退回當前學期),作為各對話框的預設
  const pageSemester = semester === 'all' ? CURRENT_SEMESTER : semester

  const onAdd = (values: { name: string; studentId: string; kind: Member['kind']; title?: string; semester: string }) => {
    setMembers((ms) => [...ms, { id: nextId(), updatedAt: '—(未儲存)', ...values }])
    setAddOpen(false)
    form.resetFields()
    message.success('已新增社員')
  }

  // CSV:姓名,學號,身份[,職稱];身份留空視為社員,無法辨識的列略過並提示
  const importCsv = (text: string) => {
    const rows = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(/[,\t]/).map((c) => c.trim()))
    const valid: Member[] = []
    const skipped: number[] = []
    let base = nextId()
    rows.forEach((cols, i) => {
      const [name, studentId, k, title] = cols
      const kind = (k ?? '').replace(/\//g, '／')
      const memberKind = kind === '' ? '社員' : (KINDS as string[]).includes(kind) ? (kind as Member['kind']) : null
      if (!name || !studentId || !memberKind) {
        skipped.push(i + 1)
        return
      }
      valid.push({
        id: base++,
        name,
        studentId,
        kind: memberKind,
        title: memberKind === '幹部' ? title || undefined : undefined,
        semester: csvSemester,
        updatedAt: '—(未儲存)',
      })
    })
    if (!valid.length) {
      message.error('沒有可匯入的資料;格式:姓名,學號,身份[,職稱]')
      return
    }
    if (skipped.length) {
      message.warning(`第 ${skipped.join('、')} 行缺欄位或身份無法辨識,已略過`)
    }
    setMembers((ms) => [...ms, ...valid])
    setCsvOpen(false)
    setCsvText('')
    message.success(`已匯入 ${valid.length} 名社員至 ${csvSemester}`)
  }

  const exportCsv = () => {
    const rows = members.filter((m) => m.semester === csvSemester)
    if (!rows.length) {
      message.error(`${csvSemester} 沒有成員可匯出`)
      return
    }
    // 維持匯入相容格式(無標題列、不加引號);職稱補空字串讓各列欄數一致;中和 Excel 公式前綴
    const text = rows
      .map((m) => [m.name, m.studentId, m.kind, m.title ?? ''].map(neutralizeFormula).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `成員名單_${csvSemester}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
    message.success(`已匯出 ${rows.length} 名成員(${csvSemester})`)
  }

  const update = (id: number, patch: Partial<Member>) => {
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: '剛剛' } : m)))
    message.success('已自動儲存')
  }

  const view = useMemo(() => {
    let list = members.filter((m) => semester === 'all' || m.semester === semester)
    if (kindFilter.length) list = list.filter((m) => kindFilter.includes(m.kind))
    if (sort) {
      list = [...list].sort(
        (a, b) => sort.dir * String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'zh-Hant'),
      )
    }
    return list
  }, [members, semester, kindFilter, sort])

  const paged = view.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const toggleSort = (key: 'kind' | 'title') =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))

  return (
    <div>
      <PageHeader
        title="成員列表"
        sub={ <> 共 <span className="num">{view.length}</span> 人 </> }
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Select
              value={semester}
              onChange={(v) => {
                setSemester(v)
                setPage(1)
              }}
              style={{ width: 120 }}
              options={semesterOptions(members.map((m) => m.semester), true)}
            />
            <Button
              style={{ height: 36 }}
              icon={<UploadOutlined />}
              onClick={() => {
                setCsvSemester(pageSemester)
                setCsvOpen(true)
              }}
            >
              匯入 CSV
            </Button>
            <Button
              style={{ height: 36 }}
              icon={<DownloadOutlined />}
              onClick={() => {
                setCsvSemester(pageSemester)
                setExportOpen(true)
              }}
            >
              匯出 CSV
            </Button>
            <Button
              type="primary"
              style={{ height: 36 }}
              onClick={() => {
                form.setFieldsValue({ semester: pageSemester })
                setAddOpen(true)
              }}
            >
              + 新增社員
            </Button>
          </div>
        }
      />

      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              <th>姓名</th>
              <th>學號</th>
              <th>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <button type="button" className="link-btn" style={{ padding: 0, fontWeight: 500, color: sort?.key === 'kind' ? 'var(--seal)' : undefined }} onClick={() => toggleSort('kind')}>
                    身份 <SwapOutlined rotate={90} style={{ fontSize: 11 }} />
                  </button>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: KINDS.map((k) => ({ key: k, label: k })),
                      selectable: true,
                      multiple: true,
                      selectedKeys: kindFilter,
                      onSelect: ({ selectedKeys }) => { setKindFilter(selectedKeys as Member['kind'][]); setPage(1) },
                      onDeselect: ({ selectedKeys }) => { setKindFilter(selectedKeys as Member['kind'][]); setPage(1) },
                    }}
                  >
                    <button type="button" className="link-btn" aria-label="篩選身份" style={{ padding: 0 }}>
                      <FilterOutlined style={{ fontSize: 11, color: kindFilter.length ? 'var(--seal)' : 'var(--steel)' }} />
                    </button>
                  </Dropdown>
                </span>
              </th>
              <th>
                <button type="button" className="link-btn" style={{ padding: 0, fontWeight: 500, color: sort?.key === 'title' ? 'var(--seal)' : undefined }} onClick={() => toggleSort('title')}>
                  職稱 <SwapOutlined rotate={90} style={{ fontSize: 11 }} />
                </button>
              </th>
              <th>學期</th>
              <th>更新時間</th>
              <th className="r">動作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((m) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 500 }}>{m.name}</td>
                <td className="num" style={{ color: 'var(--steel)' }}>{m.studentId}</td>
                <td>
                  {editing?.id === m.id && editing.field === 'kind' ? (
                    <Select
                      size="small"
                      autoFocus
                      defaultOpen
                      value={m.kind}
                      style={{ width: 150 }}
                      options={KINDS.map((k) => ({ value: k, label: k }))}
                      onChange={(v) => {
                        // 職稱僅幹部有;換成其他身份一律清除,避免殘留舊職稱
                        update(m.id, { kind: v, ...(v === '幹部' ? {} : { title: undefined }) })
                        setEditing(null)
                      }}
                      onBlur={() => setEditing(null)}
                    />
                  ) : (
                    <button type="button" className="link-btn" style={{ padding: 0, color: 'var(--ink)' }} onClick={() => setEditing({ id: m.id, field: 'kind' })}>
                      {m.kind} <DownOutlined style={{ fontSize: 10, color: 'var(--steel)' }} />
                    </button>
                  )}
                </td>
                <td>
                  {editing?.id === m.id && editing.field === 'title' ? (
                    <Input
                      size="small"
                      autoFocus
                      defaultValue={m.title}
                      style={{ width: 120 }}
                      onBlur={(e) => {
                        update(m.id, { title: e.target.value.trim() || undefined })
                        setEditing(null)
                      }}
                      onPressEnter={(e) => {
                        update(m.id, { title: (e.target as HTMLInputElement).value.trim() || undefined })
                        setEditing(null)
                      }}
                    />
                  ) : m.kind !== '幹部' ? (
                    <span style={{ color: 'var(--muted)' }}>—</span>
                  ) : (
                    <button type="button" className="link-btn" style={{ padding: 0, color: 'var(--ink)' }} onClick={() => setEditing({ id: m.id, field: 'title' })}>
                      {m.title ?? '(未填)'} <EditOutlined style={{ fontSize: 11, color: 'var(--steel)' }} />
                    </button>
                  )}
                </td>
                <td className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.semester}</td>
                <td className="num" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.updatedAt}</td>
                <td className="r">
                  <Popconfirm
                    title={`移除 ${m.name}?`}
                    okText="移除"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={() => setMembers((ms) => ms.filter((x) => x.id !== m.id))}
                  >
                    <Button size="small" danger>移除</Button>
                  </Popconfirm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.length > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <Pagination current={page} pageSize={PAGE_SIZE} total={view.length} onChange={setPage} showSizeChanger={false} />
        </div>
      )}

      <Modal
        open={addOpen}
        title="新增社員"
        onCancel={() => {
          setAddOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText="新增"
      >
        <Form form={form} layout="vertical" onFinish={onAdd} initialValues={{ kind: '社員', semester: CURRENT_SEMESTER }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '請輸入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="studentId" label="學號" rules={[{ required: true, message: '請輸入學號' }]}>
            <Input className="num" />
          </Form.Item>
          <Form.Item name="semester" label="學期" rules={[{ required: true }]}>
            <Select options={semesterOptions(members.map((m) => m.semester))} />
          </Form.Item>
          <Form.Item name="kind" label="身份" rules={[{ required: true }]}>
            <Select options={KINDS.map((k) => ({ value: k, label: k }))} />
          </Form.Item>
          {kind === '幹部' && (
            <Form.Item name="title" label="職稱" preserve={false} rules={[{ required: true, message: '請填寫職稱' }]}>
              <Input placeholder="例:總務、活動" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        open={csvOpen}
        title="匯入社員(CSV)"
        onCancel={() => setCsvOpen(false)}
        onOk={() => importCsv(csvText)}
        okText="匯入"
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 10 }}>
          每行一人:<span className="num">姓名,學號,身份[,職稱]</span>;可上傳 .csv 或直接貼上。
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13 }}>匯入至學期</span>
          <Select value={csvSemester} onChange={setCsvSemester} style={{ width: 110 }} options={semesterOptions(members.map((m) => m.semester))} />
        </div>
        <Upload
          accept=".csv,.txt"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(f) => {
            f.text().then(setCsvText)
            return false
          }}
        >
          <Button icon={<UploadOutlined />} style={{ marginBottom: 10 }}>選擇 CSV 檔</Button>
        </Upload>
        <Input.TextArea
          rows={6}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={'王小明,B11100001,幹部,活動\n林大同,B11100002,社員'}
        />
      </Modal>

      <Modal
        open={exportOpen}
        title="匯出社員(CSV)"
        destroyOnHidden
        onCancel={() => setExportOpen(false)}
        onOk={exportCsv}
        okText="匯出"
        okButtonProps={{ autoFocus: true }}
      >
        <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 10 }}>
          匯出所選學期的成員名單(格式同匯入),可直接匯入至其他學期。
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>匯出學期</span>
          <Select value={csvSemester} onChange={setCsvSemester} style={{ width: 110 }} options={semesterOptions(members.map((m) => m.semester))} />
          <span style={{ fontSize: 13, color: 'var(--steel)' }}>
            共 <span className="num">{members.filter((m) => m.semester === csvSemester).length}</span> 人
          </span>
        </div>
      </Modal>
    </div>
  )
}
