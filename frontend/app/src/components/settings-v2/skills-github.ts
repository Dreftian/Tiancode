const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(tree|blob)\/([^/\s#]+)((?:\/[^\s#]*)?))?(?:[?#].*)?$/i

const MAX_GITHUB_SKILLS = 20
const MAX_FILES_PER_SKILL = 256

type GitHubSource = {
  owner: string
  repo: string
  kind?: "tree" | "blob"
  ref: string
  subpath: string
}

export function decodeGitHubUrl(value: string): GitHubSource | undefined {
  const match = GITHUB_URL_RE.exec(value.trim())
  if (!match) return undefined
  const kind = match[3] === "tree" || match[3] === "blob" ? match[3] : undefined
  const subpath = (match[5] ?? "").replace(/^\//, "").replace(/\/$/, "")
  return {
    owner: match[1],
    repo: match[2],
    kind,
    ref: match[4] ?? "HEAD",
    subpath,
  }
}

const githubApiJson = async (url: string) => {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`GitHub request failed with ${response.status}`)
  return response.json()
}

const fetchGitHubFile = async (source: GitHubSource, path: string) => {
  const response = await fetch(`https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.ref}/${path}`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Failed to download ${path} (${response.status})`)
  if (Number(response.headers.get("content-length")) > 1_048_576) throw new Error("Skill file is too large")
  const content = await response.text()
  if (content.length > 1_048_576) throw new Error("Skill file is too large")
  return content
}

type GitHubSkillFiles = { name: string; files: { path: string; content: string }[] }

// Resolves a GitHub URL (repo root, tree folder, or a single SKILL.md blob)
// into one entry per discovered SKILL.md. Sibling files inside each skill's
// own directory ride along so references keep working.
type GitHubTreeEntry = { type: string; path: string }

// Validates the git-trees API response shape without type assertions.
function parseGitHubBlobPaths(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("tree" in value) || !Array.isArray(value.tree)) return []
  if ("truncated" in value && value.truncated) throw new Error("Repository tree is incomplete; select a smaller skill source")
  const paths: string[] = []
  for (const entry of value.tree) {
    if (!entry || typeof entry !== "object") continue
    if (!("type" in entry) || !("path" in entry)) continue
    if (entry.type === "blob" && typeof entry.path === "string" && !("mode" in entry && entry.mode === "120000")) {
      paths.push(entry.path)
    }
  }
  return paths
}

export async function fetchGitHubSkills(source: GitHubSource): Promise<GitHubSkillFiles[]> {
  if (source.kind === "blob") {
    if (!source.subpath.endsWith("SKILL.md")) return []
    const content = await fetchGitHubFile(source, source.subpath)
    const segments = source.subpath.split("/")
    segments.pop()
    const name = segments.pop() ?? source.repo
    return [{ name, files: [{ path: "SKILL.md", content }] }]
  }

  const data = await githubApiJson(
    `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.ref}?recursive=1`,
  )
  const blobPaths: GitHubTreeEntry["path"][] = parseGitHubBlobPaths(data)

  const prefix = source.kind === "tree" && source.subpath ? `${source.subpath}/` : ""
  const skillPaths = blobPaths
    .filter((filePath) => filePath === "SKILL.md" || filePath.endsWith("/SKILL.md"))
    .filter((filePath) => !prefix || filePath.startsWith(prefix))
    .sort()
  if (skillPaths.length > MAX_GITHUB_SKILLS) throw new Error("Select a specific skill folder instead of the entire repository")

  return Promise.all(
    skillPaths.map(async (skillPath) => {
      const dir = skillPath.includes("/") ? skillPath.slice(0, skillPath.lastIndexOf("/")) : ""
      const siblings = [skillPath, ...blobPaths
        .filter((filePath) => filePath !== skillPath && (!dir || filePath.startsWith(`${dir}/`)))
        .filter((filePath) => /\.(md|txt|json|[cm]?js|[cm]?ts|tsx|jsx|py|sh|ps1|toml|ya?ml|css|html|svg)$|(?:^|\/)LICENSE(?:\.[^/]*)?$/i.test(filePath))]
      if (siblings.length > MAX_FILES_PER_SKILL) throw new Error("Skill contains too many files")
      const files: GitHubSkillFiles["files"] = []
      // Large skills include many references. Bound concurrent requests instead
      // of opening hundreds of connections from the settings dialog at once.
      for (let start = 0; start < siblings.length; start += 8) {
        files.push(...await Promise.all(siblings.slice(start, start + 8).map(async (filePath) => ({
          path: dir ? filePath.slice(dir.length + 1) : filePath,
          content: await fetchGitHubFile(source, filePath),
        }))))
      }
      if (files.reduce((size, file) => size + file.content.length, 0) > 8_388_608) throw new Error("Skill is too large")
      return { name: dir.split("/").at(-1) || source.repo, files }
    }),
  )
}
