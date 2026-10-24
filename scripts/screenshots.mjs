// Re-captures the README screenshots at 2x from the dev server (npm run dev -- --host 127.0.0.1 --port 5199).
// Usage: node scripts/screenshots.mjs [shot ...]   (default: all; shots: upload by-year histogram-tooltip rating-tooltip card-tooltip by-decade decade-hover gaps-only)
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'docs/screenshots')
const url = process.env.APP_URL ?? 'http://127.0.0.1:5199/'
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const only = process.argv.slice(2)
const want = (n) => only.length === 0 || only.includes(n)
const opt = { type: 'jpeg', quality: 92 }

const b = await chromium.launch({ executablePath: chrome })
const p = await (await b.newContext({ viewport: { width: 1110, height: 784 }, deviceScaleFactor: 2 })).newPage()

// Resolved posters become <img>; wait for that count to stop growing.
async function waitForPosters() {
  let last = -1, stable = 0
  for (let i = 0; i < 150 && stable < 6; i++) {
    await p.waitForTimeout(2000)
    const n = await p.locator('.card img').count()
    stable = n === last ? stable + 1 : 0
    last = n
  }
}
// Lazy images only download near the viewport; wait until every <img> in view has decoded.
async function waitForVisibleImages() {
  await p.waitForFunction(() =>
    [...document.querySelectorAll('.card img')].every((img) => {
      const r = img.getBoundingClientRect()
      const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
      return !inView || (img.complete && img.naturalWidth > 0)
    }), null, { timeout: 60000 })
  await p.waitForTimeout(500)
}

await p.goto(url)
await p.locator('input[type=file]').nth(0).setInputFiles(`${root}/example-data/watched.csv`)
await p.locator('input[type=file]').nth(1).setInputFiles(`${root}/example-data/ratings.csv`)
await p.locator('input[type=file]').nth(2).setInputFiles(`${root}/example-data/watchlist.csv`)
await p.waitForTimeout(300)
if (want('upload')) await p.locator('.upload-card').screenshot({ path: `${out}/upload.jpg`, ...opt })
await p.click('.upload-go')
await p.waitForSelector('.card')
await waitForPosters()
await p.mouse.move(5, 5)
await waitForVisibleImages()
if (want('by-year')) await p.screenshot({ path: `${out}/by-year.jpg`, ...opt })

if (want('histogram-tooltip')) {
  const bars = p.locator('.hist-col')
  await bars.nth(Math.floor((await bars.count()) * 0.75)).hover()
  await p.waitForTimeout(300)
  const h = await p.locator('.histogram').boundingBox()
  await p.screenshot({ path: `${out}/histogram-tooltip.jpg`, ...opt, clip: { x: 0, y: Math.max(0, h.y - 50), width: 1110, height: h.height + 60 } })
}
if (want('rating-tooltip')) {
  await p.locator('.year-label').nth(0).hover()
  await p.waitForTimeout(300)
  const tb = await p.locator('.rating-tooltip').boundingBox()
  await p.screenshot({ path: `${out}/rating-tooltip.jpg`, ...opt, clip: { x: 0, y: Math.max(0, tb.y - 14), width: 560, height: 420 } })
}
if (want('card-tooltip')) {
  const c = p.locator('.card').nth(2)
  await c.hover()
  await p.waitForTimeout(300)
  const cb = await c.boundingBox()
  await p.screenshot({ path: `${out}/card-tooltip.jpg`, ...opt, clip: { x: Math.max(0, cb.x - 30), y: Math.max(0, cb.y - 64), width: 675, height: 260 } })
}
if (want('by-decade')) {
  await p.mouse.move(5, 5)
  await p.locator('.toggle button').nth(1).click()
  await p.waitForTimeout(1500)
  await waitForVisibleImages()
  await p.screenshot({ path: `${out}/by-decade.jpg`, ...opt })
}
if (want('decade-hover')) {
  // Decade bars reveal their count in place; make sure we're in decade view.
  if (!(await p.locator('.histogram.is-decade').count())) await p.locator('.toggle button').nth(1).click()
  await p.waitForTimeout(800)
  const bars = p.locator('.hist-col')
  await bars.nth(Math.floor((await bars.count()) * 0.6)).hover()
  await p.waitForTimeout(400)
  const h = await p.locator('.histogram').boundingBox()
  await p.screenshot({ path: `${out}/decade-hover.jpg`, ...opt, clip: { x: 0, y: Math.max(0, h.y - 10), width: 1110, height: h.height + 20 } })
}
if (want('gaps-only')) {
  await p.mouse.move(5, 5)
  await p.locator('.toggle button').nth(0).click() // By Year
  await p.waitForTimeout(800)
  await p.getByRole('button', { name: 'Gaps only' }).click()
  await p.waitForTimeout(1500)
  await p.locator('.card.ghost').first().waitFor()
  await waitForPosters()
  await p.mouse.move(5, 5)
  await waitForVisibleImages()
  await p.screenshot({ path: `${out}/gaps-only.jpg`, ...opt })
}
await b.close()
