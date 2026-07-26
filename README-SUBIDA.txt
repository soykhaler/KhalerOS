KhalerOS + Spectrum
====================

Contenido:
- index.html: escritorio KhalerOS actualizado.
- apps/spectrum/index.html: aplicación Spectrum.
- apps/spectrum/roms/: juegos Parkour Labs 48K y La Deuda.
- apps/pixel/: editor de pixel art local.
- apps/photo/: integración del editor fotográfico Photopea.
- apps/modeler/: modelador 3D básico con importación y exportación GLB.
- apps/gdscript/: laboratorio de GDScript mediante GDScript Online.

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
- Pixel Art y Modelador 3D funcionan con archivos locales del repositorio.
- Khaler Photo y Godot Lab necesitan conexión porque integran servicios web externos.
- El Navegador abre las webs en una pestaña real. La vista integrada es opcional y solo
  funciona cuando la web de destino permite ser mostrada dentro de un iframe.

NUEVAS APLICACIONES
-------------------
- Pixel Art: dibujo por píxel, relleno, formas, simetría, historial, importación/exportación
  PNG y guardado automático local. No necesita conexión.
- Khaler Photo: abre Photopea oficial dentro de KhalerOS para trabajar con PSD e imágenes.
- Modelador 3D: primitivas, transformaciones, materiales e importación/exportación GLB 2.0.
  No exporta FBX; GLB es el formato portable incluido en esta versión estática.
- Godot Lab: ejecuta fragmentos de GDScript mediante GDScript Online y enlaza al editor web
  oficial de Godot en una pestaña nueva.

PRUEBA AUTOMATIZADA
-------------------
Con el servidor local activo en el puerto 8765, ejecuta:

node tests/smoke.mjs

La prueba usa Chromium y comprueba el escritorio, el navegador, Spectrum, Pixel Art,
la persistencia/exportación PNG y la creación/exportación de GLB 2.0.
