/**
 * El torneo como dato: crearlo, editarlo, publicarlo, cancelarlo.
 * Espejo de MyTournamentsController#create y de la parte de datos de
 * TournamentManagementController.
 *
 * Cada funcion recibe el `APIRequestContext` de quien hace la accion y nunca
 * lo crea: el dueño del torneo es el usuario autenticado en ese contexto.
 */
import type { APIRequestContext } from '@playwright/test';

import { submit, submitMultipart, type MultipartData, type UploadedFile } from './client';

export type TournamentFormat = 'LEAGUE' | 'SINGLE_ELIMINATION' | 'GROUP_STAGE';
export type PlayersPerSide = 'FIVE' | 'SEVEN' | 'ELEVEN';

export interface NewTournament {
  name: string;
  format?: TournamentFormat;
  maxTeams?: number;
  playersPerSide?: PlayersPerSide;
  /** ISO yyyy-MM-dd. Por defecto dentro de un mes: el form exige futuro. */
  startsAt?: string;
  location?: string;
  /**
   * Cancha con la que nacen todos los partidos del calendario tentativo.
   * Solo hay tres y el form las valida con un `@Pattern("[123]")`.
   */
  defaultVenue?: string;
}

/** Las unicas canchas que acepta la app (`CompetitionService.VENUES`). */
export const VENUES = ['1', '2', '3'] as const;

/**
 * Cuando arranca un torneo de la suite si nadie dice otra cosa.
 *
 * Importa para agendar: la app no deja poner un partido **antes del inicio del
 * torneo**, asi que toda fecha de agenda se cuenta a partir de aca y no desde
 * hoy.
 */
export const DEFAULT_START_IN_DAYS = 30;

export const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** `/mis-torneos/torneos`, no `/adminPanel/torneos`: la ruta se movio. */
export async function createTournament(
  request: APIRequestContext,
  tournament: NewTournament,
): Promise<void> {
  await submit(request, '/mis-torneos/torneos', {
    name: tournament.name,
    format: tournament.format ?? 'LEAGUE',
    maxTeams: tournament.maxTeams ?? 8,
    playersPerSide: tournament.playersPerSide ?? 'FIVE',
    startsAt: tournament.startsAt ?? inDays(DEFAULT_START_IN_DAYS),
    location: tournament.location ?? 'Cancha de prueba',
    defaultVenue: tournament.defaultVenue ?? VENUES[0],
  });
}

export const managementPath = (id: number): string => `/torneos/${id}/gestion`;
export const detailPath = (id: number): string => `/torneos/${id}`;

export interface TournamentData {
  name: string;
  description?: string;
  rules?: string;
  startsAt?: string;
  location?: string;
  defaultVenue?: string;
  cover?: UploadedFile;
}

/**
 * Guarda los datos del torneo. Va como multipart porque la portada y el resto
 * de los campos se guardan en un solo submit (`UpdateTournamentForm`).
 */
export async function updateTournament(
  request: APIRequestContext,
  id: number,
  data: TournamentData,
): Promise<void> {
  const form: MultipartData = {
    name: data.name,
    description: data.description ?? '',
    rules: data.rules ?? '',
    startsAt: data.startsAt ?? inDays(DEFAULT_START_IN_DAYS),
    location: data.location ?? '',
    defaultVenue: data.defaultVenue ?? VENUES[0],
  };
  if (data.cover) form['coverImage'] = data.cover;
  await submitMultipart(request, `${managementPath(id)}/datos`, form);
}

export async function publish(request: APIRequestContext, id: number): Promise<void> {
  await submit(request, `${managementPath(id)}/publicar`);
}

export async function cancel(
  request: APIRequestContext,
  id: number,
  reason: string,
): Promise<void> {
  await submit(request, `${managementPath(id)}/cancelar`, { reason });
}

/**
 * Arma el calendario tentativo de un torneo que se creo antes de que existiera.
 * Los nuevos ya nacen con el suyo.
 */
export async function planCalendar(request: APIRequestContext, id: number): Promise<string> {
  return submit(request, `${managementPath(id)}/calendario`);
}
