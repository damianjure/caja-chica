# Especificación: Onboarding del bot + control del recordatorio desde Telegram

## User Story
Como usuario del bot de Telegram de Caja Chica (no-técnico, rioplatense, uso desde el celu),
quiero (a) recibir una bienvenida personalizada con mi nombre y ejemplos coloquiales de cómo
usar cada función cuando entro por primera vez, y (b) poder ver, cambiar y desactivar mi
recordatorio diario (encendido/apagado y horario) desde el propio bot —por botones o por voz—,
para entender qué puedo hacer sin preguntar y manejar el recordatorio sin entrar al dashboard.

## Asunciones Acordadas
1. Persona: no-técnico, rioplatense, celu, lenguaje coloquial, cero jerga.
2. Onboarding: la bienvenida personalizada con nombre + ejemplos aparece solo la primera vez
   que la persona vincula/entra al bot (en `/start` al crear el vínculo). Después `/start` y
   `/menu` muestran el menú normal.
3. Nombre: se usa el `first_name` del perfil de Telegram. Si no hay nombre → "¡Bienvenido/a!".
4. Ejemplos: 4-5 por capacidad principal (texto, voz, foto de ticket, `/informes`,
   `/recurrente`), concretos y coloquiales. Incluye uno de asignar a empresa/personal:
   _"cobré 30.000 de un laburo, anotalo en personal"_.
5. Reabrir ayuda: comando `/ayuda` para volver a ver la guía coloquial en cualquier momento.
6. `/recordatorio` (ver): muestra estado actual — activado/desactivado, hora, y canal
   (Telegram/email).
7. `/recordatorio` (modificar): se puede activar/desactivar y cambiar la hora por botones inline
   y por voz. Sincroniza con los mismos campos que el dashboard (`notification_enabled`,
   `notification_telegram`, `notification_hour`, `notification_minute`).
8. Alcance: el recordatorio es por persona (cada usuario de Telegram cambia el suyo), no del
   dashboard entero.
9. Horario: botones rápidos (09 / 12 / 18 / 21) + opción de hora exacta. Minutos default 0.
   Zona horaria: UTC (como hoy).
10. Edge: si alguien usa `/recordatorio` sin estar vinculado, el bot explica cómo vincularse
    primero. Viewers también pueden configurar su propio recordatorio (es preferencia personal,
    no acción sobre datos).
11. Success: una persona nueva entiende qué puede hacer sin preguntar, y puede prender/apagar y
    mover su recordatorio sin entrar al dashboard.

## Criterios de Aceptación
- AC1: Al vincularse por primera vez, el bot envía un mensaje de bienvenida que arranca con
  "¡Bienvenido/a, {first_name}!" (o sin nombre si no hay) y describe en lenguaje coloquial qué
  puede hacer.
- AC2: La bienvenida lista 4-5 ejemplos por capacidad (texto, voz, foto, `/informes`,
  `/recurrente`), incluyendo al menos un ejemplo que asigne a personal/empresa.
- AC3: `/ayuda` reimprime esa misma guía en cualquier momento.
- AC4: `/recordatorio` muestra estado: on/off, hora (HH:MM UTC) y canal(es) activos.
- AC5: Desde `/recordatorio` con botones inline se puede: activar, desactivar, y fijar hora
  (rápidas 09/12/18/21 o exacta). El cambio persiste en `app_users.notification_*`.
- AC6: Un mensaje de voz con intención de recordatorio (ej. "apagá el recordatorio",
  "ponémelo a las 9 de la mañana") aplica el cambio y confirma por texto.
- AC7: El cambio hecho desde Telegram se refleja en el dashboard y viceversa (misma fuente).
- AC8: Sin vínculo activo, `/recordatorio` responde con instrucciones de cómo vincularse.

## Fuera de Alcance
- Apariencia Opción A (columna clara/oscura) → implementación directa, no parte de esta spec.
- Revisión final del bot → entrega de review separada.
- Recordatorios múltiples por día o por día de semana (solo uno diario, como hoy).
- Cambio de zona horaria por usuario (sigue UTC).
- Recordatorio a nivel dashboard/equipo (sigue siendo por persona).

## Escenarios BDD

### Escenario 1: Bienvenida personalizada en el primer vínculo (happy path)
- **Dado que** una persona con `first_name` "Caro" abre el bot y completa la vinculación por primera vez
- **Cuando** se crea su vínculo en `/start`
- **Entonces** el bot envía un mensaje que empieza con "¡Bienvenida, Caro!" y describe en tono
  coloquial qué puede hacer, con 4-5 ejemplos por capacidad (incluido "cobré 30.000 de un laburo,
  anotalo en personal")

### Escenario 2: Bienvenida sin nombre disponible
- **Dado que** una persona sin `first_name` en su perfil de Telegram se vincula por primera vez
- **Cuando** se crea su vínculo
- **Entonces** el bot envía la misma guía pero empezando con "¡Bienvenido/a!" sin nombre

### Escenario 3: Reabrir la guía con /ayuda
- **Dado que** una persona ya vinculada (no es su primer ingreso)
- **Cuando** envía `/ayuda`
- **Entonces** el bot reimprime la guía coloquial con los ejemplos

### Escenario 4: Ver estado del recordatorio
- **Dado que** una persona vinculada con recordatorio activo a las 21:00 por Telegram
- **Cuando** envía `/recordatorio`
- **Entonces** el bot muestra "Activado · 21:00 UTC · por Telegram" con botones para cambiar

### Escenario 5: Desactivar el recordatorio por botón
- **Dado que** una persona ve `/recordatorio` con estado activado
- **Cuando** toca el botón "Desactivar"
- **Entonces** `notification_enabled` pasa a false, el bot confirma "Listo, recordatorio
  desactivado", y el cambio se ve en el dashboard

### Escenario 6: Cambiar la hora por botón rápido
- **Dado que** una persona ve `/recordatorio`
- **Cuando** toca "09:00"
- **Entonces** `notification_hour=9`, `notification_minute=0`, el bot confirma "Te lo dejo a las
  09:00" y queda sincronizado

### Escenario 7: Modificar el recordatorio por voz
- **Dado que** una persona vinculada manda un audio diciendo "ponémelo a las nueve de la mañana"
- **Cuando** el bot transcribe y detecta intención de recordatorio
- **Entonces** fija la hora a 09:00, confirma por texto, y no lo confunde con carga de movimiento

### Escenario 8: Desactivar por voz
- **Dado que** una persona vinculada manda un audio "apagá el recordatorio"
- **Cuando** el bot transcribe y detecta la intención
- **Entonces** `notification_enabled=false` y confirma "Recordatorio apagado"

### Escenario 9: `/recordatorio` sin vínculo (edge / acceso)
- **Dado que** un chat de Telegram sin vínculo activo
- **Cuando** envía `/recordatorio`
- **Entonces** el bot responde explicando cómo vincularse primero, sin tocar nada

### Escenario 10: Viewer configura su propio recordatorio
- **Dado que** una persona con rol viewer está vinculada
- **Cuando** usa `/recordatorio` y cambia la hora
- **Entonces** el cambio se aplica (es preferencia personal), sin requerir permisos de escritura
  sobre datos
