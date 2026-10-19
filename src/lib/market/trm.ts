// Official USD/COP rate (TRM) published daily by the Superintendencia
// Financiera on datos.gov.co. Free and keyless.
const TRM_URL = "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1";

export type Trm = { value: number; /** YYYY-MM-DD the rate applies from. */ validFrom: string };

export function parseTrm(data: { valor?: string; vigenciadesde?: string }[]): Trm {
  const row = data[0];
  const value = Number(row?.valor);
  if (!row || !(value > 0)) throw new Error("datos.gov.co: sin TRM");
  return { value, validFrom: (row.vigenciadesde ?? "").slice(0, 10) };
}

export async function getTrm(): Promise<Trm> {
  const res = await fetch(TRM_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`datos.gov.co TRM: HTTP ${res.status}`);
  return parseTrm(await res.json());
}
