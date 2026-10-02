import { describe, expect, test } from "bun:test"
import {
  normalizeNewSessionWorktree,
  resolveNewSessionBranch,
  resolveNewSessionWorktree,
  workspaceDefaultSelection,
} from "./new-session-workspace-controller"

describe("new session workspace selection", () => {
  test("uses main when the workspace bar is unavailable", () => {
    expect(
      resolveNewSessionWorktree({
        enabled: false,
        selected: "/project/feature",
        directory: "/project/feature",
        projectWorktree: "/project",
      }),
    ).toBe("main")
  })

  test("derives an existing worktree from the current directory", () => {
    expect(
      resolveNewSessionWorktree({ enabled: true, directory: "/project/feature", projectWorktree: "/project" }),
    ).toBe("/project/feature")
    expect(resolveNewSessionWorktree({ enabled: true, directory: "/project", projectWorktree: "/project" })).toBe(
      "main",
    )
  })

  test("the default environment decides when nothing is selected in the project root", () => {
    expect(
      resolveNewSessionWorktree({ enabled: true, directory: "/project", projectWorktree: "/project", fallback: "create" }),
    ).toBe("create")
    expect(
      resolveNewSessionWorktree({
        enabled: true,
        directory: "/project/feature",
        projectWorktree: "/project",
        fallback: "create",
      }),
    ).toBe("/project/feature")
  })

  test("maps Settings > Default environment to a selection", () => {
    expect(workspaceDefaultSelection("local", "workspace")).toBe("main")
    expect(workspaceDefaultSelection("new")).toBe("create")
    expect(workspaceDefaultSelection("last-used")).toBe("main")
    expect(workspaceDefaultSelection("last-used", "local")).toBe("main")
    expect(workspaceDefaultSelection("last-used", "workspace")).toBe("create")
  })

  test("normalizes main to the project root outside the main worktree", () => {
    expect(normalizeNewSessionWorktree("main", "/project/feature", "/project")).toBe("/project")
    expect(normalizeNewSessionWorktree("main", "/project", "/project")).toBe("main")
  })

  test("falls back to the local branch for main, create, and unknown worktrees", () => {
    const branch = (worktree: string) => (worktree === "/project/feature" ? "feature" : undefined)
    expect(resolveNewSessionBranch({ worktree: "main", local: "dev", worktreeBranch: branch })).toBe("dev")
    expect(resolveNewSessionBranch({ worktree: "create", local: "dev", worktreeBranch: branch })).toBe("dev")
    expect(resolveNewSessionBranch({ worktree: "/project/feature", local: "dev", worktreeBranch: branch })).toBe(
      "feature",
    )
    expect(resolveNewSessionBranch({ worktree: "/missing", local: "dev", worktreeBranch: branch })).toBe("dev")
  })
})
