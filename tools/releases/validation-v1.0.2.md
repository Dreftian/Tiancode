# Validación de Tiancode 1.0.2

Fecha: 30 de septiembre de 2026. Windows x64; compilación `TIANCODE_CHANNEL=prod`, ediciones `github` (publicada) y `local` (carpeta `install/`).

## Pruebas ejecutadas

| Área | Resultado |
| --- | --- |
| App (`bun test --conditions=solid`, todo `frontend/app/src`) | 1.082 correctas, 0 fallidas |
| App: pruebas de rendimiento unitarias (`e2e/performance/unit`) | 43 correctas, 0 fallidas |
| Backend: servir la app web desde una carpeta, rutas públicas, autenticación y CORS | 16 + 6 correctas, 0 fallidas |
| Backend: skills integradas (registro de 131 skills y carga) | 4 + 39 correctas, 0 fallidas |
| Core: reintentos (incluido 499 por recarga de instancia) | 9 correctas, 0 fallidas |
| Tipos | `bun turbo typecheck --force`: 27 de 27 paquetes correctos |

Dos pruebas de CORS esperaban orígenes que el endurecimiento de Tiancode ya no admite (`https://app.opencode.ai` y `http://localhost:3000` sin contraseña); se actualizaron a `https://tiancode.vercel.app`. La prueba «plugin client requests reuse the listening server instance» de `httpapi-listen` agota sus 5 s también sin estos cambios; queda fuera de esta versión.

## Comprobaciones en la interfaz

- Ajustes recorridos con un script a 390 px, 768 px y escritorio: 35 vistas sin desbordamiento horizontal, sin botones sin nombre ni desplazamiento bloqueado. Se corrigió la fila del buscador en teléfonos.
- Modo diseño en el iframe: etiqueta al pasar el cursor, selección, barra de información y «Añadir al chat» con el contexto del elemento en el compositor; Escape dentro de la página apaga el modo.
- Terminal lateral e inferior, con cambio en vivo y la misma sesión de terminal; «Ajustar líneas» cambia los diffs entre `wrap` y `scroll` al instante.
- Agente del navegador sobre la propia app: referencias iguales entre dos informes, mensaje de referencia caducada, marcas de fuera de vista y apertura de un menú con la secuencia de puntero.
- Emparejamiento: servidor con contraseña sirviendo la app web de Tiancode; el enlace con `auth_token` abre la app, carga los recursos y todas las peticiones de API responden 200.

## Compilación empaquetada

- `latest.yml` declara `version: 1.0.2` y su SHA-512 coincide con `Tiancode.exe` (343,2 MiB; portable 341,7 MiB). `resources/web-ui` va empaquetado sin mapas de código.
- Prueba con perfil aislado (`TIANCODE_TEST_ONBOARDING=1`) por CDP: tarjeta de bienvenida a 0,9 s, compositor listo 2,9 s después de cerrarla, `pairingInfo` responde, la página Emparejar muestra Red local y Mantener la pantalla activa, y activar Red local muestra «Reinicia para aplicar». Sin errores ni avisos al arrancar tras el ajuste de reintentos.

## Publicación

- [v1.0.2](https://github.com/Dreftian/Tiancode/releases/tag/v1.0.2) publicada desde la rama `opencode-v2-parity`; los cuatro archivos coinciden por SHA-256 y `releases/latest/download/latest.yml` sirve `version: 1.0.2`.
- Web publicada en https://tiancode.vercel.app/ (portada y Novedades en 1.0.2) y versión web v1.0.2 con el sitio comprimido.

## Límites

La comprobación de actualización se hizo sobre el manifiesto publicado (1.0.2 > 1.0.1), sin abrir la instalación del usuario. La instalación del usuario es una edición `local` (perfil `ai.tiancode.desktop`): su actualizador ofrece la edición de GitHub, que usa el perfil limpio `ai.tiancode.desktop.release`. Para conservar sus datos debe instalar `install/Tiancode.exe`. No se activó la red local en la compilación empaquetada (abriría el firewall de Windows) ni se probó desde otro dispositivo físico.
