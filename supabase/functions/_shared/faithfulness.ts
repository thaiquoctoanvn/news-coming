// Cheap, deterministic faithfulness checks (.agents/rules/content-integrity.md): numbers are the
// facts most often invented or altered by a model. Each number is compared as a whole, with its
// thousands/decimal separators removed, so it survives reformatting in translation
// ("$21.5M" → "21,5 triệu $" are both "215"; "848,250" → "848.250" are both "848250")
// while a garbled value is caught ("$4,105.63" is "410563", a wrong "$4,1051.63" is "4105163").

// Words the source may spell out but the output legitimately writes with digits
// ("September" → "tháng 9", "third quarter" → "quý 3", "two" → "2").
const WORD_NUMBERS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  half: 2, quarter: 4, dozen: 12, hundred: 100, thousand: 1000,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Numbers as digit strings: "4,105.63" → "410563", "0.6" → "06" → "6"; dates like "14/9" give "14", "9". */
function numbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, '').replace(/^0+(?=\d)/, ''));
}

function knownNumbers(source: string): Set<string> {
  const known = new Set(numbers(source));
  for (const word of source.toLowerCase().match(/[a-z]+/g) ?? []) {
    const value = WORD_NUMBERS[word];
    if (value !== undefined) known.add(String(value));
  }
  return known;
}

/** Numbers in `output` that never occur in `source` (empty when every number is supported). */
export function unsupportedNumbers(output: string, source: string): string[] {
  const known = knownNumbers(source);
  return [...new Set(numbers(output))].filter((n) => !known.has(n));
}
