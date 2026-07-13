import type { StatusKey } from '../../lib/status'

export interface ReviewItem {
  id: string
  club: string
  name: string
  type: string
  date: string
  requested: number
  status: StatusKey
  detail?: {
    timeRange: string
    location: string
    participantsIn: number
    participantsOut: number
    submittedAt: string
    submittedBy: string
    attachments: string[]
    budget: { id: number; category: string; description: string; selfFund: number; requested: number; approved: number }[]
  }
}

export const REVIEW_ITEMS: ReviewItem[] = [
  {
    id: 'ACT-114-0013',
    club: '電機系學會',
    name: '電機之夜',
    type: '大型活動',
    date: '2026/10/20',
    requested: 101800,
    status: 'pending_advisor',
    detail: {
      timeRange: '2026/10/20 18:00-22:00',
      location: '體育館',
      participantsIn: 400,
      participantsOut: 0,
      submittedAt: '2026/07/08',
      submittedBy: '王小明(社長)',
      attachments: ['電機之夜_企劃書.pdf', '舞台估價單.pdf'],
      budget: [
        { id: 1, category: '指導老師/教練費', description: '晚會導演與技術指導', selfFund: 20000, requested: 20000, approved: 20000 },
        { id: 2, category: '印刷費', description: '宣傳與場刊', selfFund: 15000, requested: 15000, approved: 12000 },
        { id: 3, category: '其他', description: '舞台燈光音響租賃', selfFund: 66800, requested: 66800, approved: 60000 },
      ],
    },
  },
  { id: 'ACT-114-0031', club: '機器人研究社', name: '機器人組裝工作坊', type: '社課', date: '2026/09/28', requested: 6000, status: 'pending_advisor' },
  { id: 'ACT-114-0033', club: '美術社', name: '迎新寫生', type: '一般活動', date: '2026/10/03', requested: 3200, status: 'pending_advisor' },
  { id: 'ACT-114-0032', club: '國際志工社', name: '偏鄉服務隊行前訓', type: '一般活動', date: '2026/10/11', requested: 12000, status: 'pending_advisor' },
  { id: 'ACT-114-0034', club: '網球社', name: '校內網球排位賽', type: '一般活動', date: '2026/10/18', requested: 8800, status: 'pending_advisor' },
  { id: 'ACT-114-0020', club: '資工系學會', name: '資訊週', type: '大型活動', date: '2026/09/15', requested: 48000, status: 'pending_dean' },
  { id: 'ACT-114-0027', club: 'Cosplay社', name: '祭典舞台展演', type: '大型活動', date: '2026/11/02', requested: 26000, status: 'pending_chief' },
  { id: 'ACT-114-0029', club: '學生會', name: '校慶園遊會攤位審查說明會', type: '一般活動', date: '2026/09/30', requested: 0, status: 'rejected' },
]
