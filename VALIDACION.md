# Validación de AgroPulse contra el PRD

Este documento separa **lo que ya se verificó con pruebas automáticas** de **lo que falta probar con Supabase real y un dispositivo**. No marcar como cumplido algo que solo se vio en la vista previa (`EXPO_PUBLIC_VISUAL_PREVIEW=true`).

Última revisión: 23/09/2026.

## Estados usados

| Estado | Significado |
|---|---|
| **OK** | Verificado por prueba automática o compilación |
| **Código listo** | Implementado; falta comprobarlo en Supabase + dispositivo (sección "Pruebas manuales") |
| **Parcial** | Implementado con una diferencia respecto del PRD (ver nota) |
| **No** | No implementado en esta iteración |

## 1. Verificaciones automáticas ejecutadas

Todas se ejecutaron sobre una copia limpia del proyecto (`npm ci`, Node 22).

| Verificación | Comando | Resultado |
|---|---|---|
| Backend: simulación | `npm test` (raíz) | 1/1 OK: el riego sube la humedad y respeta límites 0–65 % |
| Backend: SQL, RLS e idempotencia en PostgreSQL embebido | `npm test` (raíz) | 1/1 OK (ver detalle abajo) |
| App: semáforo y geocerca | `npm test` (apps/agropulse) | 2/2 OK |
| App: tipos (TypeScript strict) | `npx tsc --noEmit` | Sin errores |
| App: lint | `npx expo lint` | Sin advertencias |
| App: bundle web | `npx expo export --platform web` | Compila; login renderiza sin errores de consola |
| App: bundle Android | `npx expo export --platform android` | Compila |
| Worker: sintaxis | `node --check index.js` | OK |

**Qué cubre la prueba de PostgreSQL** (`tests/backend.test.cjs`):

- La misma `client_request_id` con el mismo contenido devuelve la misma orden; con otros datos se rechaza.
- Una segunda orden `pending` sobre la misma válvula se rechaza (RF-16).
- El usuario no puede escribir `status` de comandos ni llamar a `apply_irrigation`.
- El asesor no puede regar ni cambiar umbrales. El usuario externo solo ve su lote.
- Si falla la escritura del comando, la válvula no queda abierta (transacción).
- `closes_at` se guarda y `close_due_valves` cierra la válvula vencida.
- Cancelar antes del worker gana. `apply_irrigation` con fallo deja `failed` y la válvula cerrada.
- `reading_history` devuelve 12 puntos o más en 6 h.

**Límite:** PostgreSQL embebido no incluye Supabase Auth ni Realtime. Eso se valida manualmente.

## 2. Estado actual del entorno

- `apps/agropulse/.env` tiene solo `EXPO_PUBLIC_VISUAL_PREVIEW=true`. **La app corre en modo vista previa**, con datos de ejemplo y órdenes deshabilitadas.
- No existe todavía el `.env` de la raíz (backend). Falta crear el proyecto Supabase y cargar las claves según `GUIA_SUPABASE.md`.
- Ninguna prueba manual de la sección 7 está hecha todavía.
- `supabase/setup_completo.sql` (01 + 02 + 03 + semillas) se ejecutó completo en PostgreSQL embebido: productor ve 3 lotes, emite orden, cambia umbral; escritura directa de estado bloqueada; `service_role` aplica la orden.

## 3. Checklist de requisitos funcionales

### Autenticación y contexto

| ID | Pri | Estado | Evidencia / nota |
|---|---|---|---|
| RF-01 Login/logout, sesión persistente | Must | Código listo | `app/index.tsx`, sesión en AsyncStorage (`src/lib/supabase.ts`). Probar M1 y M2 |
| RF-02 Solo ve sus establecimientos | Must | OK + probar | RLS por `memberships`, cubierto en test. Probar M7 |
| RF-03 Selector de establecimiento | Must | Código listo | `OrganizationPicker`, elección guardada por usuario. Probar M7 |

### Lotes y mapa

| ID | Pri | Estado | Evidencia / nota |
|---|---|---|---|
| RF-04 Listar lotes con semáforo | Must | OK | Semilla con 3 lotes (Costa 1, Costa 2, Monte A); lista en Inicio y Mapa |
| RF-05 Mapa con polígonos y color | Must | Código listo | `react-native-maps` en Android/iOS; plano SVG en web. Tap abre detalle. Probar M3 |
| RF-06 "Estoy en el lote" | Must | OK + probar | Geocerca testeada; permiso denegado muestra "Ubicación no disponible". Probar M9 |
| RF-07 Alta/edición de lote | Should | No | Fuera de esta iteración |

### Sensores y lecturas

| ID | Pri | Estado | Evidencia / nota |
|---|---|---|---|
| RF-08 Estación con moisture_pct, temp_c, rain_mm | Must | OK | Esquema, semilla y `validTick` |
| RF-09 Última lectura y antigüedad; stale > 15 min | Must | OK | `formatReadingAge`, `calculatePlotStatus` (test) |
| RF-10 Gráfico 6 h, 12 puntos o más, se actualiza | Must | OK + probar | `reading_history` testeado; actualización por Realtime + polling 2,5 s. Probar M4 |
| RF-11 Umbral mínimo configurable | Must | OK + probar | UPDATE limitado a columnas de umbral y rol (test). Probar M5 |
| RF-12 Semáforo §8 | Must | OK | Precedencia stale > dry > optimal > wet (test) |

### Irrigación

| ID | Pri | Estado | Evidencia / nota |
|---|---|---|---|
| RF-13 Listar válvulas | Must | OK | 1 válvula o más por lote en la semilla |
| RF-14 Emitir comando open/close/duración 1–120 | Must | OK | `request_irrigation` crea `pending` (test) |
| RF-15 pending → applied/failed sin reiniciar | Must | OK + probar | Transición testeada; UI por Realtime/polling. Probar M4 y M8 |
| RF-16 Sin segundo pending en la misma válvula | Must | OK | Índice parcial + RPC (test). Probar M6 para el video |
| RF-17 Cancelar pending | Should | OK | `cancel_irrigation`; el worker no aplica cancelados (test) |
| RF-18 Historial de 20 comandos | Should | Código listo | Detalle de lote: fecha, usuario, resultado |

### Alertas y campo

| ID | Pri | Estado | Evidencia / nota |
|---|---|---|---|
| RF-19 Alerta humedad < umbral | Should | Parcial | Pestaña Alertas calculada en la app; no usa la tabla `alerts` |
| RF-20 Alerta stale, distinguible de seco | Should | Parcial | Misma pestaña, texto y color distintos |
| RF-21 Lectura manual offline | Should | No | Política RLS de insert manual existe; falta UI y cola |
| RF-22 Sugerencia de una regla | Could | OK | "Humedad bajo el umbral: considerar riego." |

### Observabilidad

| ID | Pri | Estado | Evidencia / nota |
|---|---|---|---|
| RF-23 Pantalla Diagnóstico | Must | Código listo | En Cuenta: usuario, establecimiento, último evento, antigüedad y lag aparente (sensor → app). Probar en M4 |
| RF-24 Logs del worker | Must | Código listo | `produced`, `consumed / upsert reading`, `[Commands]`. Probar M10 |

## 4. Requisitos no funcionales

| ID | Pri | Estado | Evidencia / nota |
|---|---|---|---|
| RNF-01 Expo SDK, TS strict, Expo Router | Must | OK | SDK 57, `strict: true`, tsc sin errores. Confirmar la versión de SDK con la cátedra |
| RNF-02 Sin service role en el binario | Must | OK | Ninguna referencia a la clave privada en `app/` ni `src/`; solo en el `.env` de la raíz |
| RNF-03 Mapa usable en < 3 s | Must | Código listo | Medir en M3 |
| RNF-04 Tick visible en ≤ 3 s | Must | Código listo | Medir en M4 con Diagnóstico |
| RNF-05 Errores sin spinner infinito | Must | Código listo | Timeout de 15 s, tarjeta "Reintentar conexión", mensajes en orden. Probar M8 |
| RNF-06 README reproducible | Must | OK | README + `GUIA_SUPABASE.md` + `.env.example` |
| RNF-07 Offline 30 s | Should | No | Sin cola persistente |
| RNF-08 Tests de semáforo e idempotencia | Should | OK | Ver sección 1 |
| RNF-09 UI en español, código en inglés | Could | OK | |
| RNF-10 Datos ficticios explícitos | Must | OK | Login, README y semilla lo aclaran |

## 5. Objetivos de aprendizaje

| OA | Estado | Evidencia |
|---|---|---|
| OA-1 Roles y aislamiento | OK | RLS + 4 usuarios de prueba |
| OA-2 Mapas y geometría | Código listo | Polígonos y semáforo |
| OA-3 Series temporales | OK | Gráfico 6 h |
| OA-4 Event-driven | Código listo | `soil.moisture` → consumer → Postgres → Realtime |
| OA-5 Comandos asíncronos | OK | pending → applied / failed / cancelled |
| OA-6 Degradación por red | Parcial | Reintento con la misma `client_request_id`; sin cola offline |
| OA-7 Móvil desacoplado del broker | OK | Sin dependencia de Kafka en `apps/agropulse/package.json` |

## 6. Diferencias con el PRD a mencionar en el informe

- **`weather.tick`** no se publica: el simulador manda `rain_mm = 0` dentro de `soil.moisture`. El PRD permite lluvia opcional (RF-08).
- **`irrigation.commands` por Kafka** no se usa: el worker consulta `pending` en Postgres. El PRD lo marca Should. El diagrama de secuencia del PRD lo muestra; explicar la simplificación.
- **Alertas** se calculan en la app y no se persisten en `alerts`.
- **Web** muestra un plano esquemático; el mapa geográfico es solo nativo.

## 7. Pruebas manuales pendientes

Hacerlas con Supabase configurado, Docker levantado y `EXPO_PUBLIC_VISUAL_PREVIEW=false`. Anotar resultado y captura.

| # | Qué probar | Cubre | Resultado esperado | Resultado | Captura |
|---|---|---|---|---|---|
| M1 | Login con contraseña incorrecta | RF-01 | Mensaje de error, sin spinner | | |
| M2 | Login correcto, cerrar la app por completo, reabrir | RF-01 | Sigue logueado | | |
| M3 | Productor → Concordia → Mapa (cronometrar) | RF-05, RNF-03 | Costa 1 verde, Costa 2 rojo, Monte A gris; carga en < 3 s | | |
| M4 | Costa 2 → regar 1 min (flujo H1) | RF-14/15, RNF-04 | pending → applied en ≤ 5 s; humedad sube; la válvula cierra al vencer | | |
| M5 | Cambiar umbral mínimo de Costa 1 a 35 % | RF-11 | Persiste y el color cambia | | |
| M6 | Dos sesiones de productor, orden distinta a la misma válvula | RF-16 | La segunda muestra "ya tiene una orden pendiente" | | |
| M7 | Login como asesor (H2) y como externo | RF-02/03, H2 | Asesor: controles deshabilitados. Externo: solo Escuela Rural | | |
| M8 | `COMMAND_FAILURE_RATE=1`, emitir orden | RF-15, RNF-05 | Estado "Falló" con `valve_timeout` | | |
| M9 | Mapa → Mi ubicación con permiso denegado | RF-06 | "Ubicación no disponible", sin crash | | |
| M10 | `docker compose logs -f worker simulator` | RF-24 | Se ven produced / consumed / Commands | | |
| M11 | Monte A apagado durante 15 min (H4) | RF-09, H4 | Gris "sin datos", no rojo | | |

Dispositivo usado: ____________ · Expo Go / build: ____________ · Fecha: ____________
