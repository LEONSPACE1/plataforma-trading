"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type ISeriesApi,
  LineSeries,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { bollinger, macd, rsi, sma, type Series } from "@/lib/analysis/indicators";
import { applyLivePrice } from "@/lib/market/live";
import type { Candle, Quote } from "@/lib/market/types";

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

type Point = { time: UTCTimestamp; value: number; color?: string };

function points(candles: Candle[], series: Series): Point[] {
  return candles.flatMap((c, i) => (series[i] == null ? [] : [{ time: c.time as UTCTimestamp, value: series[i]! }]));
}

const volumeBar = (c: Candle): Point => ({
  time: c.time as UTCTimestamp,
  value: c.volume,
  color: c.close >= c.open ? `${UP}66` : `${DOWN}66`,
});

const macdBar = (c: Candle, v: number): Point => ({ time: c.time as UTCTimestamp, value: v, color: v >= 0 ? `${UP}99` : `${DOWN}99` });

/** A series plus how to recompute its points from the candles. */
type Layer = { series: ISeriesApi<SeriesType>; build: (candles: Candle[]) => (Point | (Candle & { time: UTCTimestamp }))[] };

type Props = {
  candles: Candle[];
  studies?: Study[];
  /** Latest quote; it moves the last candle (or opens a new one) without rebuilding the chart. */
  live?: Pick<Quote, "price" | "time">;
};

/**
 * Candles with optional studies. The chart is built once per data load and
 * study set; each live quote then updates only the last points of every
 * series, so the user's zoom and scroll survive the refresh.
 */
export function PriceChart({ candles, studies = [], live }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const layers = useRef<Layer[]>([]);
  // What the chart currently shows: the loaded candles plus live updates so far.
  const drawn = useRef<Candle[]>([]);
  // By value, so a new array with the same studies doesn't rebuild the chart.
  const studyKey = studies.join(",");

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const active = studyKey.split(",");
    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue("--muted").trim() || "#888";
    const grid = styles.getPropertyValue("--line").trim() || "#8883";

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      timeScale: { timeVisible: true },
    });
    const list: Layer[] = [];
    const add = (series: ISeriesApi<SeriesType>, build: Layer["build"]) => list.push({ series, build });

    add(
      chart.addSeries(CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        borderVisible: false,
        wickUpColor: UP,
        wickDownColor: DOWN,
      }),
      (cs) => cs.map((c) => ({ ...c, time: c.time as UTCTimestamp })),
    );
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    add(volume, (cs) => cs.map(volumeBar));

    const closes = (cs: Candle[]) => cs.map((c) => c.close);
    const line = (calc: (values: number[]) => Series, color: string, pane = 0, title = "") =>
      add(
        chart.addSeries(LineSeries, { color, lineWidth: 1, title, priceLineVisible: false, lastValueVisible: false }, pane),
        (cs) => points(cs, calc(closes(cs))),
      );
    if (active.includes("medias")) {
      line((v) => sma(v, 50), COLORS.sma50, 0, "MA50");
      line((v) => sma(v, 200), COLORS.sma200, 0, "MA200");
    }
    if (active.includes("bollinger")) {
      line((v) => bollinger(v).upper, COLORS.band);
      line((v) => bollinger(v).middle, `${COLORS.band}88`);
      line((v) => bollinger(v).lower, COLORS.band);
    }
    let pane = 0;
    if (active.includes("rsi")) {
      pane++;
      line((v) => rsi(v), COLORS.macd, pane, "RSI");
      for (const level of [30, 70]) line((v) => v.map(() => level), `${DOWN}66`, pane);
    }
    if (active.includes("macd")) {
      pane++;
      add(chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane), (cs) => {
        const h = macd(closes(cs)).histogram;
        return cs.flatMap((c, i) => (h[i] == null ? [] : [macdBar(c, h[i]!)]));
      });
      line((v) => macd(v).macd, COLORS.macd, pane, "MACD");
      line((v) => macd(v).signal, COLORS.signal, pane);
    }

    for (const l of list) l.series.setData(l.build(candles));
    layers.current = list;
    drawn.current = candles;

    // Price pane gets four times the height of each indicator pane.
    if (pane > 0) chart.panes()[0].setStretchFactor(4);
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      layers.current = [];
    };
  }, [candles, studyKey]);

  // Declared after the build effect so it runs right after a rebuild too.
  const livePrice = live?.price;
  const liveTime = live?.time;
  useEffect(() => {
    if (livePrice == null || liveTime == null || layers.current.length === 0) return;
    const prev = drawn.current;
    const next = applyLivePrice(prev, { price: livePrice, time: liveTime });
    if (next === prev) return;
    const from = prev.at(-1)!.time;
    for (const l of layers.current) {
      // Only the moved last candle and a newly opened one change.
      for (const p of l.build(next).slice(-2)) if (p.time >= from) l.series.update(p);
    }
    drawn.current = next;
  }, [candles, studyKey, livePrice, liveTime]);

  const extra = studies.filter((s) => s === "rsi" || s === "macd").length;
  const height = ["h-[360px] sm:h-[460px]", "h-[450px] sm:h-[550px]", "h-[540px] sm:h-[640px]"][extra];
  return <div ref={container} className={`w-full ${height}`} />;
}
