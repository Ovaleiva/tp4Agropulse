# Crear y conectar Supabase

Estos pasos son para un proyecto nuevo propio, dedicado al TP. No uses la cuenta ni las claves del proyecto de tu compañero.

## 1. Crear el proyecto

1. Entrá a https://supabase.com/dashboard e iniciá sesión o creá tu cuenta.
2. Elegí **New project**, seleccioná tu organización y poné un nombre, por ejemplo `agropulse-tp4`.
3. Definí la contraseña de la base y guardala. No es la contraseña para entrar en AgroPulse.
4. Elegí una región cercana y esperá que el proyecto termine de aprovisionarse. Revisá el plan y sus condiciones antes de aceptarlo.

## 2. Crear tablas y funciones

**Opción rápida (recomendada):** en **SQL Editor** → **New query**, pegá el contenido completo de `supabase/setup_completo.sql` y presioná **Run**. Tiene todo en una sola transacción: si algo falla, no queda nada a medias. Tiene que terminar con *Success. No rows returned*.

**Opción por partes:** ejecutá en este orden, una consulta por archivo:

1. `supabase/migrations/01_initial_schema.sql`
2. `supabase/migrations/02_reliable_irrigation.sql`
3. `supabase/migrations/03_api_grants.sql`
4. `supabase/seed.sql`
5. `supabase/seed_demo_extra.sql`

La primera migración crea tablas y publicación Realtime. La segunda restringe permisos y agrega las operaciones de riego. La tercera da permisos explícitos a la API (algunos proyectos nuevos no los dan solos; RLS sigue filtrando las filas). Las semillas crean los lotes; todavía no crean usuarios. Ejecutar todo una sola vez: el esquema no está diseñado para repetirse.

Si ya ejecutaste la migración inicial en tu propio proyecto, no la vuelvas a ejecutar: continuá con la siguiente. No ejecutes estos scripts en un proyecto ajeno o productivo.

Para comprobar: **Table Editor** debe mostrar `plots` con Costa 1, Costa 2 y Monte A.

## 3. Configurar los dos archivos de entorno

Buscá la **Project URL** y las **API keys** en el panel del proyecto (Connect / configuración de API según la versión del dashboard).

### Archivo de la app: `apps/agropulse/.env`

Copiá `apps/agropulse/.env.example` y completá:

```env
EXPO_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
EXPO_PUBLIC_VISUAL_PREVIEW=false
```

La clave pública puede ser `publishable` o la `anon` heredada. El nombre de la variable conserva `ANON_KEY` por compatibilidad con la base.

### Archivo del backend: `.env` en la raíz

Copiá `.env.example` y completá URL, clave privada y contraseña de los usuarios de prueba. `SUPABASE_SERVICE_ROLE_KEY` admite la clave de backend `service_role` o `secret`.

Definí `TEST_USER_PASSWORD` con al menos 12 caracteres. Esa será la contraseña inicial de los cuatro usuarios creados por el script. La clave privada va solamente en este archivo raíz; nunca en la app ni con prefijo `EXPO_PUBLIC_`.

Los `.env` están excluidos de Git. No los incluyas al compartir la entrega.

## 4. Crear usuarios y membresías

Desde la raíz:

```powershell
cd infra/worker
npm ci
npm run setup-users
cd ../..
```

El script crea y confirma correos ficticios de prueba, sin enviar emails:

| Correo | Rol | Establecimientos |
|---|---|---|
| productor@agropulse.test | Productor | Concordia y Escuela Rural |
| operador@agropulse.test | Operador | Concordia |
| asesor@agropulse.test | Asesor | Concordia |
| externo@agropulse.test | Productor | Escuela Rural |

Si el usuario ya existe, conserva su contraseña; no la cambia. Solo asegura las membresías didácticas indicadas.

## 5. Levantar los servicios

Abrí Docker Desktop y esperá a que esté listo. Desde la raíz:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
docker compose --env-file .env -f infra/docker-compose.yml logs -f worker simulator
```

Deben aparecer `produced`, `consumed / upsert reading` y, al regar, el resultado del comando. Monte A está deshabilitado por defecto para demostrar un sensor sin datos. Para activarlo, vaciá `DISABLED_STATIONS` en `.env` y recreá los servicios con el mismo comando `up`.

Para demostrar un fallo de válvula, poné `COMMAND_FAILURE_RATE=1`, recreá el worker y emití una orden. Después restaurá `0`. Ese fallo es simulado; no se presenta como un fallo de red.

## 6. Arrancar la app

```powershell
cd apps/agropulse
npm ci
npx expo start --clear
```

Si el celular no conecta por la red local (Wi-Fi distinta, firewall o red de la facultad), usá `npm run tunnel`: expone Metro por un túnel y funciona desde cualquier red.

Usá un dispositivo/emulador compatible con Expo SDK 57. Si Expo Go instalado usa otro SDK, seguí la indicación de Expo para esa versión o un development build; no cambies paquetes individuales al azar. Para revisar la interfaz en navegador, presioná `w`.

Ingresá con `productor@agropulse.test` y la contraseña que configuraste. Elegí Concordia, abrí Costa 2 y regá un minuto. Confirmá que el comando pase a aplicado, la humedad suba y la válvula cierre al vencer.

## Si algo falla

- **No se encuentran funciones RPC:** faltó ejecutar la migración 02.
- **`permission denied for table ...`:** faltó ejecutar `03_api_grants.sql`.
- **No aparecen lotes:** verificá semillas y ejecución de `setup-users`.
- **Login inválido:** comprobá la contraseña local y si el usuario ya existía con otra.
- **Sigue la vista previa:** quitá `EXPO_PUBLIC_VISUAL_PREVIEW=true` y reiniciá Expo.
- **Comando pendiente:** revisá el worker, su clave privada y los logs.
- **Docker no responde:** iniciá Docker Desktop; si no existe `docker compose`, revisá su instalación.
- **GPS denegado:** la app sigue funcionando; se muestra ubicación no disponible.

Fuentes oficiales consultadas: [Supabase con Expo](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native), [creación administrativa de usuarios](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [usuarios y claves de backend](https://supabase.com/docs/guides/auth/users).
