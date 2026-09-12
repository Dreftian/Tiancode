import { describe, expect, test } from "bun:test"
import { isFilesystemRoot } from "@tiancode-ai/core/util/path"

describe("isFilesystemRoot", () => {
  test("recognises posix and windows roots", () => {
    expect(isFilesystemRoot("/")).toBe(true)
    expect(isFilesystemRoot("C:\\")).toBe(true)
    expect(isFilesystemRoot("C:/")).toBe(true)
    expect(isFilesystemRoot("c:")).toBe(true)
    expect(isFilesystemRoot("\\\\server\\share")).toBe(true)
    expect(isFilesystemRoot("\\\\server\\share\\")).toBe(true)
  })

  test("a real folder is not a root", () => {
    expect(isFilesystemRoot("C:\\Users\\Dreitz\\Desktop\\app")).toBe(false)
    expect(isFilesystemRoot("/home/dreitz/app")).toBe(false)
    expect(isFilesystemRoot("\\\\server\\share\\app")).toBe(false)
    expect(isFilesystemRoot("C:\\Users")).toBe(false)
  })

  test("blank input is not a root", () => {
    expect(isFilesystemRoot(undefined)).toBe(false)
    expect(isFilesystemRoot("")).toBe(false)
    expect(isFilesystemRoot("   ")).toBe(false)
  })
})
