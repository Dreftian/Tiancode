import { describe, expect, test } from "bun:test"
import path from "node:path"
import { OpenApi } from "effect/unstable/httpapi"
import { InstanceApi, InstancePaths } from "../../src/server/routes/instance/httpapi/groups/instance"
import {
  agentDefinitionCandidates,
  agentDefinitionPath,
  buildPermission,
} from "../../src/server/routes/instance/httpapi/handlers/instance"

// Agent.generate() (backend/tiancode/src/agent/agent.ts) has existed for a while but its only
// caller was the CLI, so the settings UI could not offer "describe it and let a model draft it".
// These assertions pin the HTTP surface the UI talks to: before the endpoint existed every one
// of them failed on an undefined `/agent/generate` path item.

type Schema = {
  $ref?: string
  required?: string[]
  properties?: Record<string, Schema>
  anyOf?: Schema[]
}
type Operation = {
  operationId?: string
  requestBody?: { content?: Record<string, { schema?: Schema }> }
  responses?: Record<string, { content?: Record<string, { schema?: Schema }> }>
}
type Spec = {
  components: { schemas: Record<string, Schema> }
  paths: Record<string, Partial<Record<"get" | "post" | "put" | "delete", Operation>>>
}

const spec = () => OpenApi.fromApi(InstanceApi) as unknown as Spec

const resolve = (spec: Spec, schema: Schema | undefined): Schema | undefined => {
  if (!schema) return undefined
  if (!schema.$ref) return schema
  return spec.components.schemas[schema.$ref.replace("#/components/schemas/", "")]
}

describe("POST /agent/generate", () => {
  test("is declared as its own route", () => {
    expect(InstancePaths.agentGenerate).toBe("/agent/generate")
    expect(spec().paths["/agent/generate"]?.post).toBeDefined()
  })

  test("does not collide with the POST that actually writes an agent to disk", () => {
    // /agent/create writes a file; /agent/generate must not, so they have to stay separate
    // operations rather than one path serving both.
    //
    // The assertion here used to be `expect(generatePost).not.toBe(createPost)` — a reference
    // comparison of two object literals the spec builder allocates separately, which no
    // implementation could ever fail. These compare what actually distinguishes them.
    const doc = spec()
    const paths = doc.paths
    expect(paths["/agent/create"]?.post).toBeDefined()
    expect(InstancePaths.agentCreate).not.toBe(InstancePaths.agentGenerate)

    // Different operations: different ids, and different success bodies. create answers with the
    // saved agent (it has a `name`); generate answers with a draft the caller still has to review.
    expect(paths["/agent/generate"]?.post?.operationId).toBe("app.agents.generate")
    expect(paths["/agent/create"]?.post?.operationId).toBe("app.agents.create")

    const body = (op: Operation | undefined) =>
      resolve(doc, op?.responses?.["200"]?.content?.["application/json"]?.schema)
    expect(Object.keys(body(paths["/agent/create"]?.post)?.properties ?? {})).toContain("name")
    expect(Object.keys(body(paths["/agent/generate"]?.post)?.properties ?? {})).not.toContain("name")
  })

  test("takes a required description and an optional provider/model pair", () => {
    const doc = spec()
    const body = resolve(doc, doc.paths["/agent/generate"]?.post?.requestBody?.content?.["application/json"]?.schema)

    expect(body?.required).toEqual(["description"])
    expect(Object.keys(body?.properties ?? {})).toEqual(
      expect.arrayContaining(["description", "providerID", "modelID"]),
    )
  })

  test("returns the three fields the create form is pre-filled from", () => {
    const doc = spec()
    const success = resolve(
      doc,
      doc.paths["/agent/generate"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema,
    )

    expect(success?.required).toEqual(["identifier", "whenToUse", "systemPrompt"])
  })

  test("reports a model failure as 422 with an actionable reason instead of a bare 500", () => {
    const doc = spec()
    const post = doc.paths["/agent/generate"]?.post

    expect(post?.responses?.["400"]).toBeDefined()
    const failure = resolve(doc, post?.responses?.["422"]?.content?.["application/json"]?.schema)
    const reason = resolve(doc, resolve(doc, failure?.properties?.data)?.properties?.reason)
    expect(reason).toMatchObject({ enum: expect.arrayContaining(["no-model", "model-failed"]) })
  })
})

// The create form offers nine checkboxes. `buildPermission` writes an explicit verdict for every
// permission it knows, so anything it knows and the form cannot show is denied by omission — the
// created agent came out unable to delegate, list a directory, ask a question or run a skill.
describe("buildPermission", () => {
  const FORM_TOOLS = ["Read", "Grep", "Glob", "Bash", "Edit", "Write", "WebFetch", "WebSearch", "TodoWrite"]

  test("denies exactly the form tools the user left unticked", () => {
    const permission = buildPermission(["Read", "Grep", "Glob"])!

    expect(permission).toMatchObject({
      read: "allow",
      grep: "allow",
      glob: "allow",
      bash: "deny",
      edit: "deny",
      write: "deny",
      webfetch: "deny",
      websearch: "deny",
      todowrite: "deny",
    })
  })

  test("leaves every permission the form cannot show inherited rather than denied", () => {
    const permission = buildPermission(["Read"])!

    for (const ungoverned of ["task", "list", "question", "skill", "lsp", "external_directory", "doom_loop"]) {
      expect(permission[ungoverned]).toBeUndefined()
    }
  })

  test("ticking every box leaves nothing denied", () => {
    expect(Object.values(buildPermission(FORM_TOOLS)!)).not.toContain("deny")
  })

  test("no tools list at all means no permission block, i.e. pure inheritance", () => {
    expect(buildPermission(undefined)).toBeUndefined()
  })

  test("a caller naming a permission outside the form is asking for it explicitly", () => {
    expect(buildPermission(["Read", "task"])!["task"]).toBe("allow")
  })
})

// Delete resolved `<global config>/agent/<name>.md` and nothing else, so deleting a project agent
// — this repository has .tiancode/agent/triage.md — answered 400 after the user had confirmed.
describe("agentDefinitionCandidates", () => {
  const global = path.join("C:", "config", "tiancode")
  const project = path.join("C:", "repo", ".tiancode")

  test("looks in every config directory, not only the global one", () => {
    const candidates = agentDefinitionCandidates([global, project], "triage")

    expect(candidates).toContain(path.join(project, "agent", "triage.md"))
    expect(candidates).toContain(path.join(global, "agent", "triage.md"))
  })

  test("keeps the global directory first so an agent in both scopes resolves where it always did", () => {
    expect(agentDefinitionCandidates([global, project], "triage")[0]).toBe(path.join(global, "agent", "triage.md"))
  })

  test("covers both folder spellings ConfigAgent.load scans", () => {
    expect(agentDefinitionCandidates([project], "triage")).toEqual([
      path.join(project, "agent", "triage.md"),
      path.join(project, "agents", "triage.md"),
    ])
  })

  test("refuses to escape a config directory", () => {
    expect(agentDefinitionCandidates([global], "../../evil")).toEqual([])
    expect(agentDefinitionCandidates([global], "   ")).toEqual([])
    expect(agentDefinitionCandidates([global], path.join("C:", "windows", "system32", "x"))).toEqual([])
  })

  test("agrees with agentDefinitionPath for the global directory", () => {
    expect(agentDefinitionCandidates([global], "triage")[0]).toBe(agentDefinitionPath(global, "triage")!)
  })
})
