import { useState } from 'react'
import { App, Form, Input, Modal } from 'antd'
import { changePasswordApi } from '../../api/auth'
import { useAuth } from '../../app/auth'

// 密碼政策(與後端一致):≥10 碼且含大小寫、數字、特殊符號
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/

interface PasswordValues {
  current: string
  next: string
  confirm: string
}

/** 改密對話框,入口在頂欄帳號選單。
 *
 *  與管理項目那張表單分開:改密走 `/auth/change-password` 而不是 `PATCH /club/profile`,
 *  混在同一張表單裡會讓「這次有沒有動到 profile」這個判定得同時服務兩支 API,
 *  而改密是每個角色都要的,管理項目只有社團有。
 *  首登強制改密另有整頁版本(`ChangePasswordPage`)—— 那時使用者還進不了頂欄。 */
export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp()
  const { refresh } = useAuth()
  const [form] = Form.useForm<PasswordValues>()
  const [submitting, setSubmitting] = useState(false)

  const submit = async (v: PasswordValues) => {
    setSubmitting(true)
    try {
      await changePasswordApi(v.current, v.next)
      message.success('密碼已更新')
      // 首登強制改密的旗標會跟著變,原地更新 auth context
      void refresh()
      form.resetFields()
      onClose()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '更新失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="更換密碼"
      okText="更新密碼"
      cancelText="取消"
      confirmLoading={submitting}
      onOk={() => void form.submit()}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      // 關掉就整份丟掉:半填的密碼留在記憶體裡沒有意義,下次開啟也不該預填
      destroyOnHidden
      maskClosable={!submitting}
    >
      <Form form={form} layout="vertical" onFinish={(v) => void submit(v)} requiredMark={false}>
        <Form.Item
          name="current"
          label="目前密碼"
          rules={[{ required: true, message: '請輸入目前密碼' }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="next"
          label="新密碼"
          extra="含大小寫字母、數字與特殊符號，長度至少 10 碼，不得與近三次相同"
          rules={[
            { required: true, message: '請輸入新密碼' },
            {
              pattern: PASSWORD_RULE,
              message: '新密碼含大小寫字母、數字與特殊符號，長度至少 10 碼',
            },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="確認新密碼"
          dependencies={['next']}
          style={{ marginBottom: 0 }}
          rules={[
            { required: true, message: '請再次輸入新密碼' },
            ({ getFieldValue }) => ({
              validator: (_, v: string) =>
                !v || v === getFieldValue('next')
                  ? Promise.resolve()
                  : Promise.reject(new Error('兩次輸入的新密碼不一致')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
