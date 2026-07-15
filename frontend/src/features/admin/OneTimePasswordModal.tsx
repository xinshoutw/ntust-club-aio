import { useState } from 'react'
import { App, Button, Input, Modal } from 'antd'
import { CopyOutlined } from '@ant-design/icons'

// 產生一次性密碼(mock;正式由後端產生並強制首登改密)
export function genPassword(): string {
  const pick = (chars: string, n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return (
    pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 3) +
    pick('abcdefghjkmnpqrstuvwxyz', 4) +
    pick('23456789', 3) +
    pick('!@#$%^&*', 2)
  )
}

// 一次性密碼彈窗:預設隱藏、可複製;帳號之後仍可查看,密碼關閉後不再顯示
export default function OneTimePasswordModal({
  title,
  account,
  open,
  onClose,
  afterClose,
  okLabel = '完成',
  onOk,
}: {
  title: string
  account?: string
  open: boolean
  onClose: () => void
  afterClose: () => void
  okLabel?: string
  // 主按鈕確認動作(與 Esc/遮罩關閉區分);未提供則同 onClose
  onOk?: () => void
}) {
  const { message } = App.useApp()
  const [password] = useState(genPassword)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      message.success('已複製密碼')
    } catch {
      message.error('複製失敗！請按下顯示密碼後手動複製')
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      title={title}
      footer={<Button type="primary" autoFocus onClick={onOk ?? onClose}>{okLabel}</Button>}
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
