/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { Image } from 'antd'
import { fireEvent, render, screen } from '@testing-library/react'

// 2026-08-31 事故:reduced-motion 區塊裡的 `animation: none` 讓 animationend 永遠不觸發,
// AntD 靠 rc-motion 收尾的彈窗就卡住、透明地擋住整個畫面(按鈕點不到、hover 沒反應)。
// 現在全站刻意不響應這個 media query(理由見 index.css),所以這支測試平常是空跑 ——
// 它守的是「哪天有人加回來,也不能是那種寫法」。
test('index.css 沒有靠關閉動畫來實作 prefers-reduced-motion', () => {
  const css = readFileSync('src/index.css', 'utf8') // vitest 的 cwd 固定在 frontend/
  const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

  expect(block).not.toMatch(/(animation(-name)?|transition(-property)?)\s*:\s*none/)
})

// 2026-07-21 需求方:過場位移動畫造成不適 —— 圖片預覽不從點擊的縮圖飛出來。
// AntD 把縮圖位置以 inline transform-origin 掛在某個元素上,index.css 以 !important 蓋掉;
// 蓋的 class 必須是 AntD 真的在用的那個(v5 → v6 改過名,舊的 `-wrap` 寫法默默失效了一整版)
test('圖片預覽的 transform-origin 由 index.css 蓋回置中', () => {
  render(
    createElement(Image.PreviewGroup, null, createElement(Image, { src: '/a.jpg', alt: 'a' })),
  )
  fireEvent.click(screen.getByRole('img', { name: 'a' }))
  const carrier = [...document.querySelectorAll<HTMLElement>('.ant-image-preview *')].find((el) =>
    el.style.transformOrigin,
  )
  expect(carrier).toBeDefined()
  const cls = [...carrier!.classList].find((c) => c.startsWith('ant-image-preview-'))
  // 選擇器清單裡有一整條就是這個 class(單獨或與別的並列),而且那一條規則把 origin 蓋回置中 ——
  // `.cls .child`、`.cls:hover` 這種指到別的元素或別的狀態的不算
  const rule = new RegExp(
    `(?:^|[{},])\\s*\\.${cls}\\s*(?:,[^{]*)?\\{[^}]*transform-origin:\\s*center center !important`,
  )
  // 註解先拿掉:註解裡提到那個 class 不算數
  const css = readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  expect(css).toMatch(rule)
})

// design-guide §8 的焦點框:縮圖牆的鍵盤入口是 AntD 掛上 role=button 的那一層,選擇器要對得上它
test('可預覽的圖片縮圖拿到焦點時是 §8 的藍框', () => {
  render(createElement(Image, { src: '/a.jpg', alt: 'a' }))
  const trigger = screen.getByRole('img', { name: 'a' }).closest('[tabindex="0"]')
  expect(trigger?.matches(".ant-image[role='button']")).toBe(true)
  const css = readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  // 一整條選擇器就是它(同上一支):`.act-photos .ant-image[...]` 這種只管得到某一區的不算
  expect(css).toMatch(
    /(?:^|[{},])\s*\.ant-image\[role='button'\]:focus-visible\s*(?:,[^{]*)?\{[^}]*outline:\s*2px solid var\(--focus\)/,
  )
})
