export * as DecisionPresets from "./presets"

import type { Question } from "./sequence"

// Measured on laya-multilingual (int8) with Spanish and English messages before shipping:
// the turn outcome was right on 11 of 12, the kind of work on 9 of 10. Questions about shell
// command risk and short voice commands were not reliable, so they are not offered.

/** How an assistant message ends the turn: used for the "done / needs you / failed" alerts. */
export const outcome: Question = {
  type: "choice",
  instructions: "How does this assistant message end the turn?",
  criteria: {
    done: "the work is finished and the message does not ask the user anything",
    question: "the message asks the user to answer, choose or confirm something before continuing",
    failed: "the message says something went wrong, an error happened or it could not finish",
  },
}

/** What kind of software work a request asks for. */
export const area: Question = {
  type: "choice",
  instructions: "Which kind of software work does this request ask for?",
  criteria: {
    ui: "user interface, web pages, styles, components, design",
    backend: "server, API, endpoints, business logic",
    data: "database, SQL, migrations, schemas",
    tests: "writing or fixing tests",
    docs: "documentation, README, comments",
    devops: "build, deploy, CI, Docker, servers",
  },
}

export const all = { outcome, area } as const
export type Name = keyof typeof all
