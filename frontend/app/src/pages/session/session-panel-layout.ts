export function sessionPanelLayout(input: { review: boolean; files: boolean; terminal?: boolean }) {
  const region = input.review || input.files
  return {
    // La columna lateral la abren la revisión, el árbol de archivos o la
    // terminal cuando Ajustes > General > Posición del terminal es "Lateral".
    visible: region || !!input.terminal,
    // Solo se apila cuando la terminal lateral comparte columna con la
    // revisión o el árbol: la terminal queda debajo con su propia altura.
    stacked: region && !!input.terminal,
  }
}
