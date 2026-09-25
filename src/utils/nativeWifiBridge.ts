/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native WiFi Bridge Architecture for WIFI HITMAP
 * 
 * Flow:
 * Device WiFi Hardware
 *        ↓
 * Native WiFi API (Android WifiManager / NetworkCapabilities)
 *        ↓
 * WiFi Signal Meter Bridge (window.AndroidWifiBridge / window.NativeWifiMeter)
 *        ↓
 * WIFI HITMAP Web Application
 *        ↓
 * WiFi Reading
 */

export interface NativeWifiMeasurement {
  rssiDbm: number;
  linkSpeedMbps?: number;
  signalPercent?: number; // Estimated or hardware calculated
  ssid?: string;
  bssid?: string;
  frequency?: string;
  channel?: number | string;
  connectionType?: string;
  ipAddress?: string;
  macAddress?: string;
  timestamp?: number;
}

export type PlatformMode = 'MODE_A_NATIVE' | 'MODE_B_PERMISSION_REQUIRED' | 'MODE_C_BROWSER';

export interface AndroidWifiBridge {
  isAvailable?: () => boolean | Promise<boolean>;
  hasPermission?: () => boolean | Promise<boolean>;
  requestPermission?: () => boolean | Promise<boolean>;
  getWifiInfo?: () => string | NativeWifiMeasurement | Promise<string | NativeWifiMeasurement>;
  startLiveScan?: (intervalMs?: number) => void;
  stopLiveScan?: () => void;
}

declare global {
  interface Window {
    AndroidWifiBridge?: AndroidWifiBridge;
    NativeWifiMeter?: AndroidWifiBridge;
    android?: AndroidWifiBridge;
    __testNativeModeOverride?: PlatformMode | null;
  }
}

/**
 * Storage key for dev/test mode simulation in web browsers
 */
const DEV_TEST_MODE_KEY = 'wifi_hitmap_dev_platform_mode';

/**
 * Get the currently active test platform mode override (if set)
 */
export function getDevPlatformModeOverride(): PlatformMode | null {
  if (typeof window === 'undefined') return null;
  if (window.__testNativeModeOverride) return window.__testNativeModeOverride;
  try {
    const stored = localStorage.getItem(DEV_TEST_MODE_KEY);
    if (stored === 'MODE_A_NATIVE' || stored === 'MODE_B_PERMISSION_REQUIRED' || stored === 'MODE_C_BROWSER') {
      return stored;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Set dev/test platform mode override (useful for desktop demonstration & verification)
 */
export function setDevPlatformModeOverride(mode: PlatformMode | null): void {
  if (typeof window === 'undefined') return;
  window.__testNativeModeOverride = mode;
  try {
    if (mode) {
      localStorage.setItem(DEV_TEST_MODE_KEY, mode);
    } else {
      localStorage.removeItem(DEV_TEST_MODE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Check if a real native Android or OS bridge is present on the window object
 */
export function getRealNativeBridge(): AndroidWifiBridge | null {
  if (typeof window === 'undefined') return null;
  if (window.AndroidWifiBridge) return window.AndroidWifiBridge;
  if (window.NativeWifiMeter) return window.NativeWifiMeter;
  if (window.android?.getWifiInfo) return window.android;
  return null;
}

/**
 * Detect the active platform mode:
 * - MODE A: Native Android bridge available and permissions granted
 * - MODE B: Native Android bridge available, but permissions (location/nearby devices) needed
 * - MODE C: Standard browser without native RSSI access
 */
export async function detectPlatformMode(): Promise<{
  mode: PlatformMode;
  isRealNativeBridge: boolean;
  bridgeName?: string;
}> {
  // Check dev test override first if explicitly set
  const testOverride = getDevPlatformModeOverride();
  if (testOverride) {
    return {
      mode: testOverride,
      isRealNativeBridge: false,
      bridgeName: `Simulated Android Native Bridge (${testOverride})`,
    };
  }

  const realBridge = getRealNativeBridge();
  if (realBridge) {
    const bridgeName = window.AndroidWifiBridge
      ? 'AndroidWifiBridge'
      : window.NativeWifiMeter
      ? 'NativeWifiMeter'
      : 'android';

    try {
      // Check if native bridge requires permission
      if (typeof realBridge.hasPermission === 'function') {
        const hasPerm = await Promise.resolve(realBridge.hasPermission());
        if (!hasPerm) {
          return { mode: 'MODE_B_PERMISSION_REQUIRED', isRealNativeBridge: true, bridgeName };
        }
      }
      return { mode: 'MODE_A_NATIVE', isRealNativeBridge: true, bridgeName };
    } catch (err) {
      console.warn('Error checking native bridge permission:', err);
      return { mode: 'MODE_B_PERMISSION_REQUIRED', isRealNativeBridge: true, bridgeName };
    }
  }

  // Normal Desktop Web Browser environment
  return {
    mode: 'MODE_C_BROWSER',
    isRealNativeBridge: false,
    bridgeName: 'Desktop Web Browser',
  };
}

/**
 * Request native permission from the device (Android location/nearby wifi devices permission)
 */
export async function requestNativePermission(): Promise<boolean> {
  const testOverride = getDevPlatformModeOverride();
  if (testOverride === 'MODE_B_PERMISSION_REQUIRED') {
    // In test mode, granting permission upgrades to MODE A
    setDevPlatformModeOverride('MODE_A_NATIVE');
    return true;
  }

  const realBridge = getRealNativeBridge();
  if (realBridge && typeof realBridge.requestPermission === 'function') {
    try {
      const granted = await Promise.resolve(realBridge.requestPermission());
      return Boolean(granted);
    } catch (err) {
      console.error('Failed to request native permission:', err);
      return false;
    }
  }

  return false;
}

/**
 * Internal simulated data points for test native bridge mode
 * Provides steady, realistic test readings across typical WiFi signal ranges
 */
let simIndex = 0;
const SIMULATED_SURVEY_READINGS: NativeWifiMeasurement[] = [
  {
    rssiDbm: -57,
    linkSpeedMbps: 72,
    ssid: 'Store_Infra_5G',
    bssid: '24:de:c6:89:12:44',
    frequency: '5180 MHz (5 GHz)',
    channel: 36,
    connectionType: 'WiFi 802.11ac',
    ipAddress: '192.168.1.142',
    macAddress: '24:de:c6:89:12:44',
  },
  {
    rssiDbm: -54,
    linkSpeedMbps: 86,
    ssid: 'Store_Infra_5G',
    bssid: '24:de:c6:89:12:44',
    frequency: '5180 MHz (5 GHz)',
    channel: 36,
    connectionType: 'WiFi 802.11ac',
    ipAddress: '192.168.1.142',
    macAddress: '24:de:c6:89:12:44',
  },
  {
    rssiDbm: -62,
    linkSpeedMbps: 65,
    ssid: 'Store_Infra_5G',
    bssid: '24:de:c6:89:12:44',
    frequency: '5180 MHz (5 GHz)',
    channel: 36,
    connectionType: 'WiFi 802.11ac',
    ipAddress: '192.168.1.142',
    macAddress: '24:de:c6:89:12:44',
  },
  {
    rssiDbm: -48,
    linkSpeedMbps: 120,
    ssid: 'Store_Infra_5G',
    bssid: '24:de:c6:89:12:44',
    frequency: '5180 MHz (5 GHz)',
    channel: 36,
    connectionType: 'WiFi 802.11ac',
    ipAddress: '192.168.1.142',
    macAddress: '24:de:c6:89:12:44',
  },
];

/**
 * Fetch the latest WiFi signal measurement from the Native Bridge
 */
export async function fetchNativeWifiMeasurement(): Promise<NativeWifiMeasurement | null> {
  const realBridge = getRealNativeBridge();

  if (realBridge && typeof realBridge.getWifiInfo === 'function') {
    try {
      const rawResult = await Promise.resolve(realBridge.getWifiInfo());
      let parsed: any = rawResult;
      if (typeof rawResult === 'string') {
        try {
          parsed = JSON.parse(rawResult);
        } catch {
          // If string is raw RSSI
          const num = Number(rawResult);
          if (!isNaN(num)) parsed = { rssiDbm: num };
        }
      }

      if (parsed && typeof parsed.rssiDbm === 'number') {
        return {
          rssiDbm: parsed.rssiDbm,
          linkSpeedMbps: parsed.linkSpeedMbps ?? parsed.linkSpeed ?? parsed.speedMbps,
          signalPercent: parsed.signalPercent,
          ssid: parsed.ssid,
          bssid: parsed.bssid,
          frequency: parsed.frequency ? String(parsed.frequency) : undefined,
          channel: parsed.channel,
          connectionType: parsed.connectionType || 'WiFi',
          ipAddress: parsed.ipAddress,
          macAddress: parsed.macAddress || parsed.bssid,
          timestamp: Date.now(),
        };
      }
    } catch (err) {
      console.warn('Native bridge getWifiInfo call failed:', err);
    }
  }

  // Check dev test mode
  const testOverride = getDevPlatformModeOverride();
  if (testOverride === 'MODE_A_NATIVE') {
    const reading = SIMULATED_SURVEY_READINGS[simIndex % SIMULATED_SURVEY_READINGS.length];
    simIndex++;
    return {
      ...reading,
      timestamp: Date.now(),
    };
  }

  return null;
}
