# Operación del portal

Qué hacer en el día a día y cuando algo falla. Para alguien que no programa; los pasos de configuración inicial están en `SETUP.md`. Todo se hace con la **cuenta propietaria** (`SETUP.md`, paso 1), de preferencia en una ventana de incógnito.

## 1. Lo que corre solo

| Qué                                                     | Cuándo                                           | Dónde se ve                                                                        |
| ------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Respaldo del libro completo (se guardan los últimos 30) | Cada noche, 3:00 (Cancún)                        | Drive → **Empírica Portal** → **Respaldos**: `EMPIRICA_PORTAL_DB respaldo <fecha>` |
| Limpieza de operaciones repetidas y de avisos viejos    | Cada noche, después del respaldo                 | Apps Script → **Ejecuciones** → `nightly`                                          |
| Bitácora del año anterior a su propio libro (D66)       | La noche del 1 de enero                          | **Respaldos**: `EMPIRICA_PORTAL_DB bitácora <año>`                                 |
| Aviso de que el reporte del mes está por preparar       | El día 1 de cada mes                             | La campana del abogado responsable (o de los socios)                               |
| Resumen diario por correo                               | Cada hora revisa si ya toca; una vez al día      | Apps Script → **Ejecuciones** → `dailyDigest`                                      |
| Calendarios de Google                                   | Cada 15 minutos                                  | Apps Script → **Ejecuciones** → `syncCalendars`                                    |
| Publicación del portal y del servidor                   | Al fusionar a `main`, si todas las pruebas pasan | GitHub → **Actions**                                                               |

Los **avisos de la campana** se borran solos: los leídos, a los 60 días; los nunca leídos, al año (D65). El cambio que los causó sigue en la bitácora.

Para ver las ejecuciones: abre el proyecto en <https://script.google.com> → menú de la izquierda → **Ejecuciones**. Una en rojo dice qué falló; la noche siguiente lo vuelve a intentar. **No edites ni guardes nada en el editor**: el código lo sube el CI, y guardar desde ahí lo revierte.

## 2. Respaldos y cómo restaurar

### Un error pequeño (lo más común)

Casi nunca hace falta un respaldo:

- **Algo borrado**: nada se borra de verdad. Asuntos, trámites y obligaciones tienen el filtro **Borrados** (o **Borradas**) en su lista: ábrelo y pulsa **Restaurar**. Un asunto regresa con sus tareas (D33).
- **Algo cambiado por error**: vuelve a escribir el valor en el portal. La pestaña `Bitacora` del libro dice quién cambió qué, cuándo, y el valor de antes (columnas `antes` y `despues`).

### Revisar un respaldo

Drive → **Empírica Portal** → **Respaldos** → abre la copia del día que te interesa. Es un libro igual al del portal: puedes consultarlo, filtrar y copiar datos. **No lo edites**: si lo necesitas para restaurar, se hace una copia (abajo).

### Restaurar el libro completo (solo si el libro se dañó o se borró)

Se pierde lo que se hizo después de la hora del respaldo. Avisa antes a los usuarios.

1. En **Respaldos**, clic derecho sobre la copia elegida → **Hacer una copia**. Mueve la copia a la carpeta **Empírica Portal** y nómbrala `EMPIRICA_PORTAL_DB`. Al libro dañado, si existe, cámbiale el nombre a `EMPIRICA_PORTAL_DB dañado <fecha>` y no lo borres.
2. Abre la copia y toma su ID de la dirección: lo que va entre `/d/` y `/edit`.
3. En Apps Script → ⚙ **Configuración del proyecto** → **Propiedades de la secuencia de comandos** → `SPREADSHEET_ID` → **Editar** → pega el ID nuevo → **Guardar**. No cambies `SEQ_RESERVED` ni `SEQ_COMMITTED`: deben seguir como están.
4. Corre `setup` (como en `SETUP.md`, paso 10): revisa pestañas, protecciones y triggers en el libro restaurado.
5. Para que cada dispositivo deje lo que tenía y baje el libro restaurado: en la pestaña `Clientes` del libro restaurado, suma 1 al número de la columna `membershipEpoch` de **cada** cliente (si está vacía, escribe 1). Google mostrará el aviso de que la hoja está protegida: acepta. Con eso, cada dispositivo borra y vuelve a descargar los datos de cada cliente en su siguiente sincronización. Quien quiera estar seguro puede además **cerrar sesión** sin conservar los datos y volver a entrar.
6. Revisa lo que quedó fuera del respaldo:
   - Archivos subidos después de la hora del respaldo: siguen en Drive (carpeta del cliente), pero su registro no; súbelos de nuevo desde el portal.
   - Citas y vencimientos creados después del respaldo pueden seguir en los calendarios de Google: bórralos ahí si ya no están en el portal.

Si el libro dañado aún abre, su pestaña `Bitacora` dice qué cambió entre el respaldo y el daño.

## 3. Publicar y regresar a la versión anterior

**Publicar** = fusionar el PR a `main`. El CI corre todas las pruebas (Chromium y Safari, accesibilidad y seguridad incluidas) y solo si pasan publica el portal en `portal.empirica.mx` y el servidor en Apps Script, en la misma dirección de siempre. Si algo falla, no se publica nada: sigue la versión anterior.

**Regresar a la versión anterior** (si algo publicado salió mal):

1. En GitHub → **Pull requests** → **Closed** → abre el PR que se publicó → botón **Revert** (abajo). GitHub crea un PR que deshace el cambio.
2. Fusiona ese PR. El CI vuelve a publicar la versión de antes (portal y servidor). Tarda lo mismo que una publicación normal (unos 10 minutos).

Regresar es seguro con los datos: una versión nueva solo agrega pestañas o columnas, nunca las borra, y la anterior ignora las que no conoce (D31).

**Solo en una emergencia** (GitHub no responde y el servidor publicado falla): Apps Script → **Implementar** → **Administrar implementaciones** → la implementación del portal → ✏ → **Versión**: elige la anterior → **Implementar**. No cambies la dirección ni crees una implementación nueva. La siguiente publicación del CI la vuelve a mover sola.

## 4. Rotar llaves

Rota una llave si se pegó por error en un chat o correo, si alguien con acceso deja el despacho, o una vez al año. Ninguna se manda por chat.

| Llave                                                           | Dónde vive                                   | Cómo se rota                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key de servidor de Firebase (`portal-servidor`)                 | Script Properties: `FIREBASE_SERVER_API_KEY` | Google Cloud → **Credenciales** → **Crear credenciales → Clave de API**, con las mismas restricciones (`SETUP.md`, paso 3) → pégala en la propiedad → comprueba que el portal entra → borra la key vieja                                                                            |
| Key de Gemini                                                   | Script Properties: `GEMINI_API_KEY`          | <https://aistudio.google.com/apikey> → **Crear clave de API** en el proyecto `empirica-portal` → restríngela a **Generative Language API** (`SETUP.md`, paso 12.3) → pégala en la propiedad → corre `setup` como en `SETUP.md`, paso 6.6 (dice si la key funciona) → borra la vieja |
| Key del navegador (Firebase)                                    | Variable de GitHub `FIREBASE_WEB_API_KEY`    | Google Cloud → crea una key con las restricciones de la **Browser key** (`SETUP.md`, paso 3) → actualiza la variable → en GitHub → **Actions**, vuelve a correr la última ejecución de `main` (**Re-run all jobs**) → cuando el portal entre con la nueva, borra la vieja           |
| Credencial de publicación (clasp)                               | Secreto de GitHub `CLASPRC_JSON`             | Revoca "clasp" en <https://myaccount.google.com/permissions> → repite `SETUP.md`, paso 8 (puntos 1 a 8 y 10)                                                                                                                                                                        |
| Contraseña y verificación en dos pasos de la cuenta propietaria | La cuenta                                    | <https://myaccount.google.com/security>. Guarda los códigos de respaldo fuera del correo de esa cuenta: sin ellos, perder el teléfono puede dejar el portal sin dueño                                                                                                               |

Los **enlaces personales de calendario** y las **invitaciones** no son llaves del sistema: cada persona desactiva su enlace en **Agenda → Tu calendario** (**Desactivar mi enlace**), y una invitación pendiente se cancela en **Usuarios**, en su lista de invitaciones (**Cancelar**).

## 5. Cuotas (cuenta gratuita)

Detalle y fuentes en `LIMITES.md`. Lo que conviene vigilar:

| Cuota                                      | Tope                             | Qué hace el portal                                                                                    |
| ------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Correos                                    | 100 destinatarios al día         | Guarda 10 de reserva y avisa a los socios en la campana cuando quedan menos de 20 (D51)               |
| Consultas a la IA                          | `Config.limiteDiarioIA` (1,000)  | Avisa al 80 %; si Google dice que se acabaron, espera a mañana (medianoche de California) (D61)       |
| Lecturas y escrituras de Script Properties | 50,000 al día                    | Cada petición lee una vez; con 40 usuarios activos son unas 20,000                                    |
| Tiempo de triggers de Apps Script          | 90 minutos al día                | Los trabajos nocturnos y de calendarios son cortos; el archivo anual va por tandas de 3 minutos (D66) |
| Celdas del libro                           | 20 millones                      | La bitácora pasa cada año a su propio libro; las demás pestañas crecen poco                           |
| Versiones de Apps Script                   | 200                              | El CI avisa desde la 180 (`SETUP.md`, paso 8, cómo borrar viejas)                                     |
| Peso de la primera carga del portal        | 260 KB comprimidos (tope propio) | El CI falla si se pasa (`npm run size`, D67)                                                          |

## 6. Si algo falla

| Lo que se ve                                                               | Qué revisar                                                                                                                                                                                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una persona ve **Sin conexión**                                            | Su red. Lo que capture se guarda en su dispositivo y se envía solo al volver la conexión                                                                                                                         |
| Todos ven **No se pudo conectar** o el portal no carga datos               | GitHub → **Actions**: ¿la última publicación del servidor salió bien? Apps Script → **Ejecuciones**: ¿hay errores de `doPost`? Si empezó tras una publicación, regresa a la versión anterior (§ 3)               |
| El portal no abre o queda en blanco                                        | ¿La última publicación del portal salió bien? Pide a quien lo ve un reporte desde **Sugerencias o errores** (incluye lo que el navegador bloqueó). Si empezó tras una publicación, regresa a la versión anterior |
| Alguien no puede entrar con Google                                         | Que entre con correo y contraseña; en la app instalada en iPhone el portal lo propone solo. Si no tiene contraseña: en un navegador, menú de su cuenta → **Crear una contraseña** (D70)                          |
| Nadie puede entrar con Google, o Google dice `redirect_uri_mismatch`       | Si existe la variable `FIREBASE_AUTH_DOMAIN` (D78), revisa la dirección autorizada en Google Cloud (`SETUP.md`, paso 13.2). Si no se arregla pronto, bórrala y vuelve a publicar: todo regresa a como estaba     |
| El CI se detuvo en un paso del inicio de sesión de Google                  | Firebase no respondió o `FIREBASE_AUTH_DOMAIN` no es el dominio del portal: el mensaje dice cuál. Vuelve a ejecutar el job; si sigue, borra la variable, publica (`SETUP.md`, paso 13) y avísame                 |
| "Solicita acceso a tu abogado de Empírica"                                 | La persona no está en **Usuarios** o está inactiva: invítala o actívala                                                                                                                                          |
| Un cambio aparece como **No se guardó**                                    | El panel de sincronización dice por qué (casi siempre, un permiso: el servidor deshace lo que el rol no permite)                                                                                                 |
| No llegan correos                                                          | Spam; la campana de los socios (cuota de correo); `setup` dice si faltan permisos de correo (`SETUP.md`, paso 11)                                                                                                |
| La IA dice "Se acabaron por hoy las consultas"                             | Vuelve después de la medianoche de California (2:00 o 3:00 en Cancún). Si AI Studio muestra un tope mayor, sube `Config.limiteDiarioIA`                                                                          |
| Falta el respaldo de una noche                                             | Apps Script → **Ejecuciones** → `nightly`. La noche siguiente se intenta otra vez                                                                                                                                |
| El 2 de enero no está `EMPIRICA_PORTAL_DB bitácora <año>` en **Respaldos** | Apps Script → **Ejecuciones** → `nightly`. Si la noche se acabó a medias, la siguiente termina sin repetir entradas                                                                                              |
| El CI falla en **Subir el código** con `invalid_grant`                     | Google ya no acepta la credencial de publicación (se quitó «clasp» de la cuenta propietaria o cambió su seguridad): repite `SETUP.md`, paso 8 (puntos 1 a 8 y 10), y vuelve a ejecutar el job                    |
| El CI está en rojo                                                         | No se publica nada y sigue la versión anterior. Avísame con el enlace de la ejecución                                                                                                                            |

Cuando reportes algo, manda lo que viste y, si puedes, una captura o el reporte de **Sugerencias o errores**: el reporte lleva la versión, la pantalla, el navegador y los últimos errores, nunca datos de clientes.
