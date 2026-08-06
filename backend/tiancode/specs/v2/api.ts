// @ts-nocheck

import { Tiancode } from "@tiancode-ai/core"
import { ReadTool } from "@tiancode-ai/core/tools"

const tiancode = Tiancode.make({})

tiancode.tool.add(ReadTool)

tiancode.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

tiancode.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

tiancode.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await tiancode.session.create({
  agent: "build",
})

tiancode.subscribe((event) => {
  console.log(event)
})

await tiancode.session.prompt({
  sessionID,
  text: "hey what is up",
})

await tiancode.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await tiancode.session.wait()

console.log(await tiancode.session.messages(sessionID))
