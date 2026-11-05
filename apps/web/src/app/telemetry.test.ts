import { ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';
import { gateExporter, traceContextPropagator } from './telemetry';

const TRACE = '0af7651916cd43dd8448eb211c80319c';
const SPAN = 'b7ad6b7169203331';

describe('traceContextPropagator', () => {
  it('writes a W3C traceparent for the active span', () => {
    const ctx = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: TRACE,
      spanId: SPAN,
      traceFlags: 1,
    });
    const carrier: Record<string, string> = {};
    traceContextPropagator.inject(ctx, carrier, {
      set: (c: Record<string, string>, key, value) => void (c[key] = value),
    });
    expect(carrier).toEqual({ traceparent: `00-${TRACE}-${SPAN}-01` });
  });

  it('writes nothing without an active span', () => {
    const carrier: Record<string, string> = {};
    traceContextPropagator.inject(ROOT_CONTEXT, carrier, {
      set: (c: Record<string, string>, key, value) => void (c[key] = value),
    });
    expect(carrier).toEqual({});
  });

  it('reads a traceparent back and ignores a malformed one', () => {
    const getter = {
      get: (c: Record<string, string>, key: string) => c[key],
      keys: (c: Record<string, string>) => Object.keys(c),
    };
    const ctx = traceContextPropagator.extract(
      ROOT_CONTEXT,
      { traceparent: `00-${TRACE}-${SPAN}-01` },
      getter,
    );
    expect(trace.getSpanContext(ctx)).toMatchObject({
      traceId: TRACE,
      spanId: SPAN,
      isRemote: true,
    });
    const bad = traceContextPropagator.extract(ROOT_CONTEXT, { traceparent: 'nonsense' }, getter);
    expect(trace.getSpanContext(bad)).toBeUndefined();
  });
});

describe('gateExporter', () => {
  const inner = () => ({
    export: vi.fn(),
    shutdown: vi.fn(async () => undefined),
    forceFlush: vi.fn(async () => undefined),
  });

  it('exports normally', () => {
    const exporter = inner();
    const done = vi.fn();
    gateExporter(exporter, () => false).export([], done);
    expect(exporter.export).toHaveBeenCalledWith([], done);
  });

  it('drops batches while blocked, as a success, without touching the network', () => {
    const exporter = inner();
    const done = vi.fn();
    gateExporter(exporter, () => true).export([], done);
    expect(exporter.export).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith({ code: 0 });
  });
});
