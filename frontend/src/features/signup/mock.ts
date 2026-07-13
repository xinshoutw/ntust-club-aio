import type { SignupItem } from './types'

// ponytail: 靜態假資料;後端完成後換 API
export const SIGNUP_ITEMS: SignupItem[] = [
  {
    id: 'leader-meeting',
    name: '社團負責人會議',
    status: 'open',
    info: '場次制(全學年 4 場)· 每月第一週週三 18:30 · 第二教學大樓 TR-201 · 對象:社長或副社長',
    deadline: '2026/09/10',
    maxParticipants: 1,
    fields: [{ key: 'phone', label: '聯絡電話', type: 'text', required: true }],
  },
  {
    id: 'cadre-training',
    name: '社團幹訓',
    status: 'open',
    info: '2026/09/20 09:00-17:00 · 國際大樓 IB-101 · 對象:各社團幹部(至少 3 人)',
    deadline: '2026/09/15',
    time: '2026/09/20 09:00-17:00',
    place: '國際大樓 IB-101',
    maxParticipants: 5,
    fields: [
      { key: 'phone', label: '聯絡電話', type: 'text', required: true },
      { key: 'meal', label: '膳食需求', type: 'select', required: true, options: ['葷', '素'] },
      { key: 'laptop', label: '是否攜帶筆電', type: 'radio', required: false, options: ['是', '否'] },
      { key: 'note', label: '備註', type: 'textarea', required: false },
    ],
  },
  {
    id: 'evaluation',
    name: '社團競賽(評鑑)',
    status: 'open',
    info: '2026/11/05 全天 · 學生活動中心 · 全校立案社團;送出即完成報名',
    deadline: '2026/10/20',
    maxParticipants: 1,
    fields: [],
  },
  {
    id: 'cadre-camp',
    name: '幹部研習營',
    status: 'ended',
    info: '2026/07/04 · 學生活動中心 · 對象:新任幹部',
    deadline: '2026/06/30',
    maxParticipants: 3,
    fields: [],
  },
]
