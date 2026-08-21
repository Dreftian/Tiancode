export function sessionPanelLayout(input: { review: boolean; files: boolean }) {
  return {
    // La columna lateral del diseño nuevo ya no contiene la terminal (ahora es
    // un dock inferior), así que solo la revisión y el árbol de archivos la abren.
    visible: input.review || input.files,
    // La revisión ya no comparte columna con la terminal: nunca necesita
    // encogerse para dejarle sitio, por lo que queda siempre sin apilar.
    stacked: false,
  }
}
