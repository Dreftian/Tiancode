#!/usr/bin/env bun
// Publishes the Homebrew formula for the Tiancode CLI in Dreftian/homebrew-tap (created on demand):
// `brew install Dreftian/tap/tiancode`. Reads the checksums produced by build-cli.ts.
// Usage: bun tools/script/publish-brew-tap.ts 1.0.0
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

const version = (process.argv[2] ?? "").replace(/^v/, "")
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Usage: publish-brew-tap.ts X.Y.Z")
const root = path.resolve(import.meta.dir, "../..")
const sums = readFileSync(path.join(root, "backend/tiancode/dist/cli/SHA256SUMS.txt"), "utf8")
const sha = (file: string) => {
  const line = sums.split("\n").find((entry) => entry.trim().endsWith(file))
  if (!line) throw new Error(`no checksum for ${file}`)
  return line.trim().split(/\s+/)[0]
}
const base = `https://github.com/Dreftian/Tiancode/releases/download/v${version}`
const formula = `class Tiancode < Formula
  desc "Tiancode CLI: local-first agentic coding (terminal UI, server and web)"
  homepage "https://tiancode.vercel.app/"
  version "${version}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "${base}/tiancode-darwin-arm64.zip"
      sha256 "${sha("tiancode-darwin-arm64.zip")}"
    else
      url "${base}/tiancode-darwin-x64.zip"
      sha256 "${sha("tiancode-darwin-x64.zip")}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "${base}/tiancode-linux-arm64.tar.gz"
      sha256 "${sha("tiancode-linux-arm64.tar.gz")}"
    else
      url "${base}/tiancode-linux-x64.tar.gz"
      sha256 "${sha("tiancode-linux-x64.tar.gz")}"
    end
  end

  def install
    bin.install "tiancode"
    libexec.install Dir["*"] if Dir["*"].any?
  end

  test do
    assert_match "${version}", shell_output("#{bin}/tiancode --version")
  end
end
`

const credential = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" })
const token = credential.split("\n").find((line) => line.startsWith("password="))?.slice(9).trim()
if (!token) throw new Error("No GitHub credential available")
const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Tiancode-Release", "content-type": "application/json" }
async function api<T>(url: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(url, { ...init, headers })
  const text = await response.text()
  return { ok: response.ok, status: response.status, data: (text ? JSON.parse(text) : undefined) as T }
}

const repo = "Dreftian/homebrew-tap"
const existing = await api<{ full_name: string }>(`https://api.github.com/repos/${repo}`)
if (!existing.ok) {
  const created = await api<{ html_url: string; message?: string }>("https://api.github.com/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: "homebrew-tap",
      description: "Homebrew tap for the Tiancode CLI (brew install Dreftian/tap/tiancode)",
      private: false,
      auto_init: true,
      license_template: "mit",
    }),
  })
  if (!created.ok) throw new Error(`cannot create ${repo}: ${created.status} ${created.data?.message ?? ""}`)
  console.log(`created ${created.data.html_url}`)
  await new Promise((resolve) => setTimeout(resolve, 3000))
}
const filePath = "Formula/tiancode.rb"
const current = await api<{ sha?: string }>(`https://api.github.com/repos/${repo}/contents/${filePath}`)
const put = await api<{ content?: { html_url: string }; message?: string }>(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
  method: "PUT",
  body: JSON.stringify({
    message: `tiancode ${version}`,
    content: Buffer.from(formula).toString("base64"),
    ...(current.ok && current.data?.sha ? { sha: current.data.sha } : {}),
  }),
})
if (!put.ok) throw new Error(`cannot write formula: ${put.status} ${put.data?.message ?? ""}`)
console.log(`formula published: ${put.data.content?.html_url}`)
const readme = `# Tiancode Homebrew tap\n\n\`\`\`bash\nbrew install Dreftian/tap/tiancode\n\`\`\`\n\nFormula for the Tiancode CLI (macOS and Linux). Site: https://tiancode.vercel.app/ · App: https://github.com/Dreftian/Tiancode\n`
const currentReadme = await api<{ sha?: string; content?: string }>(`https://api.github.com/repos/${repo}/contents/README.md`)
const decoded = currentReadme.ok && currentReadme.data?.content ? Buffer.from(currentReadme.data.content, "base64").toString("utf8") : ""
if (decoded !== readme) {
  await api(`https://api.github.com/repos/${repo}/contents/README.md`, {
    method: "PUT",
    body: JSON.stringify({ message: "tap readme", content: Buffer.from(readme).toString("base64"), ...(currentReadme.ok && currentReadme.data?.sha ? { sha: currentReadme.data.sha } : {}) }),
  })
}
console.log("done")
