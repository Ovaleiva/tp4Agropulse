# AgroPulse · Panel de control de campo

Demo educativa de React Native para el TP4. Sensores, válvulas, humedad y coordenadas semilla son ficticios. Adaptación de la base provista por un compañero: se conserva su licencia y se reemplazan las pantallas y el procesamiento de riego descritos en `CAMBIOS_Y_DEFENSA.md`.

## Qué cambió

- Interfaz crema y verde oscuro: inicio con resumen, mapa, alertas, cuenta y detalle de lote.
- Selector de establecimiento y permisos de productor, operador y asesor.
- Confirmación de riego, historial de 20 órdenes y errores visibles.
- RPC transaccional para aplicar órdenes; cierre programado persistido en Postgres.
- Simulador y consumidor separados en Compose. La humedad aumenta durante el riego.
- Pruebas que ejecutan las funciones SQL y las políticas RLS, además de la lógica de la app.

## Empezar

Leé **[GUIA_SUPABASE.md](GUIA_SUPABASE.md)** para crear tu proyecto, configurar los dos archivos de entorno y cargar los usuarios.

Requisitos: Node.js 22 LTS, Docker Desktop con Compose y Android o iOS para verificar el mapa nativo. La base recibida usa Expo SDK 57; se mantuvo esa versión. Confirmá con la cátedra que corresponde al curso.

En la raíz del proyecto:

```powershell
npm ci
npm test
cd apps/agropulse
npm ci
npm test
npx tsc --noEmit
npm run lint
npx expo start
```

### Vista previa sin Supabase

En `apps/agropulse/.env`:

```env
EXPO_PUBLIC_VISUAL_PREVIEW=true
```

Ejecutar `npm run web` dentro de la app. Muestra lotes y gráficos de ejemplo y deshabilita órdenes. Solo existe en desarrollo (`__DEV__`); no prueba Auth, RLS ni Realtime. Para usar el backend, quitar la variable o ponerla en `false`, completar URL/clave pública y reiniciar Expo.

### Backend configurado

Desde la raíz, después de cargar las migraciones, semillas y usuarios:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
docker compose --env-file .env -f infra/docker-compose.yml logs -f worker simulator
```

No hay fallback que saltee Kafka. Un fallo del broker se muestra en los logs. Los eventos van a `soil.moisture`; las órdenes se consultan en Postgres (el topic de comandos es opcional en el PRD).

## Estructura

- `apps/agropulse`: aplicación Expo + TypeScript estricto + Expo Router.
- `supabase/migrations`: esquema inicial y mejora transaccional; ejecutar en orden.
- `supabase/seed.sql`, `supabase/seed_demo_extra.sql`: dos establecimientos y series de seis horas.
- `infra/worker`: simulador, consumidor, procesamiento de órdenes y creación de usuarios.
- `tests/backend.test.cjs`: PostgreSQL embebido para verificar SQL sin una cuenta de Supabase.
- `CAMBIOS_Y_DEFENSA.md`: decisiones y recorrido para la defensa.
- `VALIDACION.md`: resultados, límites y pruebas pendientes.

## Contrato de riego

`request_irrigation` verifica el rol y crea una orden pendiente. Repetir la misma solicitud y el mismo contenido devuelve la misma orden; reutilizar el identificador con otro contenido se rechaza. Una válvula admite una sola orden pendiente.

El worker llama a `apply_irrigation`: cambia la válvula y el resultado en una transacción. Si la orden ya se aplicó, falló o canceló, no vuelve a ejecutarse. `closes_at` persiste el vencimiento; `close_due_valves` cierra las vencidas al recuperar el worker. Mientras el worker esté apagado no se simula un cierre físico: se ejecuta cuando vuelve.

## Datos de prueba

`setup-users.js` crea productor, operador, asesor y usuario externo con la contraseña que vos definas localmente. El productor pertenece a ambos establecimientos; el externo solo al segundo. No se distribuyen contraseñas fijas ni claves privadas.

## Límites

Pendiente validar en tu Supabase y un dispositivo real: persistencia al cerrar la app, GPS, latencia menor a tres segundos y flujo completo con Kafka/Realtime. La vista web del mapa es un plano esquemático; el mapa geográfico se usa en Android/iOS. Offline con cola persistente queda fuera de esta iteración (Should del PRD).
