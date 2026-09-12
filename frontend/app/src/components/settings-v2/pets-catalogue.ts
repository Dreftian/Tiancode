// Glifos emoji de cada mascota, copiados de petGlyphs en frontend/desktop/src/main/desktop-pet.ts.
//
// Es una copia a propósito: frontend/app no depende de frontend/desktop (la app corre también en
// el navegador), así que no se puede importar a través de ese límite. El test de al lado obliga a
// que la copia siga cubriendo exactamente los petKinds declarados en @/context/settings.

import type { PetKind } from "@/context/settings"

export const PET_GLYPHS: Record<PetKind, string> = {
  dewey: "💧",
  fireball: "🔥",
  hoots: "🦉",
  rocky: "🪨",
  seedy: "🌱",
  stacky: "🥞",
  bsod: "🖥️",
  nullsignal: "🤖",
  cat: "🐱",
  dog: "🐶",
  rabbit: "🐰",
  panda: "🐼",
  fox: "🦊",
}
