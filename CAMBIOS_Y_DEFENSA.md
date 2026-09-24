# Cambios y preparación para la defensa

## Idea de la adaptación

El inicio responde tres preguntas: qué lotes están secos, qué válvulas están abiertas y dónde faltan datos. El detalle agrupa estado, tendencia, umbrales y riego. El color siempre va acompañado de texto. Se simplificaron los nombres de navegación y se separó la confirmación de una orden de su resultado real.

## Decisiones que podés explicar

### 1. El teléfono no habla con Kafka

El celular inicia sesión y consulta Supabase con una clave pública y el token del usuario. Las políticas RLS deciden qué filas puede leer y qué acciones puede ejecutar. Kafka queda en el backend, donde la conectividad, el consumo de eventos y los reintentos se controlan sin depender de la vida de una pantalla móvil.

Flujo de lecturas: simulador → topic `soil.moisture` → consumidor → Postgres → Realtime → app. La consulta periódica cada 2,5 segundos sirve de respaldo si se corta Realtime.

### 2. Confirmar una solicitud no es aplicar el riego

La app crea un identificador UUID para la intención del usuario y llama a `request_irrigation`. La respuesta significa que el backend registró la solicitud. El worker la procesa después. La interfaz conserva los estados pendiente, aplicado, fallido y cancelado.

Una solicitud repetida con el mismo UUID y contenido devuelve la orden original. La misma UUID con otros parámetros se rechaza. El índice único parcial bloquea dos órdenes pendientes sobre la misma válvula. Son dos problemas distintos: reintento de una misma intención y competencia entre intenciones diferentes.

### 3. La válvula y la orden cambian juntas

`apply_irrigation` bloquea la fila de la orden. Si sigue pendiente, cambia la válvula y el comando dentro de una sola transacción. Si cualquiera de esas escrituras falla, ninguna queda confirmada. Dos workers que intenten aplicar la misma orden se serializan por el bloqueo y el segundo observa el estado final.

La cancelación también actualiza la fila: si gana antes que la aplicación, el worker no la ejecuta. Si el worker gana primero, cancelar devuelve falso. El resultado no se decide solamente deshabilitando un botón.

### 4. El vencimiento vive en Postgres

Al abrir por un tiempo se guarda `closes_at`. El worker consulta vencimientos. Si se reinicia, recupera las válvulas que ya debían cerrarse. El cierre depende de que el worker vuelva a estar activo; esta demo no representa un mecanismo físico de seguridad.

### 5. Un sensor sin datos no equivale a suelo seco

Primero se comprueba si falta lectura o supera 15 minutos. Solo con datos recientes se comparan los umbrales. La app actualiza el reloj para que el lote pueda pasar a gris aunque no lleguen nuevos ticks.

### 6. Los permisos se comprueban en el servidor

La interfaz explica el rol, pero eso no es la protección. Las funciones SQL comprueban la membresía, las consultas usan RLS y los usuarios no pueden escribir directamente estados de comandos. Solo el backend posee la clave privada y puede aplicar riego.

### 7. La simulación muestra una consecuencia observable

Con la válvula abierta la humedad sube progresivamente; cerrada, baja lentamente. La variación es didáctica y está acelerada para una defensa. No representa un modelo agronómico real ni recomienda dosis de riego.

## Recorrido sugerido de 3–5 minutos

1. Ingresar como productor y elegir Concordia. Mostrar el resumen y ubicar Costa 2 en el mapa.
2. Abrir el lote: humedad inferior al umbral, última lectura y gráfico de seis horas.
3. Elegir un minuto, revisar la confirmación y enviar. Mostrar pendiente y luego aplicado.
4. Observar el aumento de humedad y el cierre programado. La semilla inicia Costa 2 cerca de 18%; con ticks normales debería cruzar 25% aproximadamente durante ese minuto. No prometer un segundo exacto: depende del arranque y la red.
5. Mostrar Monte A gris y explicar la precedencia de stale.
6. Cerrar sesión e ingresar como asesor: controles deshabilitados; explicar que SQL también rechaza la operación.
7. Mostrar usuario externo: solo ve Escuela Rural. El productor sí puede cambiar entre ambos establecimientos.
8. Para RF-16, usar dos sesiones del productor y enviar órdenes distintas a la misma válvula antes de su aplicación. La segunda se rechaza. La prueba automatizada verifica además el índice y el comportamiento de la función.

## Cómo comparar con la base recibida

| Antes | Ahora | Motivo |
|---|---|---|
| Primer establecimiento fijo | Selector con elección guardada por usuario | RF-03 |
| Duración guardada sin cierre | Vencimiento persistente y cierre al vencer | Dar significado real al riego temporizado |
| Dos escrituras independientes | Transacción SQL | No confirmar una válvula que no cambió |
| Humedad fija con ruido | Responde a válvula abierta | Mostrar el efecto del riego simulado |
| Últimas 20 lecturas | Ventana de 6 h con muestreo de 5 min | Mostrar tendencia, no solo los últimos segundos |
| Prueba de formato UUID | Repetición real de RPC en PostgreSQL | Verificar idempotencia |
| Panel oscuro y textos técnicos | Inicio con prioridades y lenguaje simple | Lectura rápida en teléfono |

## Entrega pendiente

Este documento sirve para estudiar y preparar el informe. El informe final de 4–8 páginas y sus capturas deben cerrarse después de probar tu Supabase y el dispositivo elegido. No uses capturas de la vista previa como evidencia de integración real. Consultá `VALIDACION.md` para distinguir qué ya se verificó y qué falta.
