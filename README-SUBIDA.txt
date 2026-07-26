KhalerOS + Spectrum
====================

Contenido:
- index.html: escritorio KhalerOS actualizado.
- apps/spectrum/index.html: aplicación Spectrum.
- apps/spectrum/roms/: juegos Parkour Labs 48K y La Deuda.

SUBIDA A GITHUB PAGES
---------------------
Copia el contenido de esta carpeta en la raíz de la carpeta KhalerOS de tu repositorio, conservando exactamente la estructura de directorios.

La URL final seguirá siendo:
https://soykhaler.github.io/KhalerOS/

IMPORTANTE
----------
- No abras index.html mediante file:// para probar el emulador. Usa GitHub Pages o un servidor local, por ejemplo: python3 -m http.server 8000
- JSSpeccy 3.2 está incluido en apps/spectrum/vendor/ para evitar dependencias externas rotas.
- Los archivos TAP sí están alojados en tu propio repositorio.
- La carga de audio requiere una interacción del usuario por las políticas de los navegadores.
- El servidor debe servir los archivos .wasm como application/wasm (GitHub Pages ya lo hace).

PRUEBA AUTOMATIZADA
-------------------
Con el servidor local activo en el puerto 8765, ejecuta:

node tests/smoke.mjs

La prueba usa Chromium y comprueba el arranque, las preferencias, la calculadora,
la gestión de ventanas y la inicialización local de Spectrum.
