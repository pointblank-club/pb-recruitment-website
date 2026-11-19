export const isSEBUserAgent = (value: string): boolean => /(?:^|[\s;(])SEB\/\d+(?:\.\d+)*(?:$|[\s;)])/i.test(value);
