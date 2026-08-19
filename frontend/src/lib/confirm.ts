import { App } from 'antd'

type ModalInstance = ReturnType<typeof App.useApp>['modal']
type ConfirmProps = Parameters<ModalInstance['confirm']>[0]

// AntD Modal.confirm 預設 maskClosable:false,與全站「點遮罩=取消(留在原地)」的慣例相反,
// 過去已多次在新增呼叫點時漏掉 maskClosable 而復發。
// 確認彈窗一律走此 helper,勿直接呼叫 modal.confirm。
// (autoFocusButton 預設即為 'ok':開啟後按 Enter 直接觸發確認)
export function confirmDialog(modal: ModalInstance, props: ConfirmProps) {
  return modal.confirm({ maskClosable: true, ...props })
}
