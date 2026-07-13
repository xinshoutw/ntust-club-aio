import { App, Button } from 'antd'
import PageHeader from '../../components/ui/PageHeader'
import StatusPill from '../../components/ui/StatusPill'

// 三個帳號管理頁共用同一版型:表格 + 重設密碼/停用
export function AdminAccountsPage() {
  const { message } = App.useApp()
  const admins = [
    { name: '王組長', account: 'admin_wang', scope: '最高權限', perms: '全部' },
    { name: '李承辦', account: 'admin_lee', scope: '一般', perms: '活動審核、結案審核、待審彙整、報名管理' },
    { name: '陳助理', account: 'admin_chen', scope: '一般', perms: '借用審核、維修、違規、成員管理' },
    { name: '學務長', account: 'dean', scope: '受限(僅簽核)', perms: '學務長簽核關' },
  ]
  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="管理員帳號" extra={<Button type="primary" style={{ height: 36 }} onClick={() => message.info('新增管理員(接後端後啟用)')}>+ 新增</Button>} />
      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb" style={{ minWidth: 720 }}>
          <thead>
            <tr><th>姓名</th><th>帳號</th><th>權限層級</th><th>頁面權限</th><th className="r">動作</th></tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.account}>
                <td style={{ fontWeight: 500 }}>{a.name}</td>
                <td className="num" style={{ color: 'var(--steel)' }}>{a.account}</td>
                <td>{a.scope}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{a.perms}</td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="link-btn" onClick={() => message.success(`已重設 ${a.name} 密碼並寄送`)}>重設密碼</button>
                  <button type="button" className="link-btn danger" onClick={() => message.info('停用帳號(接後端後啟用)')}>停用</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ClubAccountsPage() {
  const { message } = App.useApp()
  const clubs = [
    { club: '資工系學會', account: 'csie_club', active: true },
    { club: '電機系學會', account: 'ee_club', active: true },
    { club: '機械系學會', account: 'me_club', active: false },
  ]
  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="社團帳號" extra={<Button type="primary" style={{ height: 36 }} onClick={() => message.info('新增社團帳號(接後端後啟用)')}>+ 新增</Button>} />
      <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}>
        <table className="tb" style={{ minWidth: 640 }}>
          <thead>
            <tr><th>社團</th><th>帳號</th><th>狀態</th><th className="r">動作</th></tr>
          </thead>
          <tbody>
            {clubs.map((c) => (
              <tr key={c.account}>
                <td style={{ fontWeight: 500 }}>{c.club}</td>
                <td className="num" style={{ color: 'var(--steel)' }}>{c.account}</td>
                <td><StatusPill status={c.active ? 'approved' : 'suspended'} /></td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="link-btn" onClick={() => message.success(`已重設 ${c.club} 密碼(首次登入強制改密)`)}>重設密碼</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ViewerAccountsPage() {
  const { message } = App.useApp()
  const viewers = [
    { name: '張老師', awards: '最佳社團獎、最佳活動獎', clubs: '第 1 組(資工系學會、電機系學會)' },
    { name: '李老師', awards: '最佳財務獎、最佳成果發表獎', clubs: '第 1 組(資工系學會、電機系學會)' },
    { name: '陳老師', awards: '最佳社團負責人獎', clubs: '第 2 組(學生會)' },
  ]
  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="評審老師與指派" extra={<Button type="primary" style={{ height: 36 }} onClick={() => message.info('新增評審與分組(接後端後啟用)')}>+ 新增評審</Button>} />
      <div style={{ fontSize: 13, color: 'var(--steel)', marginTop: 6 }}>
        評審對社團匿名呈現(依組內排序顯示為評審A、評審B)。
      </div>
      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <table className="tb" style={{ minWidth: 720 }}>
          <thead>
            <tr><th>評審</th><th>負責獎項</th><th>分組</th><th className="r">動作</th></tr>
          </thead>
          <tbody>
            {viewers.map((v) => (
              <tr key={v.name}>
                <td style={{ fontWeight: 500 }}>{v.name}</td>
                <td style={{ fontSize: 13 }}>{v.awards}</td>
                <td style={{ fontSize: 13, color: 'var(--steel)' }}>{v.clubs}</td>
                <td className="r">
                  <button type="button" className="link-btn" onClick={() => message.info('調整指派(接後端後啟用)')}>調整指派</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
