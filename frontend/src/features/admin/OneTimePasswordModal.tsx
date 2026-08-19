import { App, Button, Input, Modal } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import { useModalAutoFocus } from '../../components/ui/useModalAutoFocus'

// 一次性密碼彈窗:預設隱藏、可複製;帳號之後仍可查看,密碼關閉後不再顯示。
// password 必傳且一律是 API 回來的明碼 —— 前端不得自行產生,產出來的東西登不進去
export default function OneTimePasswordModal({
  title,
  account,
  password,
  open,
  onClose,
  afterClose,
  okLabel = '完成',
  onOk,
}: {
  title: string
  account?: string
  password: string
  open: boolean
  onClose: () => void
  afterClose: () => void
  okLabel?: string
  // 主按鈕確認動作(與 Esc/遮罩關閉區分);未提供則同 onClose
  onOk?: () => void
}) {
  const { message } = App.useApp()
  const okRef = useModalAutoFocus(open)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      message.success('已複製密碼')
    } catch {
      message.error('複製失敗，請按下顯示密碼後手動複製')
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      title={title}
      footer={<Button type="primary" ref={okRef} onClick={onOk ?? onClose}>{okLabel}</Button>}
    >
      {account && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--steel)', width: 40 }}>帳號</span>
          <span className="num" style={{ fontWeight: 500 }}>{account}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: account ? 10 : 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--steel)', width: 40, fontSize: 13 }}>密碼</span>
        <Input.Password value={password} readOnly className="num" />
        <Button icon={<CopyOutlined />} onClick={copy}>複製</Button>
      </div>
      <div style={{ fontSize: 12, color: '#8A5A00', marginTop: 10, lineHeight: 1.7 }}>
        密碼僅顯示這一次
      </div>
    </Modal>
  )
}
