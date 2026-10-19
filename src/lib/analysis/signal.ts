import type { Candle, Dividend, Fundamentals, Quote } from "../market/types";
import { bollinger, last, macd, rsi, sma, type Series } from "./indicators";

// Turns indicators and fundamentals into an explained buy / hold / sell signal.
// Every rule votes +1 (favorable), 0 (neutral) or -1 (unfavorable) and says why
// in plain Spanish. It is a teaching aid, not investment advice.

export type Verdict = "comprar" | "mantener" | "vender";
export type Vote = -1 | 0 | 1;

export type Factor = {
  group: "tecnico" | "fundamental";
  name: string;
  vote: Vote;
  detail: string;
};

export type TechnicalSnapshot = {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  /** Average volume of the last 5 sessions vs. the last 50; null without volume data. */
  volumeRatio: number | null;
};

export type FundamentalSnapshot = {
  pe: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  debtToEquity: number | null;
  /** Dividends paid over the last 12 months divided by the price. */
  dividendYield: number | null;
  reportCurrency: string | null;
  asOf: string | null;
};

export type Analysis = {
  symbol: string;
  price: number;
  currency?: string;
  /** Unix seconds of the last daily candle used. */
  asOf: number;
  verdict: Verdict;
  /** -100 (clear sell) to 100 (clear buy). */
  score: number;
  technicalScore: number;
  fundamentalScore: number | null;
  summary: string;
  factors: Factor[];
  notes: string[];
  technical: TechnicalSnapshot;
  fundamentals: FundamentalSnapshot | null;
};

export type AnalysisInput = {
  quote: Quote;
  candles: Candle[];
  dividends?: Dividend[];
  fundamentals?: Fundamentals | null;
};

const TECHNICAL_WEIGHT = 0.6;
const BUY_SCORE = 30;
const MIN_CANDLES = 35; // MACD needs 26 + 9 sessions before it says anything

const num = (v: number, digits = 2) => v.toLocaleString("es-CO", { maximumFractionDigits: digits });
const pct = (v: number) => `${num(v * 100, 1)} %`;

function crossedWithin(a: Series, b: Series, bars: number): "arriba" | "abajo" | null {
  const n = a.length;
  for (let i = n - 1; i >= Math.max(1, n - bars); i--) {
    const [a0, a1, b0, b1] = [a[i - 1], a[i], b[i - 1], b[i]];
    if (a0 == null || a1 == null || b0 == null || b1 == null) return null;
    if (a0 <= b0 && a1 > b1) return "arriba";
    if (a0 >= b0 && a1 < b1) return "abajo";
  }
  return null;
}

export function technicalFactors(candles: Candle[]): { factors: Factor[]; snapshot: TechnicalSnapshot } {
  const closes = candles.map((c) => c.close);
  const price = closes.at(-1)!;
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);

  const volumes = candles.map((c) => c.volume);
  const hasVolume = volumes.slice(-50).filter((v) => v > 0).length >= 40;
  const recentVol = sma(volumes, 5).at(-1) ?? null;
  const baseVol = sma(volumes, 50).at(-1) ?? null;
  const volumeRatio = hasVolume && recentVol != null && baseVol ? recentVol / baseVol : null;

  const snapshot: TechnicalSnapshot = {
    sma20: last(s20),
    sma50: last(s50),
    sma200: last(s200),
    rsi14: last(r),
    macd: last(m.macd),
    macdSignal: last(m.signal),
    macdHistogram: last(m.histogram),
    bollingerUpper: last(bb.upper),
    bollingerMiddle: last(bb.middle),
    bollingerLower: last(bb.lower),
    volumeRatio,
  };

  const factors: Factor[] = [];
  const add = (name: string, vote: Vote, detail: string) => factors.push({ group: "tecnico", name, vote, detail });

  const { sma50: m50, sma200: m200 } = snapshot;
  if (m200 != null) {
    const gap = price / m200 - 1;
    add(
      "Tendencia de largo plazo (media 200)",
      gap > 0 ? 1 : -1,
      `El precio está ${pct(Math.abs(gap))} ${gap > 0 ? "por encima" : "por debajo"} de su media de 200 sesiones: tendencia de fondo ${gap > 0 ? "alcista" : "bajista"}.`,
    );
  }
  if (m50 != null && m200 != null) {
    const cross = crossedWithin(s50, s200, 20);
    const up = m50 > m200;
    add(
      "Cruce de medias 50/200",
      up ? 1 : -1,
      (up ? "La media de 50 está sobre la de 200 (cruce dorado)" : "La media de 50 está bajo la de 200 (cruce de la muerte)") +
        (cross ? `, y el cruce ocurrió en las últimas 20 sesiones.` : "."),
    );
  }
  if (m50 != null) {
    const gap = price / m50 - 1;
    add(
      "Tendencia de medio plazo (media 50)",
      gap > 0 ? 1 : -1,
      `El precio está ${pct(Math.abs(gap))} ${gap > 0 ? "por encima" : "por debajo"} de su media de 50 sesiones.`,
    );
  }
  if (snapshot.rsi14 != null) {
    const v = snapshot.rsi14;
    if (v < 30) add("RSI (14)", 1, `RSI en ${num(v, 1)}: zona de sobreventa, el precio ha caído mucho y suele rebotar.`);
    else if (v > 70) add("RSI (14)", -1, `RSI en ${num(v, 1)}: zona de sobrecompra, el impulso puede agotarse.`);
    else add("RSI (14)", 0, `RSI en ${num(v, 1)}: zona neutral (entre 30 y 70), impulso ${v >= 50 ? "ligeramente comprador" : "ligeramente vendedor"}.`);
  }
  if (snapshot.macdHistogram != null) {
    const up = snapshot.macdHistogram > 0;
    const cross = crossedWithin(m.macd, m.signal, 5);
    add(
      "MACD (12, 26, 9)",
      up ? 1 : -1,
      `La línea MACD está ${up ? "por encima" : "por debajo"} de su señal: impulso ${up ? "alcista" : "bajista"}` +
        (cross ? `; cruzó hacia ${cross} en las últimas 5 sesiones.` : "."),
    );
  }
  const { bollingerUpper: up, bollingerLower: lo } = snapshot;
  if (up != null && lo != null) {
    if (price < lo) add("Bandas de Bollinger (20, 2)", 1, "El precio cerró bajo la banda inferior: está estirado a la baja y suele volver hacia la media.");
    else if (price > up) add("Bandas de Bollinger (20, 2)", -1, "El precio cerró sobre la banda superior: está estirado al alza y suele volver hacia la media.");
    else {
      const position = up > lo ? (price - lo) / (up - lo) : 0.5;
      add("Bandas de Bollinger (20, 2)", 0, `El precio está dentro de las bandas, al ${num(position * 100, 0)} % del recorrido entre la inferior y la superior.`);
    }
  }
  if (volumeRatio != null && closes.length > 5) {
    const change = price / closes[closes.length - 6] - 1;
    const strong = volumeRatio >= 1.2;
    const vote: Vote = strong ? (change > 0 ? 1 : -1) : 0;
    add(
      "Volumen",
      vote,
      `El volumen de los últimos 5 días es ${num(volumeRatio, 2)} veces el promedio de 50 días, con el precio ${change >= 0 ? "subiendo" : "bajando"} ${pct(Math.abs(change))}` +
        (strong ? `: hay convicción detrás del movimiento.` : ": sin volumen suficiente para confirmar el movimiento."),
    );
  }
  return { factors, snapshot };
}

export function fundamentalFactors(
  quote: Quote,
  dividends: Dividend[],
  f: Fundamentals | null | undefined,
): { factors: Factor[]; snapshot: FundamentalSnapshot | null; notes: string[] } {
  const factors: Factor[] = [];
  const notes: string[] = [];
  const add = (name: string, vote: Vote, detail: string) => factors.push({ group: "fundamental", name, vote, detail });

  const yearAgo = quote.time - 365 * 86_400;
  const paid = dividends.filter((d) => d.time >= yearAgo).reduce((s, d) => s + d.amount, 0);
  const dividendYield = paid > 0 && quote.price > 0 ? paid / quote.price : null;

  const hasReports = f != null && (f.revenue != null || f.eps != null || f.equity != null);
  if (!hasReports && dividendYield == null) return { factors, snapshot: null, notes };

  const ratio = (a?: number, b?: number) => (a != null && b ? a / b : null);
  // EPS comes in the reporting currency; comparing it with a price in another
  // currency (an ADR in USD reporting in COP) would give a meaningless P/E.
  const sameCurrency = !f?.currency || !quote.currency || f.currency === quote.currency;
  const pe = f?.eps != null && f.eps > 0 && sameCurrency ? quote.price / f.eps : null;
  const snapshot: FundamentalSnapshot = {
    pe,
    grossMargin: ratio(f?.grossProfit, f?.revenue),
    operatingMargin: ratio(f?.operatingIncome, f?.revenue),
    netMargin: ratio(f?.netIncome, f?.revenue),
    debtToEquity: f?.equity != null && f.equity > 0 ? ratio(f.totalDebt, f.equity) : null,
    dividendYield,
    reportCurrency: f?.currency ?? null,
    asOf: f?.asOf ?? null,
  };

  if (f?.eps != null && !sameCurrency) {
    notes.push(`Los estados financieros están en ${f.currency} y el precio en ${quote.currency}; se omite el P/E para no comparar monedas distintas.`);
  } else if (f?.eps != null && f.eps <= 0) {
    add("P/E (precio / utilidad)", -1, "La empresa tuvo pérdidas en los últimos 12 meses, así que el P/E no aplica.");
  } else if (pe != null) {
    if (pe < 15) add("P/E (precio / utilidad)", 1, `P/E de ${num(pe, 1)}: barato frente a sus utilidades (menos de 15).`);
    else if (pe > 30) add("P/E (precio / utilidad)", -1, `P/E de ${num(pe, 1)}: caro frente a sus utilidades (más de 30); el mercado descuenta mucho crecimiento.`);
    else add("P/E (precio / utilidad)", 0, `P/E de ${num(pe, 1)}: valoración razonable (entre 15 y 30).`);
  }

  const nm = snapshot.netMargin;
  if (nm != null) {
    if (nm > 0.15) add("Margen neto", 1, `Margen neto de ${pct(nm)}: muy rentable (más de 15 %).`);
    else if (nm < 0) add("Margen neto", -1, `Margen neto de ${pct(nm)}: la empresa pierde dinero.`);
    else add("Margen neto", 0, `Margen neto de ${pct(nm)}: rentabilidad moderada.`);
  }

  if (f?.equity != null && f.equity <= 0) {
    add("Deuda / patrimonio", -1, "El patrimonio es negativo: la empresa debe más de lo que tiene.");
  } else if (snapshot.debtToEquity != null) {
    const de = snapshot.debtToEquity;
    const bankNote = " En bancos y aseguradoras un nivel alto es normal.";
    if (de < 0.5) add("Deuda / patrimonio", 1, `Deuda de ${num(de, 2)} veces el patrimonio: endeudamiento bajo.`);
    else if (de > 1.5) add("Deuda / patrimonio", -1, `Deuda de ${num(de, 2)} veces el patrimonio: endeudamiento alto.${bankNote}`);
    else add("Deuda / patrimonio", 0, `Deuda de ${num(de, 2)} veces el patrimonio: endeudamiento moderado.`);
  }

  if (dividendYield != null) {
    add(
      "Dividendos",
      dividendYield >= 0.03 ? 1 : 0,
      `Pagó ${pct(dividendYield)} del precio actual en dividendos los últimos 12 meses` +
        (dividendYield >= 0.03 ? ": rentabilidad por dividendo atractiva." : "."),
    );
  }

  return { factors, snapshot, notes };
}

/** Buy / hold / sell for a score from -100 to 100 (the combined or the technical-only score). */
export function verdictFor(score: number): Verdict {
  return score >= BUY_SCORE ? "comprar" : score <= -BUY_SCORE ? "vender" : "mantener";
}

const mean = (votes: Vote[]) => votes.reduce<number>((s, v) => s + v, 0) / votes.length;

export function analyze({ quote, candles, dividends = [], fundamentals }: AnalysisInput): Analysis {
  if (candles.length < MIN_CANDLES) {
    throw new Error(`Se necesitan al menos ${MIN_CANDLES} sesiones de historia para analizar ${quote.symbol}`);
  }
  // Use the live price as the latest close so the signal matches what's on screen.
  const series = [...candles];
  series[series.length - 1] = { ...series[series.length - 1], close: quote.price };

  const tech = technicalFactors(series);
  const fund = fundamentalFactors(quote, dividends, fundamentals);
  const notes = [...fund.notes];
  if (candles.length < 200) notes.push("Hay menos de 200 sesiones de historia; se omiten las señales de la media de 200.");

  const technicalScore = mean(tech.factors.map((f) => f.vote));
  const fundamentalScore = fund.factors.length >= 2 ? mean(fund.factors.map((f) => f.vote)) : null;
  const combined =
    fundamentalScore == null ? technicalScore : TECHNICAL_WEIGHT * technicalScore + (1 - TECHNICAL_WEIGHT) * fundamentalScore;
  const verdict = verdictFor(Math.round(combined * 100));

  const factors = [...tech.factors, ...fund.factors];
  return {
    symbol: quote.symbol,
    price: quote.price,
    currency: quote.currency,
    asOf: candles.at(-1)!.time,
    verdict,
    score: Math.round(combined * 100),
    technicalScore: Math.round(technicalScore * 100),
    fundamentalScore: fundamentalScore == null ? null : Math.round(fundamentalScore * 100),
    summary: summarize(verdict, factors, fundamentalScore != null),
    factors,
    notes,
    technical: tech.snapshot,
    fundamentals: fund.snapshot,
  };
}

function summarize(verdict: Verdict, factors: Factor[], withFundamentals: boolean): string {
  const count = (group: Factor["group"], vote: Vote) => factors.filter((f) => f.group === group && f.vote === vote).length;
  const tally = (group: Factor["group"]) => `${count(group, 1)} a favor y ${count(group, -1)} en contra`;
  const fund = withFundamentals
    ? `; en fundamentales, ${tally("fundamental")}`
    : "; sin datos fundamentales suficientes, la señal es solo técnica";
  const lead = { comprar: "Predominan las señales favorables", mantener: "Las señales están mezcladas", vender: "Predominan las señales desfavorables" }[verdict];
  return `${lead}. En lo técnico, ${tally("tecnico")}${fund}.`;
}
