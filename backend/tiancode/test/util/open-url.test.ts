import { expect, test } from "bun:test"
import { openUrl } from "@/util/open-url"

test("refuses to open anything that is not an http or https link", async () => {
  await expect(openUrl("file:///C:/Windows/System32/calc.exe")).rejects.toThrow("Only http and https links")
  await expect(openUrl("javascript:alert(1)")).rejects.toThrow("Only http and https links")
  await expect(openUrl("not a url")).rejects.toThrow("Only http and https links")
})
