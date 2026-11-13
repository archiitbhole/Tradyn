"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { defaultConfig, validateConfig, type SimConfig } from "@/lib/simulator/config";
import { MarketEngine, type EventKey } from "@/lib/simulator/engine";

const TICK_MS = 50;

/**
 * Owns one MarketEngine and the play/pause loop. Everything runs in the browser; nothing is sent
 * to the server and nothing here touches real market data. The engine is mutable, so `version`
 * changes after every step to re-render the page.
 */
export function useSimulation() {
  const [engine, setEngine] = useState(() => new MarketEngine(defaultConfig()));
  const [version, setVersion] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(20);
  const carry = useRef(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      carry.current += (speed * TICK_MS) / 1000;
      const n = Math.floor(carry.current);
      carry.current -= n;
      if (n > 0) engine.run(n);
      if (engine.finished) setRunning(false);
      bump();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, speed, engine, bump]);

  const reset = useCallback(
    (next?: SimConfig): string | null => {
      const cfg = next ?? engine.cfg;
      const problem = validateConfig(cfg);
      if (problem) return problem;
      carry.current = 0;
      setRunning(false);
      setEngine(new MarketEngine(cfg));
      bump();
      return null;
    },
    [engine, bump],
  );

  return {
    engine,
    version,
    config: engine.cfg,
    running,
    speed,
    setSpeed,
    play: () => !engine.finished && setRunning(true),
    pause: () => setRunning(false),
    step: (n = 1) => {
      engine.run(n);
      bump();
    },
    finish: () => {
      setRunning(false);
      engine.run();
      bump();
    },
    trigger: (key: EventKey) => {
      if (engine.finished) return;
      engine.trigger(key);
      bump();
    },
    reset,
  };
}

export type Simulation = ReturnType<typeof useSimulation>;
