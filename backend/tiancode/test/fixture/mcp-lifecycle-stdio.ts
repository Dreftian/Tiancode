import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { spawn } from "node:child_process"

const hanging = process.argv.includes("--hang")
const reportsPid = hanging || process.argv.includes("--report-pid")

if (reportsPid) {
  const pidFile = process.env.MCP_LIFECYCLE_PID_FILE
  if (!pidFile) throw new Error("MCP_LIFECYCLE_PID_FILE is required")
  const childPidFile = process.env.MCP_LIFECYCLE_CHILD_PID_FILE
  if (process.argv.includes("--child") && !childPidFile) throw new Error("MCP_LIFECYCLE_CHILD_PID_FILE is required")
  if (childPidFile) {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
    if (!child.pid) throw new Error("Failed to start MCP lifecycle child")
    await Bun.write(childPidFile, String(child.pid))
  }
  await Bun.write(pidFile, String(process.pid))
}

if (hanging) {
  await new Promise(() => {})
}

const server = new Server({ name: "mcp-lifecycle-stdio", version: "1.0.0" }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({
    tools: [
      {
        name: "current_directory",
        description: process.cwd(),
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }),
)

await server.connect(new StdioServerTransport())
