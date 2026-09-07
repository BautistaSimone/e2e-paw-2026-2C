# Suite de E2E de Fuchibol

Tests de punta a punta con [Playwright](https://playwright.dev): abren un browser
real, completan los formularios como una persona y verifican el resultado,
incluidos los mails.

**Esto no lo pide la cátedra.** Es nuestro, y vive en un repo aparte a propósito:
el repo de la entrega no puede tener archivos de más. Se clona *adentro* de él,
en `e2e/`, y el `setup` agrega `e2e/` a `.git/info/exclude` (que es local y no se
commitea). El `.gitignore` del repo entregable no se toca.

## Empezar

```bash
git clone <este-repo> paw-2026b-04/e2e
cd paw-2026b-04/e2e
npm install
npx playwright install chromium
npm run setup
npm test
```

`npm run setup` es idempotente y no asume nada de tu máquina: genera su
configuración a partir de **tu** `.env` de desarrollo, así que respeta tu usuario
de Postgres, y si ese usuario no puede crear bases usa un schema aparte dentro de
la tuya. Tus datos de desarrollo nunca se tocan.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Corre la suite. Levanta Jetty y Mailpit solo si no están arriba. |
| `npm run test:ui` | Modo interactivo de Playwright: ver, filtrar y repetir tests. |
| `npm run seed -- inProgress --teams 6 --round 2` | Deja la base en un escenario y te da los links para mirarlo. |
| `npm run codegen` | Grabás un flujo clickeando y te escupe el código del test. |
| `npm run app` | Levanta la app de la suite sin correr tests. |
| `npm run inspect` | Dónde quedaron las tablas y en qué schema trabaja la suite. |
| `npm run check:rules` | Verifica las tres reglas de abajo. |
| `npm run report` | Abre el último reporte HTML. |

`npm run seed` es el que más tiempo ahorra en el día a día: reemplaza los diez
minutos de cargar datos a mano antes de poder mirar una pantalla. Vale la pena
aunque no escribas un solo `expect`.

## Cómo está organizado

```
lib/paths.ts     rutas — TODO se deriva del repo en runtime, cero paths fijos
lib/config.ts    puertos, URLs y credenciales, pisables por env var
lib/api/         un módulo por recurso, espejo de los controllers (solo HTTP)
lib/ids.ts       los ids que la app no devuelve en el redirect (solo lee SQL)
lib/mail.ts      la casilla falsa: esperar y leer mails
scenarios/       estados de negocio con nombre, compuestos sobre lib/api
pages/           un page object por JSP — único lugar con selectores
tests/           solo llaman escenarios y page objects
```

### Las tres reglas

`npm run check:rules` las verifica:

1. **Ningún path absoluto ni `process.cwd()` fuera de `lib/paths.ts`.** Es lo que
   hace que la suite ande igual en `C:\Users\quien-sea\` que en `~/facultad/`.
2. **Ningún puerto ni URL literal fuera de `lib/config.ts`.** Si tenés el 8081
   ocupado: `APP_PORT=8090 npm test`.
3. **Ningún selector fuera de `pages/`.** Cuando cambia un texto de
   `messages.properties` o un `id` de un `.tag`, se toca un archivo y no veinte
   tests.

Cuando aparezca una pantalla nueva se agrega **un** page object y, si trae
endpoints nuevos, **un** módulo en `lib/api`. Nada más.

## Los mails

La app manda todo a [Mailpit](https://mailpit.axllent.org/), un SMTP falso local
(`:1025`, bandeja web en <http://localhost:8025>). El binario lo baja el `setup`
según tu sistema operativo; nadie commitea un `.exe`.

Dos cosas a saber:

- `MailConfig.java` fija `mail.smtp.auth=true`, así que Mailpit se arranca con
  `--smtp-auth-accept-any --smtp-auth-allow-insecure` o JavaMail no conecta.
- El envío es **async** (`ThreadPoolTaskExecutor`), o sea que el mail llega
  después de que el request contestó. Por eso se usa `mail.waitForMail(...)` y
  nunca un sleep fijo: los sleeps fijos son de donde salen los tests que fallan
  uno de cada diez.

## Cuando llegue el login

Hoy `WebAuthConfig` es un scaffold (`permitAll`, `csrf` deshabilitado). Cuando se
active la seguridad hay que tocar dos lugares, no todos los tests:

- un `lib/api/auth.ts` con `as(user)` que devuelva un `APIRequestContext` logueado
  y lea el token CSRF del HTML. Los módulos de `lib/api` ya reciben el context
  como parámetro, así que **ninguna firma cambia**;
- `fixtures.ts`, para reusar la sesión del browser con `storageState`.
