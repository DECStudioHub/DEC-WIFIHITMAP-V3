/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  fetchNativeWifiMeasurement,
  detectPlatformMode,
  PlatformMode,
} from './nativeWifiBridge';

export { detectPlatformMode, type PlatformMode };

export interface WifiMeasurementResult {
  rssiDbm?: number;
  signalPercent?: number;
  bars: 1 | 2 | 3;
  classification: 'Excellent / Strong' | 'Good / Moderate' | 'Weak';
  speedMbps?: number;
  ssid?: string;
  bssid?: string;
  connectionType: string;
  ipAddress?: string;
  macAddress?: string;
  frequency?: string;
  channel?: number | string;
  effectiveType?: string;
  rttMs?: number;
  measuredAt: string;
  measurementDate: string;
  measurementTime: string;
  measurementSource: 'Native WiFi API' | 'Browser Network Test' | 'Network Information API' | 'Field Calibrated Reading' | 'Manual / External WiFi Meter';
  measurementStatus: 'Measured' | 'Partial' | 'Calibrated';
  isRssiAvailable: boolean;
  isSpeedAvailable: boolean;
  notes?: string;
}

export interface NetworkCapabilities {
  hasNativeWifiBridge: boolean;
  hasNetworkInfoApi: boolean;
  isOnline: boolean;
  detectedType?: string;
  effectiveType?: string;
  downlinkMbps?: number;
  rttMs?: number;
}

/**
 * Strict piecewise linear interpolation of RSSI (dBm) to Signal Strength Percentage
 * Based on Specification Section 363:
 * -30 dBm -> 100%
 * -40 dBm -> 90%
 * -50 dBm -> 80%
 * -60 dBm -> 70%
 * -67 dBm -> 60%
 * -70 dBm -> 50%
 * -80 dBm -> 25%
 * -90 dBm -> 0%
 */
export function rssiToSignalPercent(rssiDbm: number): number {
  if (rssiDbm >= -30) return 100;
  if (rssiDbm <= -90) return 0;

  if (rssiDbm >= -40) {
    // -40 to -30 dBm -> 90% to 100%
    const ratio = (rssiDbm - (-40)) / 10;
    return Math.round(90 + ratio * 10);
  }
  if (rssiDbm >= -50) {
    // -50 to -40 dBm -> 80% to 90%
    const ratio = (rssiDbm - (-50)) / 10;
    return Math.round(80 + ratio * 10);
  }
  if (rssiDbm >= -60) {
    // -60 to -50 dBm -> 70% to 80%
    const ratio = (rssiDbm - (-60)) / 10;
    return Math.round(70 + ratio * 10);
  }
  if (rssiDbm >= -67) {
    // -67 to -60 dBm -> 60% to 70%
    const ratio = (rssiDbm - (-67)) / 7;
    return Math.round(60 + ratio * 10);
  }
  if (rssiDbm >= -70) {
    // -70 to -67 dBm -> 50% to 60%
    const ratio = (rssiDbm - (-70)) / 3;
    return Math.round(50 + ratio * 10);
  }
  if (rssiDbm >= -80) {
    // -80 to -70 dBm -> 25% to 50%
    const ratio = (rssiDbm - (-80)) / 10;
    return Math.round(25 + ratio * 25);
  }
  // -90 to -80 dBm -> 0% to 25%
  const ratio = (rssiDbm - (-90)) / 10;
  return Math.round(0 + ratio * 25);
}

/**
 * Signal Classification & Bars
 */
export function getSignalClassification(signalPercent: number, rssiDbm?: number): {
  bars: 1 | 2 | 3;
  classification: 'Excellent / Strong' | 'Good / Moderate' | 'Weak';
} {
  if (typeof rssiDbm === 'number' && !isNaN(rssiDbm)) {
    // Specification section:
    // -35 dBm / -50 dBm -> Excellent
    // -60 dBm / -70 dBm -> Good / Moderate
    // -80 dBm -> Weak
    if (rssiDbm >= -55) return { bars: 3, classification: 'Excellent / Strong' };
    if (rssiDbm >= -75) return { bars: 2, classification: 'Good / Moderate' };
    return { bars: 1, classification: 'Weak' };
  }

  if (signalPercent >= 81) return { bars: 3, classification: 'Excellent / Strong' };
  if (signalPercent >= 40) return { bars: 2, classification: 'Good / Moderate' };
  return { bars: 1, classification: 'Weak' };
}

/**
 * Detect runtime network environment & native bridges
 */
export function detectNetworkCapabilities(): NetworkCapabilities {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  
  // Check for native bridges (Android WebView, Electron, Tauri, or injected Native WebView)
  const win = typeof window !== 'undefined' ? (window as any) : {};
  const hasNativeWifiBridge = Boolean(
    win.AndroidWifiBridge ||
    win.NativeWifiMeter ||
    win.android?.getWifiInfo ||
    win.nativeWifi ||
    win.electronAPI?.getWifiInfo ||
    win.__TAURI__
  );

  // Network Information API
  const nav = typeof navigator !== 'undefined' ? (navigator as any) : {};
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  const hasNetworkInfoApi = Boolean(conn);

  return {
    hasNativeWifiBridge,
    hasNetworkInfoApi,
    isOnline,
    detectedType: conn?.type || (isOnline ? 'WiFi / Network' : 'Disconnected'),
    effectiveType: conn?.effectiveType || '4g',
    downlinkMbps: conn?.downlink ? Number(conn.downlink) : undefined,
    rttMs: conn?.rtt ? Number(conn.rtt) : undefined,
  };
}

/**
 * Attempt to query native Wi-Fi data if a supported bridge is available
 */
export async function queryNativeWifiData(): Promise<Partial<WifiMeasurementResult> | null> {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Try Native Android / Multiplatform Bridge first
    const nativeResult = await fetchNativeWifiMeasurement();
    if (nativeResult && typeof nativeResult.rssiDbm === 'number') {
      const calculatedPct = rssiToSignalPercent(nativeResult.rssiDbm);
      const percent = nativeResult.signalPercent ?? calculatedPct;
      const { bars, classification } = getSignalClassification(percent, nativeResult.rssiDbm);
      return {
        rssiDbm: nativeResult.rssiDbm,
        signalPercent: percent,
        bars,
        classification,
        ssid: nativeResult.ssid,
        bssid: nativeResult.bssid,
        speedMbps: nativeResult.linkSpeedMbps,
        frequency: nativeResult.frequency,
        channel: nativeResult.channel,
        connectionType: nativeResult.connectionType || 'WiFi',
        ipAddress: nativeResult.ipAddress,
        macAddress: nativeResult.macAddress,
        measurementSource: 'Native WiFi API',
        measurementStatus: 'Measured',
        isRssiAvailable: true,
        isSpeedAvailable: typeof nativeResult.linkSpeedMbps === 'number',
      };
    }

    const win = window as any;
    if (win.nativeWifi?.getSignalData) {
      const data = await win.nativeWifi.getSignalData();
      if (data && typeof data.rssiDbm === 'number') {
        const percent = rssiToSignalPercent(data.rssiDbm);
        const { bars, classification } = getSignalClassification(percent, data.rssiDbm);
        return {
          rssiDbm: data.rssiDbm,
          signalPercent: data.signalPercent ?? percent,
          bars,
          classification,
          ssid: data.ssid,
          bssid: data.bssid,
          speedMbps: data.speedMbps,
          frequency: data.frequency,
          channel: data.channel,
          measurementSource: 'Native WiFi API',
          measurementStatus: 'Measured',
          isRssiAvailable: true,
          isSpeedAvailable: typeof data.speedMbps === 'number',
        };
      }
    }

    if (win.electronAPI?.getWifiInfo) {
      const data = await win.electronAPI.getWifiInfo();
      if (data && typeof data.rssi === 'number') {
        const percent = rssiToSignalPercent(data.rssi);
        const { bars, classification } = getSignalClassification(percent, data.rssi);
        return {
          rssiDbm: data.rssi,
          signalPercent: percent,
          bars,
          classification,
          ssid: data.ssid,
          bssid: data.bssid,
          speedMbps: data.linkSpeed,
          frequency: data.frequency,
          channel: data.channel,
          measurementSource: 'Native WiFi API',
          measurementStatus: 'Measured',
          isRssiAvailable: true,
          isSpeedAvailable: typeof data.linkSpeed === 'number',
        };
      }
    }
  } catch (err) {
    console.warn('Native WiFi bridge query failed:', err);
  }

  return null;
}

/**
 * Real network throughput test
 * Specification 361 & 362:
 * Mbps = (Transferred Bytes * 8) / (Elapsed Seconds * 1,000,000)
 */
export async function runNetworkSpeedTest(
  onProgress?: (stats: { transferredBytes: number; elapsedMs: number; currentMbps: number }) => void,
  abortSignal?: AbortSignal
): Promise<number> {
  const startTime = performance.now();
  let transferredBytes = 0;

  // Use a reliable lightweight endpoint or dynamic test payload
  // In our Vite/React app, we fetch an internal or standard static asset with cache-busting
  const testUrl = `/?speedtest_ping=${Date.now()}_${Math.random()}`;

  try {
    const response = await fetch(testUrl, {
      signal: abortSignal,
      cache: 'no-store',
    });

    if (!response.body) {
      const blob = await response.blob();
      transferredBytes = blob.size || 65536;
    } else {
      const reader = response.body.getReader();
      while (true) {
        if (abortSignal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          transferredBytes += value.byteLength;
          const elapsed = performance.now() - startTime;
          if (elapsed > 200 && onProgress) {
            const elapsedSec = elapsed / 1000;
            const currentMbps = (transferredBytes * 8) / (elapsedSec * 1_000_000);
            onProgress({
              transferredBytes,
              elapsedMs: Math.round(elapsed),
              currentMbps: Math.round(currentMbps * 10) / 10,
            });
          }
        }
      }
    }

    const elapsedMs = Math.max(1, performance.now() - startTime);
    const elapsedSec = elapsedMs / 1000;
    const calculatedMbps = (transferredBytes * 8) / (elapsedSec * 1_000_000);

    // If transferred data was minimal (e.g. cached header response), check Network Information API downlink as secondary fallback
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : {};
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (calculatedMbps < 0.5 && conn?.downlink && typeof conn.downlink === 'number') {
      return Math.round(conn.downlink * 10) / 10;
    }

    return Math.max(0.1, Math.round(calculatedMbps * 10) / 10);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    // Check Network Information API downlink as fallback if available
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : {};
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (conn?.downlink && typeof conn.downlink === 'number') {
      return Math.round(conn.downlink * 10) / 10;
    }
    throw err;
  }
}
