/**
 * Archivos de prueba para los flujos que suben algo.
 *
 * `ImageService` valida el tipo por los magic bytes y no por el nombre ni por
 * el Content-Type, asi que un "png" falso no sirve: tiene que ser un PNG de
 * verdad. Este es el mas chico que existe, un pixel transparente.
 */
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export const pngFile = (name = 'portada.png'): TestFile => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(ONE_PIXEL_PNG, 'base64'),
});

/** Un archivo que dice ser PNG pero no lo es: el servidor tiene que rechazarlo. */
export const fakePngFile = (name = 'trucha.png'): TestFile => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from('esto no es una imagen', 'utf8'),
});
