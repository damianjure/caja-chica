# Load test — sensor de escala

No es un test que se corre seguido. Es un **sensor**: te da "el número de hoy" para saber
cuándo te estás acercando al límite y toca atacar la lista diferida de escala (ver `SCALE.md`).

## Cómo correrlo

```bash
./loadtest/baseline.sh                       # contra prod
./loadtest/baseline.sh http://localhost:8080 # contra local (npm run dev:server)
DURATION=20 CONNECTIONS=30 ./loadtest/baseline.sh
```

Usa `npx autocannon` — no suma dependencia al proyecto.

## Baseline de hoy — 2026-05-30 (prod, rev caja-chica-00053-lc2, warm)

| Endpoint | p50 | p97.5 | p99 | Notas |
|----------|-----|-------|-----|-------|
| `GET /api/health` | 167 ms | 192 ms | 327 ms | latencia = RTT a us-west2 + fast-path |
| `GET /api/maintenance/status` | 167 ms | 193 ms | 354 ms | idem |

**Salvedad importante:** los endpoints públicos están **rate-limited por IP** (tier read/auth).
Con un solo cliente, autocannon agota el budget de IP en segundos → la mayoría de las respuestas
son 429. Por eso el **req/seg de acá NO mide la capacidad de la instancia**, mide el limiter.
El número útil es la **latencia warm** (≈167ms p50). Para medir capacidad real hay que pegarle a
endpoints autenticados con tokens variados (ver bloque comentado en `baseline.sh`) o subir el
límite en una corrida de staging.

## Gatillos (cuándo dejar de diferir — ver SCALE.md)

Volvé a correr esto y compará contra el baseline. Empezá la lista diferida cuando:

- **p99 de un endpoint autenticado > ~1 s sostenido** (hoy el piso warm es ~327ms en el trivial).
- **memoria de la instancia > 70% sostenida** (lo vigila la alerta de Cloud Run).
- **picos reales > ~40 conexiones concurrentes** (la instancia banca 80; a 40 ya conviene planear).

Si ninguno se cumple, no construyas nada de escala. El baseline de hoy dice: sobra margen para 50 usuarios.
