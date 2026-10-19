import type { MarketGroup } from "./types";

export type CatalogEntry = { symbol: string; name: string };

/**
 * Starting lists for each market tab. Colombian symbols use Yahoo's `.CL`
 * suffix for the Bolsa de Valores de Colombia.
 */
export const CATALOG: Record<MarketGroup, { label: string; entries: CatalogEntry[] }> = {
  "us-stocks": {
    label: "Acciones EE. UU.",
    entries: [
      { symbol: "AAPL", name: "Apple" },
      { symbol: "MSFT", name: "Microsoft" },
      { symbol: "NVDA", name: "NVIDIA" },
      { symbol: "AMZN", name: "Amazon" },
      { symbol: "GOOGL", name: "Alphabet" },
      { symbol: "META", name: "Meta" },
      { symbol: "TSLA", name: "Tesla" },
      { symbol: "JPM", name: "JPMorgan Chase" },
    ],
  },
  "us-indices": {
    label: "Índices EE. UU.",
    entries: [
      { symbol: "^GSPC", name: "S&P 500" },
      { symbol: "^DJI", name: "Dow Jones" },
      { symbol: "^IXIC", name: "Nasdaq Composite" },
      { symbol: "^RUT", name: "Russell 2000" },
      { symbol: "^VIX", name: "VIX" },
      { symbol: "SPY", name: "SPDR S&P 500 ETF (en vivo)" },
      { symbol: "QQQ", name: "Invesco QQQ ETF (en vivo)" },
      { symbol: "DIA", name: "SPDR Dow Jones ETF (en vivo)" },
    ],
  },
  "co-stocks": {
    label: "Acciones Colombia",
    entries: [
      { symbol: "ECOPETROL.CL", name: "Ecopetrol" },
      { symbol: "PFBCOLOM.CL", name: "Bancolombia preferencial" },
      { symbol: "ISA.CL", name: "ISA" },
      { symbol: "GEB.CL", name: "Grupo Energía Bogotá" },
      { symbol: "CELSIA.CL", name: "Celsia" },
      { symbol: "GRUPOARGOS.CL", name: "Grupo Argos" },
      { symbol: "CEMARGOS.CL", name: "Cementos Argos" },
      { symbol: "PFAVAL.CL", name: "Grupo Aval preferencial" },
    ],
  },
  "co-indices": {
    label: "Índices Colombia",
    entries: [
      // Yahoo has no feed for the MSCI COLCAP index itself; this ETF tracks it.
      { symbol: "ICOLCAP.CL", name: "iShares MSCI COLCAP ETF (sigue al COLCAP)" },
      { symbol: "COLO", name: "Global X MSCI Colombia ETF (EE. UU.)" },
    ],
  },
  fx: {
    label: "Divisas",
    entries: [
      { symbol: "USDCOP=X", name: "Dólar / Peso colombiano" },
      { symbol: "EURCOP=X", name: "Euro / Peso colombiano" },
      { symbol: "EURUSD=X", name: "Euro / Dólar" },
      { symbol: "USDMXN=X", name: "Dólar / Peso mexicano" },
      { symbol: "USDJPY=X", name: "Dólar / Yen" },
      { symbol: "DX-Y.NYB", name: "Índice dólar (DXY)" },
    ],
  },
};

export const MARKET_GROUPS = Object.keys(CATALOG) as MarketGroup[];

export function catalogName(symbol: string): string | undefined {
  for (const group of MARKET_GROUPS) {
    const hit = CATALOG[group].entries.find((e) => e.symbol === symbol);
    if (hit) return hit.name;
  }
  return undefined;
}
