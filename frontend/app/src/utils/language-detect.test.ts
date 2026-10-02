import { describe, expect, test } from "bun:test"
import { analyse } from "./language-detect"
import { isSpanishText, speechLocale } from "./voices"

describe("language detection for reading aloud", () => {
  test("names the language of Latin text and the script of others", () => {
    expect(speechLocale("La aplicación se cierra cada vez que abro la configuración.")).toBe("es-ES")
    expect(analyse("The build passes and all the tests are green now.").language).toBe("en")
    expect(speechLocale("Je voudrais que tu corriges le bouton de la page.")).toBe("fr-FR")
    expect(speechLocale("二重に請求されました")).toBe("ja-JP")
    expect(speechLocale("Привет, как дела?")).toBe("ru-RU")
  })

  test("Spanish text is Spanish even without accents, English is not", () => {
    expect(isSpanishText("Listo, actualice el componente y todos los tests pasan")).toBe(true)
    expect(isSpanishText("Done, I updated the component and every test passes")).toBe(false)
  })

  test("code in an English sentence does not make it another language", () => {
    expect(analyse("Use os.path to join the folders and call round(el, 2) after that.").isEnglish).toBe(true)
  })
})
