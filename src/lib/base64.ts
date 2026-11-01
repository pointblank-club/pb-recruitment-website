import { Base64 } from 'js-base64';

export const encodeBase64 = (value: string): string => Base64.encode(value);

export const decodeBase64 = (value: string): string =>
  Base64.isValid(value) ? Base64.decode(value) : value;
