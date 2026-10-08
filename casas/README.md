# 🏠 Casas → Google Sheet

Botón ❤️ en Chrome para guardar las casas que te gustan en un Google Sheet compartido. En el Sheet cada quien vota 👍/🤔/👎 y se calcula el tiempo en carro al **CETI Colomos** según el horario de entrada y salida.

Funciona en **Inmuebles24, Trovit, Propiedades.com, Monopolio, Rentumo y Facebook Marketplace**. No es un bot: igual que el lector de Facebook, solo lee lo que tú ya tienes abierto en la pantalla, así que los sitios no lo bloquean.

```
casas/
├── extension/      ← extensión de Chrome (el botón ❤️)
└── apps-script/    ← código que va pegado en el Google Sheet
```

## Instalación (~10 min, una sola vez)

### 1. El Google Sheet
1. Crea un Google Sheet nuevo, por ejemplo "Casas 2026".
2. Abre **Extensiones → Apps Script**, borra lo que trae y pega todo `apps-script/Code.gs`.
3. Arriba, en `VOTANTES`, cambia `'Esposa'` por el nombre de tu esposa. En `CARPETA_FOTOS_ID` va el ID de la carpeta de Drive para las fotos: es lo que viene después de `/folders/` en el link de la carpeta. Guarda con 💾.
4. Regresa al Sheet y recarga la página. Aparece el menú **🏠 Casas**.
5. **🏠 Casas → 1. Preparar hoja**. Google te pide permisos (Sheets, Drive, Maps y conexión externa); acéptalos. Si sale "Google no verificó esta app", entra a *Configuración avanzada → Ir a … (no seguro)*. Es tu propio script.
6. **🏠 Casas → 2. Configurar calendario de la escuela** y pega la dirección `.ics` del calendario de tu niña. Se llena la hoja **Horario** con la entrada y salida de cada día. Revísala: si algo no cuadra, corrígela a mano.

### 2. Publicar el script (para que la extensión le pueda mandar casas)
1. En Apps Script: **Implementar → Nueva implementación → ⚙️ Aplicación web**.
2. *Ejecutar como:* **Yo**. *Quién tiene acceso:* **Cualquier persona**.
3. **Implementar** y copia la URL que termina en `/exec`.

> "Cualquier persona" es necesario para que Chrome pueda mandarle datos, pero solo se aceptan casas que traigan tu código secreto (paso 3).
> Si después cambias el código: **Implementar → Administrar implementaciones → ✏️ → Versión: nueva**. Así la URL sigue siendo la misma.

### 3. La extensión de Chrome
1. Descarga la carpeta `casas/extension` a tu compu.
2. En Chrome abre `chrome://extensions`, activa **Modo de desarrollador** (arriba a la derecha) y luego **Cargar extensión sin empaquetar**. Elige la carpeta `extension`.
3. Fija la extensión (ícono 🧩 → 📌) y dale clic. Pega:
   - la URL `/exec`
   - el código secreto (en el Sheet: **🏠 Casas → 3. Ver código para la extensión**)
4. **Guardar** y luego **Probar conexión**. Debe decir ✅.

### 4. Compartir con tu esposa
- Comparte el Sheet normal (botón **Compartir**) para que ella vote en su columna.
- Por cada casa se crea una subcarpeta en tu carpeta de fotos de Drive con todas las fotos del anuncio y un `datos del anuncio.txt`. Comparte la carpeta principal con tu esposa para que pueda abrirlas.

## Actualizar a una versión nueva
1. **Script:** en Apps Script borra todo, pega el código nuevo y guarda. Luego ve a **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. La URL `/exec` no cambia.
2. Si cambiaron las columnas, corre **🏠 Casas → 1. Preparar hoja**. La hoja vieja se renombra como "Casas (versión anterior …)" y se crea una nueva.
3. **Extensión:** reemplaza los archivos de la carpeta, entra a `chrome://extensions`, dale ↻ a la extensión y recarga la página del anuncio.

## Uso
1. Abre el anuncio de una casa que te guste.
2. Clic en el botón naranja **❤️** (abajo a la derecha).
3. Revisa los datos. Lo más importante es **Dirección / colonia**, porque con eso se calcula el tiempo al CETI. Agrega notas si quieres.
4. **Guardar en el Sheet**. En ~20 s se guarda y te dice cuántos minutos hay al CETI.

Tips:
- En Marketplace e Inmuebles24 a veces las fotos cargan hasta que abres la galería. Ábrela, pasa las fotos y dale **↻ Releer**.
- Si guardas la misma casa dos veces, te avisa y no la duplica.

## Qué hay en el Sheet

| Columna | Qué es |
|---|---|
| Foto | Miniatura guardada dentro del Sheet. No se pierde aunque borren el anuncio. |
| 🚗 Ida al CETI | Promedio de minutos con tráfico, saliendo 40 min antes de cada hora de entrada. |
| 🚗 Ida peor día | El día con más tráfico. Pasa el mouse por la celda de Ida para ver el detalle por día. |
| 🚗 Regreso | Del CETI a la casa a la hora de salida. |
| Ubicación | **📍 Exacta** si el anuncio trae el punto en el mapa o la dirección completa. **≈ Aprox.** si solo dice la colonia. |
| 👍 Lalo / 👍 Esposa | Menú 👍 🤔 👎. |
| Veredicto | Se actualiza solo al votar: ✅ Los dos (la fila se pone verde) · ❌ Nel (se pone gris) · 🤔 Platicarlo · ⏳ Falta votar. |
| Fotos (Drive) | Link a la carpeta de esa casa con todas las fotos. |
| Ruta | Abre la ruta en Google Maps. |

**Si corriges la dirección a mano**, selecciona esa fila y usa **🏠 Casas → Recalcular tiempos (fila seleccionada)**.
Si cambia el horario: **Actualizar horario desde el calendario** y luego **Recalcular tiempos**. Para recalcular todo, borra la columna de Ida antes.

## Cosas a saber
- El tráfico es el *estimado* de Google Maps para el próximo día y hora así, no el tráfico de hoy. Si Google no da dato de tráfico, usa el tiempo normal.
- Muchos anuncios (sobre todo de Marketplace) solo ponen la colonia. En ese caso el tiempo es al centro de la colonia.
- Si un sitio cambia su diseño y algún dato sale vacío, igual lo puedes escribir en el panel antes de guardar.
- El link del calendario es privado: se guarda solo dentro del script, no en este repo.
