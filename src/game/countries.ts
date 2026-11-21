import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(en);

export function countryName(iso2: string): string {
  return countries.getName(iso2, 'en', { select: 'alias' }) ?? countries.getName(iso2, 'en') ?? iso2;
}

/** ISO 3166-1 numeric code as used by Natural Earth / world-atlas feature ids ("276"). */
export function numericCode(iso2: string): string | undefined {
  return countries.alpha2ToNumeric(iso2);
}

export function flag(iso2: string): string {
  return /^[A-Z]{2}$/.test(iso2) ? String.fromCodePoint(...[...iso2].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '';
}
