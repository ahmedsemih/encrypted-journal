/** Lowercase without diacritics, with Turkish dotted/dotless i folded together. */
export function fold(s: string): string {
  return s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
}
