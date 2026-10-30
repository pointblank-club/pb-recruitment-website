import { Base64 } from 'js-base64';

export const encodeBase64 = (value: string): string => Base64.encode(value);

export const decodeBase64 = (value: string): string => {
  try {
    return Base64.decode(value);
  } catch {
    return value;
  }
};
