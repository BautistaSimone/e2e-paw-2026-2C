# Suite de E2E de Fuchibol

Tests de punta a punta con [Playwright](https://playwright.dev): abren un browser
real, se registran, completan los formularios como una persona y verifican el
resultado, incluidos los mails.

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
| `npm run seed -- inProgress --teams 6 --round 2` | Deja la base en un escenario y te da los links **y las credenciales** para entrar. |
| `npm run codegen` | Grabás un flujo clickeando y te escupe el código del test. |
| `npm run app` | Levanta la app de la suite sin correr tests. |
| `npm run inspect` | Dónde quedaron las tablas y en qué schema trabaja la suite. |
| `npm run db:rebuild` | Rehace el schema de la suite. **Correlo cuando entra una migración** (ver abajo). |
| `npm run db:clean-dev` | Vacía tu base de **desarrollo** conservando los usuarios. Pide `--yes`. |
| `npm run check:rules` | Verifica las cuatro reglas de abajo. |
| `npm run report` | Abre el último reporte HTML. |

`npm run seed` es el que más tiempo ahorra en el día a día: reemplaza los diez
minutos de cargar datos a mano antes de poder mirar una pantalla. Vale la pena
aunque no escribas un solo `expect`.

### Cuando entra una migración: `npm run db:rebuild`

`schema.sql` es todo `CREATE TABLE IF NOT EXISTS` — tiene que poder correrse de
nuevo — así que sobre un schema que ya existe **no agrega columnas nuevas**. Las
que entran entre sprints viven en `persistence/src/main/resources/migrations/` y
se aplican a mano contra la base de la cátedra.

El lugar de la suite es descartable, así que no replica esas migraciones: se
rehace de cero y queda igual al `schema.sql` de hoy. Si ves un
`column "..." does not exist` al correr los tests, es esto.

## Cómo está organizado

```
lib/paths.ts     rutas — TODO se deriva del repo en runtime, cero paths fijos
lib/config.ts    puertos, URLs y credenciales, pisables por env var
lib/actors.ts    los usuarios de la app: una sesión, dos caras (API y browser)
lib/api/         un módulo por recurso, espejo de los controllers (solo HTTP)
lib/ids.ts       los ids y el estado que la app no devuelve (solo lee SQL)
lib/mail.ts      la casilla falsa: esperar y leer mails
scenarios/       estados de negocio con nombre, compuestos sobre lib/api
pages/           un page object por JSP — único lugar con selectores
tests/           solo llaman escenarios y page objects
```

### Las cuatro reglas

`npm run check:rules` las verifica:

1. **Ningún path absoluto ni `process.cwd()` fuera de `lib/paths.ts`.** Es lo que
   hace que la suite ande igual en `C:\Users\quien-sea\` que en `~/facultad/`.
2. **Ningún puerto ni URL literal fuera de `lib/config.ts`.** Si tenés el 8081
   ocupado: `APP_PORT=8090 npm test`.
3. **Ningún selector fuera de `pages/`.** Cuando cambia un texto de
   `messages.properties` o un `id` de un `.tag`, se toca un archivo y no veinte
   tests.
4. **Ninguna espera fija.** Nada de `waitForTimeout` ni `setTimeout`: se espera la
   condición (`toBeVisible`, `waitForResponse`, `mail.waitForMail`). Los sleeps
   fijos son de donde salen los tests que fallan uno de cada diez.

Cuando aparezca una pantalla nueva se agrega **un** page object y, si trae
endpoints nuevos, **un** módulo en `lib/api`. Nada más.

## Usuarios: los actores

La app no trae ningún usuario sembrado y `POST /registro` exige estar anónimo,
así que cada test crea los suyos con emails únicos. Como registrarse ya deja
logueado, crear un usuario y loguearlo es una sola llamada:

```ts
const organizador = await actors.register('organizador');
const admin       = await actors.admin('admin');       // registro + rol ADMIN
const visitante   = await actors.anonymous();          // contexto sin sesión
```

**Un actor se autentica una sola vez.** `WebAuthConfig` configura
`.maximumSessions(1)`: si un test arma el escenario por API como Ana y después
abre el browser logueándose otra vez como Ana, el segundo login **expira el
primero** y el contexto de API queda muerto a mitad del test. Por eso el
`storageState` del contexto de API se le pasa al del browser:

```ts
const { management } = await pagesOf(organizador);   // misma cookie, misma sesión
```

El `page` que da Playwright es el del **visitante anónimo**: sirve para todo lo
público y para los tests de login.

## Los mails

La app manda todo a [Mailpit](https://mailpit.axllent.org/), un SMTP falso local
(`:1025`, bandeja web en <http://localhost:8025>). El binario lo baja el `setup`
según tu sistema operativo; nadie commitea un `.exe`.

Dos cosas a saber:

- `MailConfig.java` fija `mail.smtp.auth=true`, así que Mailpit se arranca con
  `--smtp-auth-accept-any --smtp-auth-allow-insecure` o JavaMail no conecta.
- El envío es **async** (`ThreadPoolTaskExecutor`), o sea que el mail llega
  después de que el request contestó. Por eso se usa `mail.waitForMail(...)` y
  nunca un sleep fijo (regla 4).

## Las trampas del front que hay que conocer

Están resueltas dentro de `pages/`, pero conviene saber que existen:

- **Botones que arrancan `disabled`.** Guardar datos, guardar agenda y guardar
  resultados son `data-dirty-submit`: se habilitan recién cuando un campo cambia
  **de verdad**. Ponerle el valor que ya tenía no alcanza.
- **`?resultado=` se borra de la URL** apenas renderiza (`history.replaceState`).
  Se afirma sobre el `.flash`, nunca sobre el query string.
- **Los tabs son client-side.** `?tab=` sólo elige el panel inicialmente visible.
- **Ids duplicados en `#partidos`.** La agenda y la planilla emiten las dos
  `matches0.matchId`: todo va scopeado a su form.
- **El `<select>` de cancha se repuebla por fetch** al cambiar día u hora.
- **Salir / dar de baja / cancelar** pasan por un diálogo de confirmación que
  intercepta el submit.
- **No hay un solo `data-testid`** en la app: los anclajes son ids, `name`s y
  `[data-tournament-status]`.

## Un bug conocido de la app

`tests/i18n.spec.ts` tiene un `test.fixme` que documenta esto: la app le contesta
en **inglés** a un browser que pide castellano, porque `messageSource` deja
`fallbackToSystemLocale` en `true`, el castellano vive en `messages.properties`
(sin sufijo) y no existe `messages_es.properties`. El idioma que ve el usuario
termina dependiendo del locale del **servidor**. Cuando se arregle, se le saca el
`.fixme` y el test tiene que pasar.
