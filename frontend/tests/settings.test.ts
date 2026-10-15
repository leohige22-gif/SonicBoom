import { describe, expect, it } from 'vitest';
import { parseSetting } from '../src/services/settings';
import type { SettingSchema } from '../src/services/contracts';
const meta: SettingSchema = { path: 'server.port', description: 'Port', type: 'integer', min: 1, max: 65535, apply: 'restart_server', secret: false, nullable: false };
describe('typed setting validation', () => {
  it('rejects cleared, fractional, nonfinite and out of range numeric values', () => {
    for (const value of ['', '1.5', 'NaN', 'Infinity', '0', '65536']) expect(() => parseSetting(meta, value)).toThrow();
    expect(parseSetting(meta, '17842')).toBe(17842);
  });
  it('keeps nullable values and validates JSON shape', () => {
    expect(parseSetting({ ...meta, nullable: true }, '')).toBeNull();
    expect(() => parseSetting({ ...meta, type: 'array' }, '{}')).toThrow();
    expect(() => parseSetting({ ...meta, type: 'object' }, '[]')).toThrow();
    expect(parseSetting({ ...meta, type: 'array' }, '["a"]')).toEqual(['a']);
    expect(parseSetting({ ...meta, type: 'boolean' }, false)).toBe(false);
  });
});
