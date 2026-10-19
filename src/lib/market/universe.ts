// Fixed list the screener always covers: large US companies and ETFs, plus the
// liquid shares of the Bolsa de Valores de Colombia. Symbols users keep in
// their lists or portfolio are added on top.

export const US_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "BRK.B", "JPM",
  "LLY", "V", "UNH", "XOM", "MA", "JNJ", "PG", "HD", "COST", "ABBV",
  "MRK", "CVX", "KO", "PEP", "WMT", "BAC", "ADBE", "CRM", "NFLX", "AMD",
  "ORCL", "CSCO", "INTC", "QCOM", "TXN", "IBM", "MCD", "NKE", "DIS", "SBUX",
  "PFE", "TMO", "ABT", "DHR", "AMGN", "BMY", "GILD", "CAT", "DE", "BA",
  "GE", "HON", "UPS", "LMT", "RTX", "GS", "MS", "WFC", "C", "AXP",
  "BLK", "SCHW", "PYPL", "UBER", "ABNB", "SHOP", "PLTR", "MU", "AMAT", "LRCX",
  "T", "VZ", "TMUS", "CMCSA", "NEE", "DUK", "SO", "O", "PLD", "AMT",
  "MMM", "F", "GM", "COP", "OXY", "SLB", "MO", "PM", "CL", "MDLZ",
  // ETFs and Colombian companies listed in New York.
  "SPY", "QQQ", "DIA", "IWM", "VTI", "VOO", "GLD", "TLT", "EC", "CIB", "AVAL",
];

export const CO_UNIVERSE = [
  "ECOPETROL.CL", "PFCIBEST.CL", "CIBEST.CL", "ISA.CL", "GEB.CL", "CELSIA.CL",
  "GRUPOARGOS.CL", "PFGRUPOARG.CL", "CEMARGOS.CL", "PFCEMARGOS.CL", "PFAVAL.CL", "GRUPOAVAL.CL",
  "GRUPOSURA.CL", "PFGRUPSURA.CL", "NUTRESA.CL", "BOGOTA.CL", "CORFICOLCF.CL", "PFCORFICOL.CL",
  "PROMIGAS.CL", "MINEROS.CL", "BVC.CL", "TERPEL.CL", "ETB.CL", "BHI.CL", "PFDAVVNDA.CL",
  "EXITO.CL", "ICOLCAP.CL",
];

export const UNIVERSE = [...US_UNIVERSE, ...CO_UNIVERSE];
