import { onMount } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { showToast } from "@/utils/toast"
import { useSettingsDialog } from "./settings-dialog"

const NOTICE_KEY = "tiancode.dataFolder.notice"

/**
 * A GitHub build that replaced a local install chooses between two data folders
 * (desktop/src/main/profile.ts). When the one not in use also holds data, say so once per folder
 * so nothing seems lost; Settings › General › Data switches between them. A folder the user
 * picked there needs no reminder.
 */
export function DataFolderNotice() {
  const platform = usePlatform()
  const language = useLanguage()
  const openData = useSettingsDialog("data")

  onMount(() => {
    const folder = platform.dataFolder
    if (!folder) return
    void folder
      .info()
      .then((info) => {
        const other = info.alternative
        if (!other || info.chosen) return
        // Settings offers any folder that was used; the notice is for one that holds data.
        if (!other.keys && other.sessions === 0) return
        try {
          // Local storage lives in the folder in use, so each folder gets the notice once.
          if (localStorage.getItem(NOTICE_KEY) === other.path) return
          localStorage.setItem(NOTICE_KEY, other.path)
        } catch {
          return
        }
        showToast({
          persistent: true,
          title: language.t("toast.dataFolder.title"),
          description: language.t("toast.dataFolder.description", { path: info.path, other: other.path }),
          actions: [
            { label: language.t("toast.dataFolder.action.settings"), onClick: openData },
            { label: language.t("common.dismiss"), onClick: "dismiss" },
          ],
        })
      })
      .catch(() => undefined)
  })

  return null
}
