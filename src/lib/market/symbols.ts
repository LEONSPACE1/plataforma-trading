// Tickers, indices (^GSPC), FX pairs (USDCOP=X), foreign listings (ECOPETROL.CL), futures (DX-Y.NYB).
const SYMBOL_RE = /^[A-Za-z0-9^=.\-]{1,20}$/;

export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol);
}

/** Parses a comma-separated symbol list, dropping blanks and duplicates. */
export function parseSymbolList(raw: string | null, max = 40): string[] | null {
  if (!raw) return null;
  const symbols = [...new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (symbols.length === 0 || symbols.length > max || !symbols.every(isValidSymbol)) return null;
  return symbols;
}
