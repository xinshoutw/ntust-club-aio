import { App, Button, Upload } from 'antd'
import { FileTextOutlined, UploadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/ui/PageHeader'
import { useAuth } from '../../app/auth'

interface RubricSlot {
  key: string
  group: string
  name: string
  hint: string
  files: string[]
}

const SLOTS: RubricSlot[] = [
  { key: 'ad1', group: '(一) 活動及社課申請 15%', name: '活動及社課申請', hint: '結案始算,大型活動加權', files: ['活動申請彙整.pdf'] },
  { key: 'ad2', group: '(二) 活動/社課成果 60%', name: '照片/影片', hint: '每活動 ≥5 張照片或影片連結', files: ['迎新_照片.zip'] },
  { key: 'ad3', group: '(二) 活動/社課成果 60%', name: '成果單', hint: '每活動一份', files: ['迎新_成果報告.pdf'] },
  { key: 'ad4', group: '(二) 活動/社課成果 60%', name: '心得回饋', hint: '每活動彙整', files: ['迎新_心得.pdf'] },
  { key: 'ad5', group: '(三) 社團資料更新 15%', name: '社員、幹部名單更新', hint: '由系統名單更新紀錄自動採計', files: [] },
  { key: 'ad6', group: '(三) 社團資料更新 15%', name: '社團網頁經營', hint: '由「管理項目」網頁連結自動採計', files: [] },
  { key: 'ad7', group: '(四) 參與會議與活動 10%', name: '負責人會議', hint: '由線上報名出席紀錄自動採計', files: [] },
  { key: 'ad8', group: '(四) 參與會議與活動 10%', name: '幹訓', hint: '由線上報名紀錄自動採計', files: [] },
  { key: 'o1', group: '社團營運 — 組織運作及財務管理 50%', name: '管理運作(章程、傳承交接)', hint: '', files: ['章程_114.pdf'] },
  { key: 'o3', group: '社團營運 — 組織運作及財務管理 50%', name: '財務管理', hint: '帳本、財報、器材管理', files: ['收支表_114上.xlsx'] },
  { key: 'a4', group: '社團營運 — 社團活動績效 50%', name: '活動特色', hint: '', files: ['成果照片.zip'] },
]

export default function EvalDocsPage() {
  const { user } = useAuth()
  const { message } = App.useApp()
  const groups = [...new Set(SLOTS.map((s) => s.group))]
  const uploaded = SLOTS.filter((s) => s.files.length > 0).length

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader
        title="資料總覽"
        sub={
          <>
            {user?.club} · 已上傳 <span className="num">{uploaded}</span>/<span className="num">{SLOTS.length}</span> 項
          </>
        }
      />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        社團競賽(評鑑)採計資料;標示「自動採計」的項目由系統資料計算,無須上傳。
      </div>

      {groups.map((g) => (
        <div className="card" key={g} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, padding: '14px 20px 6px' }}>{g}</div>
          {SLOTS.filter((s) => s.group === g).map((s) => {
            const auto = s.hint.includes('自動採計')
            return (
              <div
                key={s.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 20px',
                  borderTop: '1px solid var(--line)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                  {s.hint && <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 2 }}>{s.hint}</div>}
                </div>
                {s.files.map((f) => (
                  <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <FileTextOutlined style={{ color: 'var(--steel)' }} />
                    {f}
                  </span>
                ))}
                {!auto && (
                  <Upload beforeUpload={() => false} showUploadList={false} onChange={() => message.success(`已上傳至「${s.name}」`)}>
                    <Button size="small" style={{ height: 30 }} icon={<UploadOutlined />}>
                      上傳
                    </Button>
                  </Upload>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
