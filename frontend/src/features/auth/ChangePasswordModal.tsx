import { useState } from 'react'
import { App, Button, Form, Input, Modal } from 'antd'
import { changePasswordApi } from '../../api/auth'
import { useAuth } from '../../app/auth'

// 密碼政策(與後端 `core/security` 一致):≥10 碼且含大小寫、數字、特殊符號。
// `[\s\S]` 而不是 `.`:`.` 不吃換行,含換行的長密碼前端擋、後端放行,兩邊判定會分岔
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])[\s\S]{10,}$/
// 後端 `schemas/auth` 的上限;不擋的話打超過會拿到 pydantic 的 422 原文
const PASSWORD_MAX = 200

interface PasswordValues {
  current: string
  next: string
  confirm: string
}

/** 改密對話框,入口在頂欄帳號選單與手機側欄抽屜。
 *
 *  與管理項目那張表單分開:改密走 `/auth/change-password` 而不是 `PATCH /club/profile`,
 *  混在同一張表單裡會讓「這次有沒有動到 profile」這個判定得同時服務兩支 API,
 *  而改密是每個角色都要的,管理項目只有社團有。
 *  首登強制改密另有整頁版本(`ChangePasswordPage`)—— 那時後端擋著所有業務端點,
 *  使用者根本到不了頂欄。 */
export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp()
  const { refresh } = useAuth()
  const [form] = Form.useForm<PasswordValues>()
  const [submitting, setSubmitting] = useState(false)

  const close = () => {
    form.resetFields()
    onClose()
  }

  const submit = async (v: PasswordValues) => {
    setSubmitting(true)
    try {
      await changePasswordApi(v.current, v.next)
      message.success('密碼已更新')
      // 順手同步 `/auth/me` 的其他變動;fire-and-forget,失敗也不影響已經改好的密碼
      void refresh()
      close()
    } catch (e) {
      // 失敗不清欄位:多半是「目前密碼錯誤」,改那一欄就好
      message.error(e instanceof Error ? e.message : '更新失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="更換密碼"
      // footer 自訂:submit 鈕要在 form 裡面(design-guide §6)—— 用 onOk + form.submit()
      // 的話 Enter 會繞過 confirmLoading 直接送出,擋不住重複提交
      footer={null}
      onCancel={close}
      // 送出中一律關不掉:半路關掉會連同 destroyOnHidden 把剛打的三欄一起丟掉,
      // 而請求可能正要帶著「目前密碼錯誤」回來
      closable={!submitting}
      keyboard={!submitting}
      maskClosable={!submitting}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => void submit(v)} requiredMark={false}>
        <Form.Item name="current" label="目前密碼" rules={[{ required: true, message: '請輸入目前密碼' }]}>
          <Input.Password autoComplete="current-password" autoFocus />
        </Form.Item>
        <Form.Item
          name="next"
          label="新密碼"
          extra="含大小寫字母、數字與特殊符號，長度至少 10 碼，不得與近三次相同"
          rules={[
            { required: true, message: '請輸入新密碼' },
            { pattern: PASSWORD_RULE, message: '新密碼含大小寫字母、數字與特殊符號，長度至少 10 碼' },
          ]}
        >
          <Input.Password autoComplete="new-password" maxLength={PASSWORD_MAX} />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="確認新密碼"
          dependencies={['next']}
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
          <Input.Password autoComplete="new-password" maxLength={PASSWORD_MAX} />
        </Form.Item>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={close} disabled={submitting}>
            取消
          </Button>
          {/* loading 與 disabled 成對:AntD 的 loading 只擋 React onClick,不設 DOM disabled */}
          <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
            更新密碼
          </Button>
        </div>
      </Form>
    </Modal>
  )
}
