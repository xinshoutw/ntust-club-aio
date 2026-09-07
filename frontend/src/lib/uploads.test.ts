import { describe, expect, test } from 'vitest'
import { EVIDENCE_ACCEPT, makeValidateEvidence } from './uploads'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0])
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0])
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

const file = (name: string, bytes: Uint8Array) => new File([bytes.buffer as ArrayBuffer], name)
const validate = makeValidateEvidence(1024, 1024)

describe('makeValidateEvidence', () => {
  test('照片與 mp4 影片放行,超過上限說明是哪一種', async () => {
    expect(await validate(file('a.png', PNG))).toBeNull()
    expect(await validate(file('a.mp4', MP4))).toBeNull()
    const tiny = makeValidateEvidence(8, 8)
    expect(await tiny(file('a.png', PNG))).toMatch(/^照片超過/)
    expect(await tiny(file('a.mp4', MP4))).toMatch(/^影片超過/)
  })

  test('後端不收的影片格式在選檔時就擋:webm 內容或 .webm 檔名都不放行', async () => {
    expect(await validate(file('a.webm', WEBM))).toBe('影片僅接受 mp4 / mov')
    expect(await validate(file('a.webm', MP4))).toBe('影片僅接受 mp4 / mov')
    expect(await validate(file('a.txt', PNG))).toBe('照片副檔名不在支援清單內')
    expect(await validate(file('a.png', new Uint8Array(16)))).toBe('不是有效的照片或影片檔')
  })

  test('accept 逐項列舉,不含 video/*', () => {
    expect(EVIDENCE_ACCEPT).toContain('.mp4')
    expect(EVIDENCE_ACCEPT).not.toContain('video/*')
  })
})
