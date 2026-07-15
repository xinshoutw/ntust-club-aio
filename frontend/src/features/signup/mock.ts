import type { SignupItem } from './types'

// ponytail: 靜態假資料;後端完成後換 API
export const SIGNUP_ITEMS: SignupItem[] = [
  {
    id: 'leader-meeting',
    name: '社團負責人會議',
    status: 'open',
    kind: 'leader_meeting',
    semester: '114-2',
    info: '場次制(全學年 4 場)· 每月第一週週三 18:30 · 第二教學大樓 TR-201 · 對象:社長或副社長',
    deadline: '2026/07/20',
    maxParticipants: 1,
    attendedSessions: 2, // 已簽到 2 場(ad7:每場 1.25 分)
    fields: [{ key: 'phone', label: '聯絡電話', type: 'text', required: true }],
    submission: {
      submittedAt: '2026/07/02 14:30',
      participants: [{ name: '陳予恩', studentId: 'B11209001', dept: '資工三', phone: '0912-345-678' }],
    },
  },
  {
    id: 'cadre-training',
    name: '社團幹訓',
    status: 'open',
    kind: 'cadre_training',
    semester: '115-1',
    info: '2026/09/20 09:00-17:00 · 國際大樓 IB-101 · 對象:各社團幹部(至少 3 人)',
    deadline: '2026/09/15',
    description: '一日幹部訓練:社團經營、經費核銷、活動安全講習與分組演練;請幹部準時報到並全程參與,午餐由學務處提供。',
    time: '2026/09/20 09:00-17:00',
    place: '國際大樓 IB-101',
    maxParticipants: 5,
    hasDraft: true,
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
    kind: 'normal',
    semester: '114-2',
    info: '2026/07/30 全天 · 學生活動中心 · 全校立案社團;送出即完成報名',
    deadline: '2026/07/18',
    maxParticipants: 1,
    fields: [],
  },
  {
    id: 'cadre-camp',
    name: '幹部研習營',
    status: 'ended',
    kind: 'normal',
    semester: '114-2',
    info: '2026/07/04 · 學生活動中心 · 對象:新任幹部',
    deadline: '2026/06/30',
    maxParticipants: 3,
    fields: [],
    submission: {
      submittedAt: '2026/06/25 10:12',
      participants: [
        { name: '林詠晴', studentId: 'B11305012', dept: '企管二' },
        { name: '張佑群', studentId: 'B11209033', dept: '資工三' },
      ],
    },
  },
]
