import { describe, expect, test } from 'vitest'
import { crc32, zipStore } from './files'

const bytes = (s: string) => new TextEncoder().encode(s)
const readU32 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | ((b[at + 3] << 24) >>> 0)

describe('crc32', () => {
  test('標準測試向量 "123456789" → 0xCBF43926', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
  })
})

describe('zipStore(免壓縮 ZIP)', () => {
  test('結構正確:local header、central directory、EOCD 對得上', async () => {
    const entries = [
      { name: '01_a.txt', data: bytes('hello') },
      { name: '02_中文.txt', data: bytes('world!') },
    ]
    const buf = new Uint8Array(await zipStore(entries).arrayBuffer())

    // local header 簽章
    expect(readU32(buf, 0)).toBe(0x04034b50)
    // EOCD 簽章在倒數 22 bytes
    const eocdAt = buf.length - 22
    expect(readU32(buf, eocdAt)).toBe(0x06054b50)
    // EOCD 記錄的 central directory offset+size 應接到 EOCD 起點
    const cdSize = readU32(buf, eocdAt + 12)
    const cdOffset = readU32(buf, eocdAt + 16)
    expect(cdOffset + cdSize).toBe(eocdAt)
    // central directory 簽章與筆數
    expect(readU32(buf, cdOffset)).toBe(0x02014b50)
    expect(buf[eocdAt + 10] | (buf[eocdAt + 11] << 8)).toBe(2)
    // 內容以 store 方式原样寫入
    const text = new TextDecoder().decode(buf)
    expect(text).toContain('hello')
    expect(text).toContain('world!')
  })
})
