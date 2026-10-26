# 🥐 Quisito · Restaurantes y cafeterías

Mapa para prospectar restaurantes y cafeterías en Guadalajara y Zapopan y ofrecerles los **quisitos, panes y postres** de Quisito.
Es el mismo sistema que `mamachita.quisitofood.com`, adaptado a restaurantes. Se publica en **restaurantes.quisitofood.com**.

- **Pines por estado**: gris = prospecto, dorado = visitado, morado = degustación (dejaste muestra), verde = cliente,
  naranja = seguimiento pronto, rojo (late) = seguimiento vencido, gris oscuro = no interesado.
- **Filtros** por colonia, tipo (Cafetería, Restaurante, Brunch / desayunos, Bistró…), prioridad y texto.
- **🔍 Buscar en esta zona**: trae los restaurantes y cafés de la colonia que estés viendo (Google Maps si hay clave, si no OpenStreetMap)
  y ya quita cadenas (Starbucks, Vips, Toks…) y lo que no compra pan ni postre (taquerías, mariscos, pizzerías, panaderías…).
- **Pedidos y degustaciones**: piezas de Quisito / Panes / Postres, precio, próximo seguimiento. Una degustación lo pone morado;
  el primer pedido lo vuelve cliente.
- **Contacto y WhatsApp**: guarda el encargado/chef y su teléfono; desde el detalle se abre WhatsApp con un mensaje de Quisito.
- **Territorio** 🚩: círculo alrededor de cada cliente, % por colonia y niveles ("Primer bocado" → "Quisito supremo").
- **Rutas**: "Ruta de seguimiento" o "Prospectos cerca de mí", ordenadas por cercanía y abiertas en Google Maps.

---

## 1. Crear la hoja (5 min)

1. Crea una hoja nueva en Google Sheets: **"Quisito - Prospectos restaurantes y cafeterías"**.
2. Compártela como **"Cualquier persona con el enlace: lector"**.
3. Copia el ID (lo que va entre `/d/` y `/edit` en la liga) y pégalo en [`config.js`](config.js) → `SHEET_ID`.

No hace falta escribir columnas a mano: el paso 2 crea las pestañas `Prospectos` y `Pedidos`.
(Si prefieres hacerlo a mano, la fila 1 de `Prospectos` es:
`Prioridad · Zona · Tipo · Nombre · Ubicación · Visitado · Maps · Notas · Estado · Lat · Lng · Contacto · Teléfono`.)

## 2. Conectar el Apps Script (recomendado, 5 min)

Con esto: coordenadas exactas de Google, registrar pedidos/degustaciones y cambiar estados desde el mapa,
y **un correo diario a las 8am** con los lugares a los que toca dar seguimiento.

1. En la hoja → **Extensiones → Apps Script**.
2. Borra lo que haya y pega todo el contenido de [`apps-script/Code.gs`](apps-script/Code.gs).
   - Si quieres clave para guardar, escríbela en `var PIN = '...'`.
3. Guarda (💾), elige la función **`configurar`** arriba y dale **Ejecutar**. Acepta los permisos.
4. **Implementar → Nueva implementación → Tipo: Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - Copia la URL que termina en `/exec`.
5. Pega esa URL en [`config.js`](config.js) → `SCRIPT_URL`.

### Columnas

**Prospectos**: `Prioridad · Zona · Tipo · Nombre · Ubicación · Visitado · Maps · Notas · Estado · Lat · Lng · Contacto · Teléfono`

- `Estado`: Prospecto, Visitado, Degustación, Interesado, Cliente, No interesado.

**Pedidos** (una fila por pedido o degustación):
`Fecha · Lugar · Quisito · Panes · Postres · Precio · Seguimiento · Tipo · Notas`

- `Lugar` debe escribirse igual que `Nombre` en `Prospectos`.
- `Tipo`: `Pedido` o `Degustación`. Las degustaciones no cuentan como venta.
- `Seguimiento` vacío = Fecha + 7 días (3 días si es degustación). Se cambia en `config.js` → `DIAS_SEGUIMIENTO`.
- `Precio` = precio promedio por pieza.

Para agregar otro producto (p. ej. "Galletas"): agrega la columna en `Pedidos`, una línea en `PRODUCTOS` de `config.js`
y el nombre en `PRODUCTOS` de `Code.gs`.

## 3. Llenar el mapa con restaurantes y cafés de Google Maps

Hace falta una clave de **Google Places API** (puedes usar la misma del proyecto de Mamachita):

1. <https://console.cloud.google.com/> → proyecto con facturación activa → **Places API (New)** habilitada.
2. **Credenciales → Clave de API**, restringida a *Places API (New)*.
3. En Apps Script: **⚙️ Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar**
   - Propiedad: `GOOGLE_PLACES_KEY` · Valor: tu clave.

Luego, en la hoja, menú **🥐 Quisito**:
- **Llenar con las colonias top de GDL y Zapopan**: recorre Providencia, Americana, Chapultepec, Chapalita, Andares, Puerta de Hierro…
  (la lista está en `COLONIAS_OBJETIVO` de `Code.gs`; edítala a tu gusto). Si se corta por tiempo, vuelve a correrlo.
- **Buscar en una colonia o municipio nuevo…**: escribe el lugar y agrega lo que haya en 1.5 km.
- **Buscar restaurantes y cafés en Google (por zona)**: vuelve a revisar todas las colonias que ya tienes en la hoja.
- **Quitar cadenas y lugares que no nos interesan**: limpia lo que se haya colado (te enseña la lista antes de borrar).
- **Actualizar pestaña COLONIAS**: resumen por colonia, estado y tipo, con gráficas.
- En el mapa: el botón **🔍** busca en la zona que estés viendo.

Cada búsqueda por colonia son ~6–18 consultas a Google; las 24 colonias top son unas 300 consultas (dentro del nivel gratuito).

## 4. Publicación (restaurantes.quisitofood.com)

Se publica con GitHub Pages; el archivo `CNAME` ya apunta al subdominio.

1. Sube esta carpeta como raíz de un repositorio (p. ej. `lalo2188/quisito-restaurantes`).
2. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** → Save.
3. En el DNS de `quisitofood.com`: registro **CNAME** `restaurantes` → `lalo2188.github.io`.
4. Cuando GitHub verifique el dominio, activa **Enforce HTTPS**.

## Identidad

Colores en `index.html` (`:root`): cacao `#5A3825`, mantequilla `#E8B04B`, crema `#FFF8EE`; títulos en Fraunces y texto en Nunito.
`logo.png`, `favicon.png`, `icon-192.png` e `icon-512.png` son un logo provisional (salen de `logo.svg`):
reemplázalos por el logo oficial de Quisito con los mismos nombres.
