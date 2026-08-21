import { afterEach, describe, expect, test } from "bun:test"
import { Context } from "effect"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { PreviewApi, PreviewPaths } from "../../src/server/routes/instance/httpapi/groups/preview"
import { Authorization } from "../../src/server/routes/instance/httpapi/middleware/authorization"
import { InstanceContextMiddleware } from "../../src/server/routes/instance/httpapi/middleware/instance-context"
import { WorkspaceRoutingMiddleware } from "../../src/server/routes/instance/httpapi/middleware/workspace-routing"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import { resetDatabase } from "../fixture/db"

const context = Context.empty() as Context.Context<unknown>

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("preview HttpApi", () => {
  test("requires workspace routing and an instance context for every endpoint", () => {
    const endpoints = Object.values(PreviewApi.groups.preview.endpoints)

    expect(endpoints).not.toHaveLength(0)
    endpoints.forEach((endpoint) => {
      expect(endpoint.middlewares).toContain(InstanceContextMiddleware)
      expect(endpoint.middlewares).toContain(WorkspaceRoutingMiddleware)
      expect(endpoint.middlewares).toContain(Authorization)
    })
  })

  test("loads the routed project before reading its managed preview state", async () => {
    await using tmp = await tmpdir({ git: true })
    const url = new URL(`http://localhost${PreviewPaths.status}`)
    url.searchParams.set("directory", tmp.path)

    const response = await HttpApiApp.webHandler().handler(
      new Request(url, { headers: { "x-tiancode-directory": tmp.path } }),
      context,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "idle", url: null })
  })
})
