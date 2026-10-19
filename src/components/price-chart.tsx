"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  LineSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { bollinger, macd, rsi, sma, type Series } from "@/lib/analysis/indicators";
import type { Candle } from "@/lib/market/types";

const UP = "#16a34a";
const DOWN = "#dc2626";
const COLORS = { sma50: "#f59e0b", sma200: "#8b5cf6", band: "#0ea5e9", macd: "#2563eb", signal: "#f97316" };

export type Study = "medias" | "bollinger" | "rsi" | "macd";

export const STUDIES: { value: Study; label: string }[] = [
  { value: "medias", label: "Medias 50/200" },
  { value: "bollinger", label: "Bollinger" },
  { value: "rsi", label: "RSI" },
  { value: "macd", label: "MACD" },
];

function points(candles: Candle[], series: Series) {
  return candles.flatMap((c, i) => (series[i] == null ? [] : [{ time: c.time as UTCTimestamp, value: series[i]! }]));
}

export function PriceChart({ candles, studies = [] }: { candles: Candle[]; studies?: Study[] }) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue("--muted").trim() || "#888";
    const grid = styles.getPropertyValue("--line").trim() || "#8883";

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      timeScale: { timeVisible: true },
    });
    chartRef.current = chart;

    const price = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    price.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    volume.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? `${UP}66` : `${DOWN}66`,
      })),
    );

    const closes = candles.map((c) => c.close);
    const line = (data: Series, color: string, pane = 0, title = "") =>
      chart
        .addSeries(LineSeries, { color, lineWidth: 1, title, priceLineVisible: false, lastValueVisible: false }, pane)
        .setData(points(candles, data));
    if (studies.includes("medias")) {
      line(sma(closes, 50), COLORS.sma50, 0, "MA50");
      line(sma(closes, 200), COLORS.sma200, 0, "MA200");
    }
    if (studies.includes("bollinger")) {
      const bb = bollinger(closes);
      line(bb.upper, COLORS.band);
      line(bb.middle, `${COLORS.band}88`);
      line(bb.lower, COLORS.band);
    }
    let pane = 0;
    if (studies.includes("rsi")) {
      pane++;
      line(rsi(closes), COLORS.macd, pane, "RSI");
      for (const level of [30, 70]) line(closes.map(() => level), `${DOWN}66`, pane);
    }
    if (studies.includes("macd")) {
      pane++;
      const m = macd(closes);
      chart
        .addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
        .setData(
          candles.flatMap((c, i) =>
            m.histogram[i] == null ? [] : [{ time: c.time as UTCTimestamp, value: m.histogram[i]!, color: m.histogram[i]! >= 0 ? `${UP}99` : `${DOWN}99` }],
          ),
        );
      line(m.macd, COLORS.macd, pane, "MACD");
      line(m.signal, COLORS.signal, pane);
    }

    // Price pane gets four times the height of each indicator pane.
    if (pane > 0) chart.panes()[0].setStretchFactor(4);
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, studies]);

  const extra = studies.filter((s) => s === "rsi" || s === "macd").length;
  const height = ["h-[360px] sm:h-[460px]", "h-[450px] sm:h-[550px]", "h-[540px] sm:h-[640px]"][extra];
  return <div ref={container} className={`w-full ${height}`} />;
}
