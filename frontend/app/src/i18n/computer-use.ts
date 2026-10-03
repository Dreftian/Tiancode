export const COMPUTER_USE_ENGLISH = {
  "settings.computerUse.visual.title": "Visual desktop control",
  "settings.computerUse.visual.description":
    "Your conversation's model observes Windows, acts in an app and checks the result. A blue glow marks the edges of your screens while control is active. Choose a model with vision to interpret screenshots.",
  "settings.computerUse.visual.observe": "Observe",
  "settings.computerUse.visual.observeDescription":
    "Screenshots with the monitor, image scale and accessible Windows controls.",
  "settings.computerUse.visual.act": "Act",
  "settings.computerUse.visual.actDescription": "Click, drag, type, use keyboard shortcuts, scroll and switch windows.",
  "settings.computerUse.visual.verify": "Verify",
  "settings.computerUse.visual.verifyDescription":
    "A new observation after each action. Finish or ask for your help when needed.",
  "settings.computerUse.visual.monitor": "Monitor for the agent",
  "settings.computerUse.visual.monitorDescription":
    "The model can request another connected monitor for an observation.",
  "settings.computerUse.visual.primary": "Primary monitor",
  "settings.computerUse.visual.compatibility":
    "Supports UI-TARS actions through the same permissions and stop controls. Native input is available on Windows; browser and remote pairing keep their own tools.",
  "settings.computerUse.visual.promptTitle": "Try it in a conversation",
  "settings.computerUse.visual.prompt":
    "Find Calculator, open its window, calculate 23 × 17 and verify the result on screen.",
  "settings.computerUse.visual.copy": "Copy example",
  "settings.computerUse.visual.copied": "Example copied",
} as const

export const COMPUTER_USE_SPANISH = {
  "settings.computerUse.visual.title": "Control visual del escritorio",
  "settings.computerUse.visual.description":
    "El modelo de tu conversación observa Windows, actúa en una aplicación y comprueba el resultado. Un resplandor azul marca los bordes de tus pantallas mientras el control está activo. Elige un modelo con visión para interpretar las capturas.",
  "settings.computerUse.visual.observe": "Observar",
  "settings.computerUse.visual.observeDescription":
    "Capturas con el monitor, la escala de la imagen y los controles accesibles de Windows.",
  "settings.computerUse.visual.act": "Actuar",
  "settings.computerUse.visual.actDescription":
    "Hacer clic, arrastrar, escribir, usar atajos, desplazarse y cambiar de ventana.",
  "settings.computerUse.visual.verify": "Comprobar",
  "settings.computerUse.visual.verifyDescription":
    "Una nueva observación tras cada acción. Termina o solicita tu ayuda cuando la necesita.",
  "settings.computerUse.visual.monitor": "Monitor del agente",
  "settings.computerUse.visual.monitorDescription":
    "El modelo puede solicitar otro monitor conectado para una observación.",
  "settings.computerUse.visual.primary": "Monitor principal",
  "settings.computerUse.visual.compatibility":
    "Admite acciones de UI-TARS con los mismos permisos y controles de parada. La entrada nativa está disponible en Windows; el navegador y el emparejamiento remoto conservan sus propias herramientas.",
  "settings.computerUse.visual.promptTitle": "Pruébalo en una conversación",
  "settings.computerUse.visual.prompt":
    "Busca la Calculadora, abre su ventana, calcula 23 × 17 y comprueba el resultado en pantalla.",
  "settings.computerUse.visual.copy": "Copiar ejemplo",
  "settings.computerUse.visual.copied": "Ejemplo copiado",
} satisfies Record<keyof typeof COMPUTER_USE_ENGLISH, string>
