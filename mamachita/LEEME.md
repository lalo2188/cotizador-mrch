# 🌶️ Mamachita · Mapa de territorio

Mapa de las tiendas de la hoja **"Mamachita - Prospectos tiendas Guadalajara y Zapopan"**, con:

- **Pines por estado**: gris = prospecto, dorado = visitada, verde = con producto, naranja = reestock pronto, rojo (late) = reestock vencido, gris oscuro = no interesada.
- **Territorio conquistado** 🚩: un círculo rojo alrededor de cada tienda con producto, porcentaje por zona y niveles ("Antojito" → "Mamachita suprema").
- **Entregas**: frascos por sabor (Tradicional, Pistache/Morita), precio, fecha de reestock, cuántos quedaban, valor dejado y vendidos estimados.
- **Rutas**: "Ruta de reestock" o "Prospectos cerca de mí", ordenadas por cercanía, que se abren en Google Maps.

La app lee la hoja en vivo: cada fila nueva que agregues en `Prospectos` aparece en el mapa al recargar.

---

## 1. Lo mínimo (ya funciona)

Con la hoja compartida como **"Cualquier persona con el enlace: lector"**, el mapa la lee directo.
Las tiendas sin coordenadas se ubican con OpenStreetMap (aproximado, se guarda en tu navegador).

## 2. Conectar el Apps Script (recomendado, 5 min)

Con esto: coordenadas exactas de Google escritas en la hoja, registrar entregas y cambiar estados desde el mapa, y **un correo diario a las 8am** con las tiendas por reestockear.

1. Abre la hoja → **Extensiones → Apps Script**.
2. Borra lo que haya y pega todo el contenido de [`apps-script/Code.gs`](apps-script/Code.gs).
   - Si quieres clave para guardar, escríbela en `const PIN = '...'`.
3. Guarda (💾), elige la función **`configurar`** arriba y dale **Ejecutar**. Acepta los permisos.
   - Esto agrega las columnas `Estado`, `Lat`, `Lng`, crea la pestaña `Entregas` y saca las coordenadas de las 121 tiendas.
4. **Implementar → Nueva implementación → Tipo: Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - Copia la URL que termina en `/exec`.
5. Pega esa URL en [`config.js`](config.js) → `SCRIPT_URL: 'https://script.google.com/macros/s/.../exec'`.

Desde ahí, cuando escribas una tienda nueva en la hoja, sus coordenadas se llenan solas.

### Columnas

**Prospectos** (las que ya tienes + 3 nuevas): `Prioridad · Zona · Tipo · Nombre · Ubicación · Visitado · Maps · Notas · Estado · Lat · Lng`

- `Estado`: Prospecto, Visitado, Interesado, Activa, No interesado.

**Entregas** (una fila por visita en la que dejas producto):
`Fecha · Tienda · Tradicional · Pistache/Morita · Precio · Reestock · Quedaban · Notas`

- `Tienda` debe escribirse igual que en `Prospectos`.
- `Reestock` vacío = Fecha + 14 días (se cambia en `config.js` → `DIAS_REESTOCK`).
- `Quedaban` = frascos sin vender que encontraste al llegar; con eso se calculan los vendidos.

Para agregar otro sabor: agrega la columna en `Entregas` y una línea en `SABORES` de `config.js`.

## 3. Publicarlo en mamachita.quisitofood.com

GitHub Pages solo permite **un dominio por repositorio**, y este repo ya usa `cotizador.lalocortes.com`.
Mientras tanto vive en `https://cotizador.lalocortes.com/mamachita/`.

Para el subdominio propio:

1. Crea un repo nuevo (p. ej. `mamachita`) y copia el contenido de esta carpeta a su raíz.
2. Agrega un archivo `CNAME` con: `mamachita.quisitofood.com`
3. En el repo: **Settings → Pages → Deploy from branch → main / root**.
4. En el DNS de `quisitofood.com`: registro **CNAME** `mamachita` → `lalo2188.github.io`
   (no lleva puerto; GitHub Pages sirve en 80/443 y da HTTPS gratis).
