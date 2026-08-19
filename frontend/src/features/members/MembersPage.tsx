import { useState } from 'react'
import { countText } from '../../lib/counts'
import { App, Button, Form, Input, Modal, Popconfirm, Select, Upload } from 'antd'
import LoadingBlock from '../../components/ui/LoadingBlock'
import { DownOutlined, DownloadOutlined, EditOutlined, UploadOutlined } from '@ant-design/icons'
import OptionsError from '../../components/ui/OptionsError'
import PageHeader from '../../components/ui/PageHeader'
import QueryError from '../../components/ui/QueryError'
import { Cols, FilterButton, MultiSortButton, Pager, sortParam, useMultiSort } from '../../components/ui/tableControls'
import { downloadCsv } from '../../lib/csv'
import { MEMBER_KINDS, kindLabel, type MemberKind } from '../../lib/roles'
import { currentSemester } from '../../lib/semester'
import { useMemberTimeColumns } from '../../lib/memberTable'
import { useAuth } from '../../app/auth'
import {
  fetchAllMembers,
  useMemberMutations,
  useMemberSemesters,
  useMembers,
  type Member,
} from '../../api/members'

const PAGE_SIZE = 50
// 伺服器端排序白名單(後端 /club/members _SORTABLE);kind 排序鍵=身份權重
type MemberSortKey = 'name' | 'student_id' | 'kind' | 'title' | 'semester' | 'created_at' | 'updated_at'

export default function MembersPage() {
  const { message } = App.useApp()
  const { user } = useAuth()
  // 身份顯示依社團 kind 推導(社團→社長、學會→會長);儲存值一律為標準身份
  const label = (k: MemberKind) => kindLabel(k, user?.clubKind)
  const kindOptions = MEMBER_KINDS.map((k) => ({ value: k, label: label(k) }))

  const [addOpen, setAddOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [csvSemester, setCsvSemester] = useState<string>(currentSemester())
  const [semester, setSemester] = useState<string>(currentSemester())
  const [page, setPage] = useState(1)
  // 預設排序=後端預設(身份權重→學號,準則 4 名冊慣例):未點排序時不送 sort 參數
  const { entries, toggle } = useMultiSort<MemberSortKey>()
  const { showJoined, showUpdated } = useMemberTimeColumns(entries.map((e) => e.key))
  // 姓名/學號/身份/職稱/電話/學期 + 兩個時間欄 + 動作
  const colCount = 7 + Number(showJoined) + Number(showUpdated)
  // 篩選值為顯示詞(社長/會長依社團名稱推導),查詢時轉回標準身份
  const [kindFilter, setKindFilter] = useState<string[]>([])
  const [editing, setEditing] = useState<{ id: number; field: 'kind' | 'title' | 'phone' } | null>(null)
  const [form] = Form.useForm()
  const kind = Form.useWatch('kind', form)

  const semestersQuery = useMemberSemesters()
  // 學期下拉:名單既有學期 + 當前學期(可能尚無資料)
  const semesters = [...new Set([currentSemester(), ...(semestersQuery.data ?? [])])].sort().reverse()
  const semesterOpts = semesters.map((s) => ({ value: s, label: s }))
  const kinds = kindFilter.length
    ? MEMBER_KINDS.filter((k) => kindFilter.includes(label(k)))
    : undefined

  const listQuery = useMembers({
    semester: semester === 'all' ? undefined : semester,
    kinds,
    sort: sortParam(entries),
    page,
    pageSize: PAGE_SIZE,
  })
  const members = listQuery.data?.members ?? []
  const total = listQuery.data?.total ?? 0

  const { create, update, remove, importCsv } = useMemberMutations()

  // 頁面目前顯示的學期(「全部學期」時退回當前學期),作為各對話框的預設
  const pageSemester = semester === 'all' ? currentSemester() : semester

  const onAdd = (values: { name: string; studentId: string; kind: MemberKind; title?: string; phone?: string; semester: string }) => {
    // 表單無 submit 鈕,Enter 會直接送 form;confirmLoading 只擋 OK 鈕,攔不到
    if (create.isPending) return
    create.mutate(values, {
      onSuccess: () => {
        setAddOpen(false)
        form.resetFields()
        message.success('已新增社員')
      },
      onError: (e) => message.error(e.message),
    })
  }

  const doImport = () => {
    if (!csvText.trim()) {
      message.error('請先選擇檔案或貼上內容。格式：姓名,學號,身份[,職稱[,電話]]')
      return
    }
    importCsv.mutate(
      { csvText, semester: csvSemester },
      {
        onSuccess: (result) => {
          if (result.errors.length) {
            message.warning(`已匯入 ${result.created + result.updated} 筆;${result.errors[0]} 等 ${result.errors.length} 項問題`)
          } else if (result.created + result.updated === 0) {
            message.info('匯入內容與原名單相同')
          } else {
            message.success(`已匯入 ${result.created + result.updated} 名社員至 ${csvSemester}`)
          }
          setCsvOpen(false)
          setCsvText('')
        },
        onError: (e) => message.error(e.message),
      },
    )
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const rows = await fetchAllMembers(csvSemester)
      if (!rows.length) {
        message.error(`${csvSemester} 沒有成員可匯出`)
        return
      }
      // 匯入相容格式(無標題列;後端 csv.reader 支援引號跳脫);身份以顯示詞輸出(匯入可回讀);
      // 職稱補空字串讓各列欄數一致
      downloadCsv(
        `成員名單_${csvSemester}.csv`,
        rows.map((m) => [m.name, m.studentId, label(m.kind), m.title ?? '', m.phone ?? '']),
      )
      setExportOpen(false)
      message.success(`已匯出 ${rows.length} 名成員(${csvSemester})`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  const patchMember = (id: number, patch: { kind?: MemberKind; title?: string | null; phone?: string | null }) => {
    update.mutate(
      { id, ...patch },
      {
        onSuccess: () => message.success('已儲存'),
        onError: (e) => message.error(e.message),
      },
    )
  }

  const toggleSort = (key: MemberSortKey) => {
    toggle(key)
    setPage(1)
  }
  const sortHeader = (label: string, key: MemberSortKey) => (
    <MultiSortButton label={label} sortKey={key} entries={entries} onToggle={toggleSort} />
  )

  return (
    <div>
      <PageHeader
        title="成員列表"
        sub={ <> 共 <span className="num">{countText(total, listQuery)}</span> 人 </> }
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* 選單一定有當學期,所以查詢掛掉時看起來完全正常 —— 只是歷史學期全不見了 */}
            {semestersQuery.isError && (
              <OptionsError
                what="學期清單"
                error={semestersQuery.error}
                onRetry={() => void semestersQuery.refetch()}
              />
            )}
            <Select
              value={semester}
              onChange={(v) => {
                setSemester(v)
                setPage(1)
              }}
              style={{ width: 120 }}
              options={[{ value: 'all', label: '全部學期' }, ...semesterOpts]}
            />
            <Button
              icon={<UploadOutlined />}
              onClick={() => {
                setCsvSemester(pageSemester)
                setCsvOpen(true)
              }}
            >
              匯入 CSV
            </Button>
            <Button
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
        <LoadingBlock pending={listQuery.isPending}>
          <table className="tb fixed" style={{ minWidth: 860 }}>
            {/* 兩個時間欄依 showJoined/showUpdated 增減,colgroup 要跟著長短。
                姓名放得下四字中文名、學號放得下 9 碼、電話放得下 10 碼不截斷,職稱固定為身份的 1.5 倍;
                餘裕由靠右的動作欄吸收(給 auto 的欄才不會被 table-layout:fixed 按比例攤回去) */}
            <Cols widths={[100, 130, 120, 180, 140, 80, ...(showJoined ? [134] : []), ...(showUpdated ? [134] : []), 'auto']} />
            <thead>
              <tr>
                <th scope="col">{sortHeader('姓名', 'name')}</th>
                <th scope="col">{sortHeader('學號', 'student_id')}</th>
                <th scope="col">
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {sortHeader('身份', 'kind')}
                    <FilterButton
                      options={MEMBER_KINDS.map((k) => label(k))}
                      selected={kindFilter}
                      onChange={(next) => {
                        setKindFilter(next)
                        setPage(1)
                      }}
                      label="篩選身份"
                    />
                  </span>
                </th>
                <th scope="col">{sortHeader('職稱', 'title')}</th>
                <th scope="col">電話</th>
                <th scope="col">{sortHeader('學期', 'semester')}</th>
                {showJoined && <th scope="col">{sortHeader('入社時間', 'created_at')}</th>}
                {showUpdated && <th scope="col">{sortHeader('更新時間', 'updated_at')}</th>}
                <th scope="col" className="r">動作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m: Member) => (
                <tr key={m.id}>
                  <td className="cell-clip" style={{ fontWeight: 500 }} title={m.name}>{m.name}</td>
                  <td className="num cell-clip" style={{ color: 'var(--steel)' }}>{m.studentId}</td>
                  <td className="cell-clip">
                    {editing?.id === m.id && editing.field === 'kind' ? (
                      <Select
                        size="small"
                        autoFocus
                        defaultOpen
                        value={m.kind}
                        style={{ width: '100%' }}
                        options={kindOptions}
                        onChange={(v) => {
                          // 職稱各身份皆可保留
                          patchMember(m.id, { kind: v })
                          setEditing(null)
                        }}
                        onBlur={() => setEditing(null)}
                      />
                    ) : (
                      <button type="button" className="link-btn" style={{ padding: 0, color: 'var(--ink)' }} onClick={() => setEditing({ id: m.id, field: 'kind' })}>
                        {label(m.kind)} <DownOutlined style={{ fontSize: 10, color: 'var(--steel)' }} />
                      </button>
                    )}
                  </td>
                  <td className="cell-clip" title={m.title ?? undefined}>
                    {editing?.id === m.id && editing.field === 'title' ? (
                      <Input
                        size="small"
                        autoFocus
                        defaultValue={m.title}
                        style={{ width: '100%' }}
                        onBlur={(e) => {
                          patchMember(m.id, { title: e.target.value.trim() || null })
                          setEditing(null)
                        }}
                        onPressEnter={(e) => {
                          patchMember(m.id, { title: (e.target as HTMLInputElement).value.trim() || null })
                          setEditing(null)
                        }}
                      />
                    ) : (
                      <button type="button" className="link-btn" style={{ padding: 0, color: 'var(--ink)' }} onClick={() => setEditing({ id: m.id, field: 'title' })}>
                        {m.title ?? (m.kind === '幹部' ? '(未填)' : '—')} <EditOutlined style={{ fontSize: 11, color: 'var(--steel)' }} />
                      </button>
                    )}
                  </td>
                  <td className="cell-clip">
                    {editing?.id === m.id && editing.field === 'phone' ? (
                      <Input
                        size="small"
                        autoFocus
                        defaultValue={m.phone}
                        className="num"
                        style={{ width: '100%' }}
                        onBlur={(e) => {
                          patchMember(m.id, { phone: e.target.value.trim() || null })
                          setEditing(null)
                        }}
                        onPressEnter={(e) => {
                          patchMember(m.id, { phone: (e.target as HTMLInputElement).value.trim() || null })
                          setEditing(null)
                        }}
                      />
                    ) : (
                      <button type="button" className="link-btn num" style={{ padding: 0, color: 'var(--ink)' }} onClick={() => setEditing({ id: m.id, field: 'phone' })}>
                        {m.phone ?? '—'} <EditOutlined style={{ fontSize: 11, color: 'var(--steel)' }} />
                      </button>
                    )}
                  </td>
                  <td className="num cell-clip" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.semester}</td>
                  {showJoined && <td className="num cell-clip" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.joinedAt}</td>}
                  {showUpdated && <td className="num cell-clip" style={{ fontSize: 13, color: 'var(--steel)' }}>{m.updatedAt}</td>}
                  <td className="r">
                    <Popconfirm
                      title={`移除 ${m.name}?`}
                      okText="移除"
                      okButtonProps={{ danger: true }}
                      cancelText="取消"
                      onConfirm={() =>
                        remove.mutate(m.id, {
                          onSuccess: () => message.success('已移除'),
                          onError: (e) => message.error(e.message),
                        })
                      }
                    >
                      <Button size="small" danger>移除</Button>
                    </Popconfirm>
                  </td>
                </tr>
              ))}
              {listQuery.isError && (
                <tr className="no-hover">
                  <td colSpan={colCount}>
                    <QueryError compact title="成員名單載入失敗" error={listQuery.error} onRetry={() => listQuery.refetch()} />
                  </td>
                </tr>
              )}
              {!listQuery.isError && !listQuery.isPending && members.length === 0 && (
                <tr className="no-hover">
                  <td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--steel)', padding: 24 }}>
                    尚未建立成員名單
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LoadingBlock>
      </div>
      <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} style={{ padding: 0, marginTop: 14 }} />

      <Modal
        open={addOpen}
        title="新增社員"
        confirmLoading={create.isPending}
        onCancel={() => {
          setAddOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText="新增"
      >
        <Form form={form} layout="vertical" onFinish={onAdd} initialValues={{ kind: '社員', semester: currentSemester() }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '請輸入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="studentId" label="學號" rules={[{ required: true, message: '請輸入學號' }]}>
            <Input className="num" />
          </Form.Item>
          <Form.Item name="semester" label="學期" rules={[{ required: true }]}>
            <Select options={semesterOpts} />
          </Form.Item>
          <Form.Item name="kind" label="身份" rules={[{ required: true }]}>
            <Select options={kindOptions} />
          </Form.Item>
          <Form.Item
            name="title"
            label="職稱"
            rules={kind === '幹部' ? [{ required: true, message: '請填寫職稱' }] : []}
          >
            <Input placeholder={kind === '幹部' ? '例:總務、活動' : '選填'} />
          </Form.Item>
          <Form.Item name="phone" label="電話">
            <Input className="num" placeholder="選填" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={csvOpen}
        title="匯入社員(CSV)"
        confirmLoading={importCsv.isPending}
        onCancel={() => setCsvOpen(false)}
        onOk={doImport}
        okText="匯入"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13 }}>至學期</span>
          <Select value={csvSemester} onChange={setCsvSemester} style={{ width: 110 }} options={semesterOpts} />
        </div>
        <Upload
          accept=".csv,.txt"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(f) => {
            void f.text().then(setCsvText)
            return false
          }}
        >
          <Button icon={<UploadOutlined />} style={{ marginBottom: 10 }}>選擇 CSV 檔</Button>
        </Upload>
        <Input.TextArea
          rows={6}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={'王小明,B11100001,幹部,活動,0912345678\n林大同,B11100002,社員'}
        />
      </Modal>

      <Modal
        open={exportOpen}
        title="匯出社員(CSV)"
        destroyOnHidden
        confirmLoading={exporting}
        onCancel={() => setExportOpen(false)}
        onOk={() => void exportCsv()}
        okText="匯出"
        okButtonProps={{ autoFocus: true }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>學期</span>
          <Select value={csvSemester} onChange={setCsvSemester} style={{ width: 110 }} options={semesterOpts} />
        </div>
      </Modal>
    </div>
  )
}
