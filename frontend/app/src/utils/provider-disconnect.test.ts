import { describe, expect, test } from "bun:test"
import { disconnectProvider } from "./provider-disconnect"

describe("disconnectProvider", () => {
  test("saves a durable block before removing credentials and refreshing", async () => {
    const events: string[] = []
    await disconnectProvider({
      providerID: "xkiro",
      readConfig: async () => ({ disabled_providers: ["old"], provider: { xkiro: { name: "xKiro" } } }),
      updateConfig: async (config) => {
        expect(config).toEqual({ disabled_providers: ["old", "xkiro"] })
        events.push("saved")
      },
      removeAuth: async () => {
        events.push("credentials")
      },
      refresh: async () => {
        events.push("refreshed")
      },
    })
    expect(events).toEqual(["saved", "credentials", "refreshed"])
  })

  test("surfaces a failed save without deleting credentials or claiming success", async () => {
    const events: string[] = []
    await expect(
      disconnectProvider({
        providerID: "xkiro",
        readConfig: async () => ({}),
        updateConfig: async () => {
          throw new Error("disk unavailable")
        },
        removeAuth: async () => {
          events.push("credentials")
        },
        refresh: async () => {
          events.push("refreshed")
        },
      }),
    ).rejects.toThrow("disk unavailable")
    expect(events).toEqual([])
  })
})
