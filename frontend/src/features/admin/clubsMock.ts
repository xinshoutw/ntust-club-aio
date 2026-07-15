// 社團主檔(行政端共用;接後端後換 API)
export const CLUB_ATTRIBUTES = ['自治性', '學藝性', '服務性', '聯誼性', '藝術性', '體育性'] as const
export type ClubAttribute = (typeof CLUB_ATTRIBUTES)[number]

export interface ClubMaster {
  name: string
  attribute: ClubAttribute
  account: string
  active: boolean
}

export const CLUBS_MASTER: ClubMaster[] = [
  { name: '學生會', attribute: '自治性', account: 'su_main', active: true },
  { name: '資工系學會', attribute: '學藝性', account: 'csie_club', active: true },
  { name: '電機系學會', attribute: '學藝性', account: 'ee_club', active: true },
  { name: '機械系學會', attribute: '學藝性', account: 'me_club', active: false },
  { name: '機器人研究社', attribute: '學藝性', account: 'robot_club', active: true },
  { name: '國際志工社', attribute: '服務性', account: 'volunteer', active: true },
  { name: '吉他社', attribute: '聯誼性', account: 'guitar', active: true },
  { name: '美術社', attribute: '藝術性', account: 'art_club', active: true },
  { name: '熱音社', attribute: '藝術性', account: 'rockband', active: true },
  { name: '熱舞社', attribute: '藝術性', account: 'dance_club', active: true },
  { name: 'Cosplay社', attribute: '藝術性', account: 'cosplay', active: true },
  { name: '攝影社', attribute: '藝術性', account: 'photo_club', active: true },
  { name: '登山社', attribute: '體育性', account: 'hiking', active: true },
  { name: '網球社', attribute: '體育性', account: 'tennis', active: true },
]
