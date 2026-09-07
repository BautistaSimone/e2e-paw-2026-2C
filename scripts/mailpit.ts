/** Arranca el SMTP falso suelto y deja abierta la bandeja. */
import { mailpitUrl, ports } from '../lib/config';
import { startMailpit } from '../lib/mailpit';

const state = await startMailpit();
console.log(
  state === 'started'
    ? `Mailpit arrancado. SMTP en :${ports.smtp}, bandeja en ${mailpitUrl}`
    : `Mailpit ya estaba corriendo en ${mailpitUrl}`,
);
