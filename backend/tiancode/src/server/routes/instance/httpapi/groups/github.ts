import { Project } from "@/project/project"
import { GithubApiError, GithubNotConnectedError } from "@/github"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError } from "../errors"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/github"

export const GithubConnectPayload = Schema.Struct({
  token: Schema.String,
}).annotate({ identifier: "GithubConnectPayload" })

export const GithubUser = Schema.Struct({
  login: Schema.String,
  name: Schema.optional(Schema.String),
  avatar_url: Schema.optional(Schema.String),
}).annotate({ identifier: "GithubUser" })

export const GithubStatus = Schema.Struct({
  connected: Schema.Boolean,
  login: Schema.optional(Schema.String),
  avatarUrl: Schema.optional(Schema.String),
}).annotate({ identifier: "GithubStatus" })

export const GithubDisconnectResult = Schema.Struct({
  success: Schema.Literal(true),
}).annotate({ identifier: "GithubDisconnectResult" })

export const GithubRepo = Schema.Struct({
  name: Schema.String,
  fullName: Schema.String,
  description: Schema.optional(Schema.String),
  url: Schema.String,
  private: Schema.Boolean,
  defaultBranch: Schema.optional(Schema.String),
}).annotate({ identifier: "GithubRepo" })

export const GithubReposQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  query: Schema.optional(Schema.String),
  perPage: Schema.optional(
    Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(100)),
  ),
})

export const GithubCreateRepoPayload = Schema.Struct({
  name: Schema.String,
  private: Schema.optional(Schema.Boolean),
  description: Schema.optional(Schema.String),
}).annotate({ identifier: "GithubCreateRepoPayload" })

export const CloneProjectPayload = Schema.Struct({
  url: Schema.String,
  directory: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
}).annotate({ identifier: "CloneProjectPayload" })

export const CloneProjectResult = Schema.Struct({
  project: Project.Info,
  directory: Schema.String,
}).annotate({ identifier: "CloneProjectResult" })

export const VcsCommitPayload = Schema.Struct({
  message: Schema.String,
  directory: Schema.optional(Schema.String),
}).annotate({ identifier: "VcsCommitPayload" })

export const VcsPushPayload = Schema.Struct({
  directory: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
}).annotate({ identifier: "VcsPushPayload" })

export const VcsPullPayload = Schema.Struct({
  directory: Schema.optional(Schema.String),
}).annotate({ identifier: "VcsPullPayload" })

export const VcsOperationResult = Schema.Struct({
  success: Schema.Boolean,
  output: Schema.optional(Schema.String),
}).annotate({ identifier: "VcsOperationResult" })

export const VcsRemoteResult = Schema.Struct({
  url: Schema.optional(Schema.String),
  hasRemote: Schema.Boolean,
}).annotate({ identifier: "VcsRemoteResult" })

export const GithubApi = HttpApi.make("github")
  .add(
    HttpApiGroup.make("github")
      .add(
        HttpApiEndpoint.post("connect", `${root}/connect`, {
          query: WorkspaceRoutingQuery,
          payload: GithubConnectPayload,
          success: described(GithubUser, "Connected GitHub user"),
          error: [InvalidRequestError, GithubApiError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "github.connect",
            summary: "Connect GitHub account",
            description: "Validate a GitHub personal access token and store it for authenticated git operations.",
          }),
        ),
        HttpApiEndpoint.get("status", `${root}/status`, {
          query: WorkspaceRoutingQuery,
          success: described(GithubStatus, "GitHub connection status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "github.status",
            summary: "Get GitHub connection status",
            description: "Report whether a GitHub account is connected. An invalid or expired token is removed.",
          }),
        ),
        HttpApiEndpoint.post("disconnect", `${root}/disconnect`, {
          query: WorkspaceRoutingQuery,
          success: described(GithubDisconnectResult, "Disconnect result"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "github.disconnect",
            summary: "Disconnect GitHub account",
            description: "Remove the stored GitHub token.",
          }),
        ),
        HttpApiEndpoint.get("repos", `${root}/repos`, {
          query: GithubReposQuery,
          success: described(Schema.Array(GithubRepo), "List of repositories"),
          error: [GithubNotConnectedError, GithubApiError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "github.repos",
            summary: "List GitHub repositories",
            description: "List the authenticated user's repositories, optionally filtered by a search query.",
          }),
        ),
        HttpApiEndpoint.post("createRepo", `${root}/repos`, {
          query: WorkspaceRoutingQuery,
          payload: GithubCreateRepoPayload,
          success: described(GithubRepo, "Created repository"),
          error: [GithubNotConnectedError, GithubApiError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "github.createRepo",
            summary: "Create GitHub repository",
            description: "Create a repository for the authenticated user.",
          }),
        ),
        HttpApiEndpoint.post("cloneProject", `/project/clone`, {
          query: WorkspaceRoutingQuery,
          payload: CloneProjectPayload,
          success: described(CloneProjectResult, "Cloned project"),
          error: InvalidRequestError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "project.clone",
            summary: "Clone project",
            description: "Clone a git repository into the local repos directory and register it as a project.",
          }),
        ),
        HttpApiEndpoint.post("vcsCommit", `/vcs/commit`, {
          query: WorkspaceRoutingQuery,
          payload: VcsCommitPayload,
          success: described(VcsOperationResult, "Commit result"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.commit",
            summary: "Commit changes",
            description: "Stage all changes and create a commit in the target directory.",
          }),
        ),
        HttpApiEndpoint.post("vcsPush", `/vcs/push`, {
          query: WorkspaceRoutingQuery,
          payload: VcsPushPayload,
          success: described(VcsOperationResult, "Push result"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.push",
            summary: "Push changes",
            description: "Push the current branch to its remote, setting the upstream when missing.",
          }),
        ),
        HttpApiEndpoint.post("vcsPull", `/vcs/pull`, {
          query: WorkspaceRoutingQuery,
          payload: VcsPullPayload,
          success: described(VcsOperationResult, "Pull result"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.pull",
            summary: "Pull changes",
            description: "Fast-forward pull the current branch from its remote.",
          }),
        ),
        HttpApiEndpoint.get("vcsRemote", `/vcs/remote`, {
          query: WorkspaceRoutingQuery,
          success: described(VcsRemoteResult, "Remote URL"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.remote",
            summary: "Get remote URL",
            description: "Report the origin remote URL of the target directory.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "github",
          description: "GitHub integration and vcs write routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "tiancode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
