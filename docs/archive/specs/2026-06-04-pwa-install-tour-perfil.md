# Especificación: Instalar PWA desde el tour y el menú de perfil

## User Story
Como usuario de Caja Chica en el celular, quiero poder instalar la app (PWA) desde la última
tarjeta del tour de bienvenida y desde el menú del perfil, con una explicación clara y un solo
toque, para tenerla como app en mi pantalla de inicio sin depender de pasos manuales del navegador.

## Asunciones Acordadas
1. Persona no-técnica en celular; primera vez (tour) o ya usando la app (menú perfil). El copy
   explica en criollo qué es ("tenela como app, entrás más rápido"), sin la sigla "PWA".
2. La opción de instalar va en la ÚLTIMA tarjeta del tour, con copy del beneficio + dos botones:
   "Terminar tour" e "Instalar app".
3. Si la app ya corre instalada (standalone) o la plataforma no permite instalar, la tarjeta del
   tour oculta la opción de instalar y muestra solo "Terminar tour".
4. Tocar "Instalar app" en el menú del avatar abre una tarjeta de confirmación que explica qué va
   a pasar, con botones "Instalar app" y "Cancelar" (no instala directo).
5. Android/Chrome/Edge: al confirmar, se dispara el diálogo nativo del navegador; si acepta, se
   crea el ícono automáticamente. Un toque.
6. iPhone/iPad (Safari): como iOS no permite instalación automática, "Instalar app" muestra el
   instructivo (Compartir → "Agregar a inicio"). El copy aclara que en iPhone es manual.
7. "Cancelar" / "Terminar tour" cierra sin instalar y no insiste en ese momento.
8. Una vez instalada (standalone), la opción "Instalar app" desaparece del menú del perfil.
9. El banner flotante de instalación existente sigue funcionando como está (no se toca).
10. Éxito: usuario nuevo en Android instala en 2 toques desde el tour; en iOS entiende cómo hacerlo
    sin frustrarse.

## Criterios de Aceptación
- AC1: La última tarjeta del tour muestra copy del beneficio + botones "Terminar tour" e
  "Instalar app" cuando la app NO está instalada y la instalación es posible (Android con prompt
  disponible, o iOS).
- AC2: En la última tarjeta del tour, si la app ya está instalada (standalone) o no hay forma de
  instalar, solo se muestra "Terminar tour" (sin botón de instalar).
- AC3: En Android/Chrome/Edge, tocar "Instalar app" (tour o confirmación del menú) dispara el
  diálogo nativo; al aceptar, la app queda instalada con su ícono.
- AC4: En iOS, tocar "Instalar app" abre el instructivo manual (Compartir → Agregar a inicio); el
  copy aclara que en iPhone el paso es manual.
- AC5: En el menú del avatar, "Instalar app" NO instala directo: abre una tarjeta de confirmación
  con explicación + botones "Instalar app" y "Cancelar".
- AC6: "Cancelar" cierra la confirmación sin instalar; "Terminar tour" cierra el tour sin instalar.
- AC7: Cuando la app corre instalada (standalone), la opción "Instalar app" no aparece en el menú
  del perfil.
- AC8: El banner flotante de instalación preexistente sigue comportándose igual.

## Fuera de Alcance
- Instalación 100% automática en iOS (imposible por política de Apple — solo instructivo).
- Cambios al banner flotante de instalación existente.
- Detección/forzado de navegadores que no soportan PWA más allá de ocultar la opción.
- Métricas/analytics del evento de instalación.

## Escenarios BDD

### Escenario 1: Instalar desde el tour en Android (happy path)
- **Dado que** un usuario nuevo en Android (con prompt de instalación disponible) llega a la última
  tarjeta del tour, app no instalada
- **Cuando** toca "Instalar app"
- **Entonces** se dispara el diálogo nativo del navegador y, al aceptar, la app se instala con su
  ícono y el tour se cierra

### Escenario 2: Instalar desde el tour en iPhone
- **Dado que** un usuario nuevo en iPhone llega a la última tarjeta del tour
- **Cuando** toca "Instalar app"
- **Entonces** se muestra el instructivo (Compartir → "Agregar a inicio") con copy aclarando que en
  iPhone es manual

### Escenario 3: Tarjeta del tour con app ya instalada (edge)
- **Dado que** el usuario ya tiene la app instalada (corre en modo standalone) y se reabre el tour
- **Cuando** llega a la última tarjeta
- **Entonces** solo ve "Terminar tour", sin botón "Instalar app"

### Escenario 4: Confirmación desde el menú del perfil (Android)
- **Dado que** un usuario en Android con la app no instalada abre el menú del avatar
- **Cuando** toca "Instalar app"
- **Entonces** se abre una tarjeta de confirmación que explica qué va a pasar, con botones
  "Instalar app" y "Cancelar" — todavía no se instaló nada

### Escenario 5: Confirmar instalación desde el menú
- **Dado que** la tarjeta de confirmación del menú está abierta en Android
- **Cuando** el usuario toca "Instalar app"
- **Entonces** se dispara el diálogo nativo del navegador para instalar

### Escenario 6: Cancelar desde el menú
- **Dado que** la tarjeta de confirmación del menú está abierta
- **Cuando** el usuario toca "Cancelar"
- **Entonces** la tarjeta se cierra sin instalar nada y la app sigue igual

### Escenario 7: Opción ausente cuando ya está instalada (acceso/estado)
- **Dado que** la app corre instalada (standalone)
- **Cuando** el usuario abre el menú del avatar
- **Entonces** la opción "Instalar app" no aparece

### Escenario 8: Terminar tour sin instalar
- **Dado que** el usuario está en la última tarjeta del tour
- **Cuando** toca "Terminar tour"
- **Entonces** el tour se cierra sin instalar y no vuelve a ofrecer la instalación en ese momento
