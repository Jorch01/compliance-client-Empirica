# Arranque de un cliente piloto

Cómo dar de alta a un cliente en el portal, de la primera pantalla al primer reporte. La hace un socio administrador (`SOCIO_ADMIN`) desde `https://portal.empirica.mx`; nada de esto se hace en la hoja. Los nombres de los pilotos no se escriben en el repositorio: esta guía sirve para cualquiera.

## Antes del primer cliente (una vez)

- Las verificaciones de seguridad de `SETUP.md`, paso 12, hechas (o al menos la 1, la 3 y la 4).
- El portal abre y entras con tu cuenta. Los demás socios y abogados del despacho, invitados (**Usuarios** → **Invitar**, del lado **Despacho**).

## 1. El cliente

**Clientes** → **Nuevo cliente**:

- **Razón social** y **Nombre comercial** (el que verá todo el portal), **RFC**.
- **Servicio**: _Fractional Legal Team (iguala)_ o _Asunto puntual_.
- **Abogado responsable**: recibe los avisos del cliente (evidencias, solicitudes, conflictos, el reporte del mes).
- **Inicio del servicio**, **Idioma del cliente** (el de sus correos y su reporte) y **Ayudas de IA** (como el despacho, encendidas o apagadas; `IA.md`).

Después, en la ficha del cliente:

- **Equipo del despacho** → **Asignar a alguien del despacho**: quiénes del despacho ven a este cliente. Un abogado solo ve a los clientes donde está asignado.
- **Unidades y sucursales** → **Agregar unidad**, si el cliente tiene unidades de negocio o sucursales (**Pertenece a** dice de quién depende cada una). Sin unidades, todo es del cliente en general.
- **Lo que cubre la iguala**: un encargo por línea, en **Incluye** y **No incluye**. El cliente lo ve tal cual, y sirve para clasificar sus solicitudes.

## 2. Las personas del cliente

En la ficha del cliente → **Invitar usuario** (o **Usuarios** → **Invitar**, del lado **Cliente**):

- **Nombre**, **Correo electrónico**, **Puesto** e **Idioma de sus correos**.
- **Rol**: **Administrador** (ve lo compartido e invita a otros de su empresa, con tu aprobación), **Colaborador** (igual, sin invitar) o **Solo lectura**. Detalle en `PERMISOS.md`.
- **Alcance**: **Toda la empresa** o **Solo estas unidades** (cada unidad incluye sus sucursales). Quien ve solo una unidad no ve los reportes mensuales, que son de toda la empresa.

**Crear invitación** muestra el enlace: **Enviar por correo** o **Copiar enlace** para mandarlo tú. Vence en la fecha que se muestra y solo funciona con ese correo. La persona entra con Google o crea su contraseña con ese correo, confirma su correo y ya ve su parte del portal. Las invitaciones que haga un administrador del cliente quedan **Por aprobar** hasta que las apruebes en **Usuarios**.

## 3. Lo que se carga al principio

Empieza por lo que el cliente necesita ver la primera semana:

1. **Asuntos** abiertos (**Asuntos** → **Nuevo asunto**) y, dentro de cada uno, sus **tareas** (**Nueva tarea**). Lo que marques como interno nunca llega al cliente.
2. **Compliance**: sus obligaciones (**Nueva obligación**), con su periodicidad. El **Catálogo de obligaciones** ayuda a darlas de alta; lo que se agregue al catálogo nace como «BORRADOR: validar» y un abogado lo revisa antes de usarlo: el portal no inventa fundamentos, plazos ni fechas.
3. **Trámites** en curso (**Nuevo trámite**, desde una plantilla si la hay), con su etapa actual.
4. **Contratos** con sus fechas clave: el último día para avisar y el fin de la vigencia.
5. **Documentos** que el cliente debe tener a mano, junto al asunto, la tarea o el trámite al que pertenecen.

No hace falta cargar todo el primer día: el cliente ve lo que ya está y lo demás aparece en cuanto se agrega.

## 4. La primera semana con el cliente

- Mándales el enlace del portal y pídeles que lo **instalen** en el teléfono: el recorrido del primer ingreso lo propone, y **Ayuda** tiene los pasos de cada sistema.
- Qué verán: en su inicio, **Pendientes de su lado** (lo que espera algo de ellos), el semáforo de compliance y sus solicitudes; en la campana, los avisos; cada mañana, el resumen por correo (lo pueden apagar en **Avisos**). Su **enlace personal de calendario** (**Agenda** → **Tu calendario**) les pone los vencimientos en Google, Apple u Outlook.
- Si algo no funciona o tienen una idea: **Sugerencias o errores**, en el menú de su cuenta. Te llega a ti.
- El aviso de privacidad está en la portada (`/privacidad/`).

## 5. Cada mes

- El día 1, el abogado responsable recibe el aviso de que el reporte del mes anterior está por preparar: **Reportes** → **Preparar** → revisar la vista previa y el resumen (puede redactarlo con IA y corregirlo) → **Enviar al cliente**. Lo reciben, en PDF, quienes ven toda la empresa; enviado, queda congelado.
- El **Centro de control** muestra el índice de salud de cada cliente; el cliente ve el suyo en su inicio y en el reporte.
