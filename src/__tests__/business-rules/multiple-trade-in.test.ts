import { describe, it, expect } from 'vitest';

interface TradeInDevice {
  name: string;
  brand: string;
  model: string;
  imei: string;
  value: string;
}

// Simulador de lógica pura de faturamento para múltiplos aparelhos de troca (trade-in)
function calculateTotalTradeIn(devices: TradeInDevice[], hasTradeIn: boolean): number {
  if (!hasTradeIn) return 0;
  return devices.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0);
}

function buildTradeInDetailsText(devices: TradeInDevice[]): string[] {
  return devices
    .filter(d => d.name)
    .map(d => `${d.name} (${d.brand} ${d.model}) IMEI: ${d.imei || 'N/A'} - Valor: R$ ${(parseFloat(d.value) || 0).toFixed(2)}`);
}

describe('Multiple Trade-in — Business Rules', () => {
  const sampleDevices: TradeInDevice[] = [
    { name: 'iPhone 11', brand: 'iPhone', model: 'A2221', imei: '12345', value: '1500.00' },
    { name: 'iPhone X', brand: 'iPhone', model: 'A1865', imei: '67890', value: '1000.00' },
  ];

  it('should sum all trade-in values correctly', () => {
    const total = calculateTotalTradeIn(sampleDevices, true);
    expect(total).toBe(2500.00);
  });

  it('should return 0 trade-in value if hasTradeIn is false', () => {
    const total = calculateTotalTradeIn(sampleDevices, false);
    expect(total).toBe(0);
  });

  it('should build detailed notes string listing all trade-in devices', () => {
    const details = buildTradeInDetailsText(sampleDevices);
    expect(details).toHaveLength(2);
    expect(details[0]).toBe('iPhone 11 (iPhone A2221) IMEI: 12345 - Valor: R$ 1500.00');
    expect(details[1]).toBe('iPhone X (iPhone A1865) IMEI: 67890 - Valor: R$ 1000.00');

    const notesStr = `[Aparelhos na Troca: ${details.join(' | ')}]`;
    expect(notesStr).toContain('iPhone 11');
    expect(notesStr).toContain('iPhone X');
  });

  it('should fallback to first device for backward compatibility fields', () => {
    const firstDevice = sampleDevices[0];
    expect(firstDevice.name).toBe('iPhone 11');
    expect(firstDevice.brand).toBe('iPhone');
    expect(firstDevice.value).toBe('1500.00');
  });
});
