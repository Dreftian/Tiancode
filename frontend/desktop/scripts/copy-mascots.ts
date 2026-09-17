// Copies the page-mascot sprite sheets next to the built main process so the desktop pet can
// read them from inside app.asar even when the extraResources folder is missing or relocated.
import { copyFile, mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"

const source = join(import.meta.dirname, "../../ui/src/components/mascots")
const target = join(import.meta.dirname, "../out/main/mascots")

await mkdir(target, { recursive: true })
let copied = 0
for (const name of await readdir(source)) {
  if (!name.endsWith(".webp")) continue
  await copyFile(join(source, name), join(target, name))
  copied++
}
if (copied === 0) {
  console.error(`No mascot sheets found in ${source}`)
  process.exit(1)
}
console.log(`Copied ${copied} mascot sheets to ${target}`)
