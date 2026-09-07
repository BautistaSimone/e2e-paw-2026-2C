/**
 * Ciclo de vida del SMTP falso. Todo lo que depende del sistema operativo de
 * cada uno vive aca: que binario bajar y como arrancarlo.
 *
 * Los tests no importan este modulo: usan `lib/mail.ts`, que solo habla HTTP.
 */
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { mailpitUrl, ports } from './config';
import { toolsDir } from './paths';

/** Version fijada para que las 4 maquinas corran exactamente lo mismo. */
const MAILPIT_VERSION = process.env.MAILPIT_VERSION ?? 'v1.31.1';

/** Nombre del asset del release segun la plataforma de quien corre esto. */
function assetName(): string {
  const platform = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[
    process.platform as 'win32' | 'darwin' | 'linux'
  ];
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch as 'x64' | 'arm64'];
  if (!platform || !arch) {
    throw new Error(
      `Mailpit no publica binario para ${process.platform}/${process.arch}.\n` +
        `Instalalo a mano y apunta MAILPIT_BIN al ejecutable.`,
    );
  }
  const extension = platform === 'windows' ? 'zip' : 'tar.gz';
  return `mailpit-${platform}-${arch}.${extension}`;
}

export function mailpitBinary(): string {
  if (process.env.MAILPIT_BIN) return process.env.MAILPIT_BIN;
  return path.join(toolsDir, process.platform === 'win32' ? 'mailpit.exe' : 'mailpit');
}

/**
 * Baja y descomprime el binario si falta. Idempotente.
 *
 * La descompresion es lo unico que se bifurca por plataforma: en Windows el
 * asset es un .zip y el `tar` que suele ganar en el PATH es el de Git Bash
 * (GNU tar), que no abre zips y ademas interpreta "C:\..." como un host
 * remoto. Se usa Expand-Archive de PowerShell, que siempre esta. En Linux y
 * macOS alcanza con tar.
 */
export async function ensureMailpit(): Promise<string> {
  const binary = mailpitBinary();
  if (existsSync(binary)) return binary;

  const asset = assetName();
  const url = `https://github.com/axllent/mailpit/releases/download/${MAILPIT_VERSION}/${asset}`;
  mkdirSync(toolsDir, { recursive: true });
  const archive = path.join(toolsDir, asset);

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`No pude bajar Mailpit de ${url}: HTTP ${response.status}`);
  }
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));

  await extract(archive);
  rmSync(archive, { force: true });

  if (!existsSync(binary)) {
    throw new Error(`Descomprimi ${asset} pero no aparecio ${binary}.`);
  }
  if (process.platform !== 'win32') chmodSync(binary, 0o755);
  return binary;
}

async function extract(archive: string): Promise<void> {
  if (process.platform === 'win32') {
    await run('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${toolsDir}' -Force`,
    ]);
    return;
  }
  await run('tar', ['-xzf', archive, '-C', toolsDir]);
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} termino con codigo ${code}`)),
    );
  });
}

export async function isMailpitRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${mailpitUrl}/api/v1/info`, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Arranca Mailpit si no esta corriendo y espera a que conteste.
 *
 * Los flags de auth no son opcionales: `MailConfig` de la app fija
 * `mail.smtp.auth=true`, asi que JavaMail intenta autenticarse siempre. Sin
 * `--smtp-auth-accept-any` Mailpit no ofrece AUTH y el envio falla con
 * "No authentication mechanisms supported by both server and client".
 */
export async function startMailpit(): Promise<'already-running' | 'started'> {
  if (await isMailpitRunning()) return 'already-running';

  const binary = await ensureMailpit();
  const child = spawn(
    binary,
    [
      '--listen', `0.0.0.0:${ports.mailpit}`,
      '--smtp', `0.0.0.0:${ports.smtp}`,
      '--smtp-auth-accept-any',
      '--smtp-auth-allow-insecure',
      '--quiet',
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await isMailpitRunning()) return 'started';
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Mailpit no respondio en ${mailpitUrl} despues de 15s.`);
}
