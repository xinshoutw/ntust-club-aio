/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// prefers-reduced-motion 區塊若用 animation/transition: none,AntD 靠 rc-motion
// (等 animationend/transitionend)的彈窗、下拉、Tooltip 會卡在半開狀態擋住點擊。
// 事件必須照常觸發,只能把時間壓短。
describe('index.css 的 prefers-reduced-motion 區塊', () => {
  const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(
    readFileSync('src/index.css', 'utf8'), // vitest 的 cwd 固定在 frontend/
  )?.[1]

  it('存在', () => {
    expect(block).toBeDefined()
  })

  it('不把動畫整個關掉,以免 animationend/transitionend 永遠不觸發', () => {
    expect(block).not.toMatch(/(animation(-name)?|transition(-property)?)\s*:\s*none/)
  })

  it('把 infinite 動畫壓成跑一次,避免 0.01ms 空轉燒 CPU', () => {
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/)
  })

  // 這條同時當哨兵:.anticon-spin 是區塊裡的最後一段,抓得到就代表上面的
  // regex 沒有在中途被某個寫到行首的 } 截斷。
  it('讓 loading 圖示繼續轉,否則送出鈕看起來像當掉', () => {
    expect(block).toMatch(/\.anticon-spin\s*\{[^}]*animation-iteration-count:\s*infinite\s*!important/)
  })
})
