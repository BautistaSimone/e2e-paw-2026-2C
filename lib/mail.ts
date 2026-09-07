/**
 * Cliente de la casilla falsa: lo unico que los tests saben de mails.
 *
 * La app manda los mails por un `ThreadPoolTaskExecutor` (`MailConfig`), asi
 * que llegan *despues* de que el request contesto. Por eso todo lo de aca es
 * `waitFor` con polling y nunca un sleep fijo: los sleeps fijos son de donde
 * salen los tests que fallan uno de cada diez.
 */
import { mailpitUrl } from './config';

export interface MailAddress {
  Name: string;
  Address: string;
}

/** Mail como lo lista Mailpit (sin cuerpo). */
export interface MailSummary {
  ID: string;
  From: MailAddress | null;
  To: MailAddress[];
  Subject: string;
  Snippet: string;
  Created: string;
}

/** Mail completo, con cuerpo. */
export interface Mail extends MailSummary {
  Text: string;
  HTML: string;
}

/** Criterios de busqueda. Todos opcionales y todos se combinan con AND. */
export interface MailQuery {
  to?: string;
  subject?: string | RegExp;
  contains?: string | RegExp;
}

export interface WaitOptions {
  /** Cuanto esperar antes de fallar. El envio es async pero local: 10s sobra. */
  timeout?: number;
  interval?: number;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${mailpitUrl}/api/v1${path}`, init);
  if (!response.ok) {
    throw new Error(`Mailpit contesto ${response.status} en ${path}. ¿Esta corriendo?`);
  }
  return (await response.json()) as T;
}

/** Vacia la casilla. Se llama antes de cada test para que no haya cruces. */
export async function deleteAllMail(): Promise<void> {
  const response = await fetch(`${mailpitUrl}/api/v1/messages`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`No pude vaciar la casilla: HTTP ${response.status}`);
  }
}

export async function listMail(limit = 200): Promise<MailSummary[]> {
  const { messages } = await api<{ messages: MailSummary[] }>(`/messages?limit=${limit}`);
  return messages;
}

export async function readMail(id: string): Promise<Mail> {
  return api<Mail>(`/message/${id}`);
}

const matches = (value: string, expected: string | RegExp | undefined): boolean => {
  if (expected === undefined) return true;
  return typeof expected === 'string'
    ? value.toLowerCase().includes(expected.toLowerCase())
    : expected.test(value);
};

function isMatch(mail: MailSummary, query: MailQuery): boolean {
  const recipients = mail.To.map((address) => address.Address.toLowerCase());
  if (query.to && !recipients.includes(query.to.toLowerCase())) return false;
  if (!matches(mail.Subject, query.subject)) return false;
  return true;
}

/**
 * Espera a que llegue un mail que cumpla el criterio y lo devuelve con cuerpo.
 * Si no llega, el error dice que se pidio y que hay en la casilla, que es la
 * mitad del debugging.
 */
export async function waitForMail(query: MailQuery, options: WaitOptions = {}): Promise<Mail> {
  const { timeout = 10_000, interval = 200 } = options;
  const deadline = Date.now() + timeout;
  let seen: MailSummary[] = [];

  while (Date.now() < deadline) {
    seen = await listMail();
    for (const summary of seen) {
      if (!isMatch(summary, query)) continue;
      const mail = await readMail(summary.ID);
      if (matches(`${mail.Text}\n${mail.HTML}`, query.contains)) return mail;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  const inbox = seen.length
    ? seen.map((mail) => `  - "${mail.Subject}" -> ${mail.To.map((t) => t.Address).join(', ')}`).join('\n')
    : '  (casilla vacia)';
  throw new Error(
    `No llego ningun mail que cumpla ${JSON.stringify(query)} en ${timeout}ms.\nEn la casilla hay:\n${inbox}`,
  );
}

/** Cuantos mails hay para un destinatario. Util para afirmar que NO se mando nada. */
export async function countMailTo(address: string): Promise<number> {
  const messages = await listMail();
  return messages.filter((mail) => isMatch(mail, { to: address })).length;
}

/** Todos los links del cuerpo HTML, para verificar a donde lleva un mail. */
export function linksIn(mail: Mail): string[] {
  const matchesFound = mail.HTML.matchAll(/href="([^"]+)"/gi);
  return [...matchesFound].map((match) => match[1]!.replace(/&amp;/g, '&'));
}
