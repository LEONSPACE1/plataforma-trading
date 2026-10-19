"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Candle } from "@/lib/market/types";

const UP = "#16a34a";
const DOWN = "#dc2626";

export function PriceChart({ candles }: { candles: Candle[] }) {
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
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles]);

  return <div ref={container} className="h-[360px] w-full sm:h-[460px]" />;
}
