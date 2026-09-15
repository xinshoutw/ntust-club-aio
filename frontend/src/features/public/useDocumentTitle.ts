import { useEffect } from 'react'

const BASE = '臺科大社團管理系統'

/** 公開頁的分頁標題。
 *
 *  社團頁是社團自己會貼到限動與群組的那個網址([club-detail.md](../../../docs/spec/shared/club-detail.md)),
 *  分頁與書籤只顯示站名的話,一次貼三個社團就分不出誰是誰。站內其他頁沒有這個需求
 *  (登入後才看得到,也沒人分享),所以不做成全站機制。 */
export default function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} - ${BASE}` : BASE
    return () => {
      document.title = BASE
    }
  }, [title])
}
