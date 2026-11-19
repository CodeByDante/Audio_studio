<div align="center">
  <img src="./logo.svg" alt="Logo de Audio Studio" width="80">
  <h1>Audio Studio</h1>
  <p>Editor de audio en el navegador, con línea de tiempo y exportación WAV.</p>
  <a href="https://codebydante.github.io/Audio_studio/"><img alt="Abrir Audio Studio en GitHub Pages" src="https://img.shields.io/badge/Abrir%20Audio%20Studio-GitHub%20Pages-bcfc78?style=for-the-badge"></a>
</div>

Abre el editor desde el botón de GitHub Pages.

## Edición

- Arrastra archivos al recuadro de importación o directamente a la pista. También puedes abrirlos desde el selector.
- Arrastra un borde del clip para recortarlo. Para cortarlo en dos, sitúa el cabezal con un clic y pulsa **Ctrl+B** o **Cmd+B**.
- Usa **Quitar silencios** en el clip seleccionado. Puedes ajustar el umbral y la duración mínima. Se conserva un margen corto junto al sonido para suavizar los cortes.
- Con **Pegado automático** activado, cada importación se añade al final y los clips que mueves se enganchan al acercarse. Con el botón apagado, puedes dejar espacios y soltar clips en posiciones libres.
- Selecciona el audio importado de un video y pulsa **Ver video** para abrir el original. Los formatos y códecs que se pueden importar y previsualizar dependen del navegador. Los archivos de video sin pista de audio no se importan.
- Pulsa **Exportar WAV** para unir la pista completa en un archivo WAV PCM de 16 bits. La mezcla incluye los huecos que se hayan dejado en la línea de tiempo.

**Espacio** reproduce o pausa. **Ctrl+Z** o **Cmd+Z** deshace una edición. **Supr** elimina el clip seleccionado. Prueba la herramienta con el ejemplo incluido.

## Abrir localmente

Descomprime el proyecto y abre `index.html` en un navegador actual. Los archivos multimedia se procesan localmente.

