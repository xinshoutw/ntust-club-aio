/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// 2026-08-31 事故:reduced-motion 區塊裡的 `animation: none` 讓 animationend 永遠不觸發,
// AntD 靠 rc-motion 收尾的彈窗就卡住、透明地擋住整個畫面(按鈕點不到、hover 沒反應)。
// 現在全站刻意不響應這個 media query(理由見 index.css),所以這支測試平常是空跑 ——
// 它守的是「哪天有人加回來,也不能是那種寫法」。
test('index.css 沒有靠關閉動畫來實作 prefers-reduced-motion', () => {
  const css = readFileSync('src/index.css', 'utf8') // vitest 的 cwd 固定在 frontend/
  const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

  expect(block).not.toMatch(/(animation(-name)?|transition(-property)?)\s*:\s*none/)
})
