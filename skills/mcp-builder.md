---
name: mcp-builder
description: Guide for creating high-quality Model Context Protocol (MCP) servers using TypeScript (@modelcontextprotocol/sdk) and Python (FastMCP) with stdio and streamable HTTP transports.
tags: ["mcp", "model-context-protocol", "tools", "resources", "prompts"]
---

# Model Context Protocol (MCP) Server Builder

Definitive guide for implementing Model Context Protocol (MCP) servers to expose external tools, resources, and prompts to AI agents.

## 1. Core Concepts
- **Tools**: Executable functions that agents can invoke with arguments. Return text or image content.
- **Resources**: Read-only data payloads (files, API documents, schema definitions) identified by URIs.
- **Prompts**: Reusable prompt templates and workflows provided to the client.
- **Transports**:
  - `stdio`: Local command line processes (stdin/stdout). Best for desktop and CLI agents.
  - `Streamable HTTP / SSE`: Remote or containerized microservices.

---

## 2. TypeScript Implementation (`@modelcontextprotocol/sdk`)

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

const server = new Server(
  {
    name: "custom-tools-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// List Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "calculate_tax",
        description: "Calculate sales tax for a given amount and state",
        inputSchema: {
          type: "object",
          properties: {
            amount: { type: "number", description: "Subtotal in cents" },
            state: { type: "string", description: "2-letter US state code" },
          },
          required: ["amount", "state"],
        },
      },
    ],
  }
})

// Execute Tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "calculate_tax") {
    const { amount, state } = request.params.arguments as { amount: number; state: string }
    const rate = state.toUpperCase() === "CA" ? 0.0725 : 0.05
    const tax = Math.round(amount * rate)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ subtotal: amount, tax, total: amount + tax }),
        },
      ],
    }
  }
  throw new Error(`Unknown tool: ${request.params.name}`)
})

async function run() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("MCP Server running on stdio")
}

run().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
```

---

## 3. Python Implementation with FastMCP

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("demo-service")

@mcp.tool()
def query_weather(city: str, metric: bool = True) -> str:
    """Get current weather conditions for a specified city."""
    return f"The weather in {city} is 22°C, Sunny."

if __name__ == "__main__":
    mcp.run()
```

---

## 4. MCP Quality Checklist
- Every tool parameter must have a clear `description` explaining valid formats and units.
- Always log operational or diagnostic messages to `stderr`, never `stdout` (which is reserved for JSON-RPC messages).
- Return structured JSON in text results to allow seamless parsing by downstream agent steps.
