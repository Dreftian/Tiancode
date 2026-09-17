export function hasCustomAgent(items: Array<{ native?: boolean }>) {
  return items.some((item) => item.native === false)
}

export function resolveAgent<T extends { name: string }>(items: T[], name?: string) {
  return items.find((item) => item.name === name) ?? items.find((item) => item.name === "build") ?? items[0]
}
export function primaryAgents<T extends { name: string; mode?: string; hidden?: boolean }>(agents: T[]) {
  return ["build", "plan"].flatMap((name) =>
    agents.filter((agent) => agent.name === name && !agent.hidden && agent.mode !== "subagent"),
  )
}
