/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  Radio,
  Activity,
  Check,
  X,
  AlertTriangle,
  Info,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Edit3,
  Play,
  Square,
  Lock,
  Layers,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import {
  WifiMeasurementResult,
  rssiToSignalPercent,
  getSignalClassification,
  queryNativeWifiData,
} from '../../utils/wifiSignalMeter';
import {
  detectPlatformMode,
  requestNativePermission,
  fetchNativeWifiMeasurement,
  setDevPlatformModeOverride,
  getDevPlatformModeOverride,
  PlatformMode,
  NativeWifiMeasurement,
} from '../../utils/nativeWifiBridge';
import { SignalReading } from '../../types';

interface WifiSignalMeterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmReading: (reading: WifiMeasurementResult) => void;
  existingReading?: SignalReading | null;
  mode?: 'create' | 'remeasure';
}

export const WifiSignalMeterModal: React.FC<WifiSignalMeterModalProps> = ({
  isOpen,
  onClose,
  onConfirmReading,
  existingReading,
  mode = 'create',
}) => {
  // Platform Detection Mode (Mode A, Mode B, or Mode C)
  const [platformMode, setPlatformMode] = useState<PlatformMode>('MODE_C_BROWSER');
  const [isRealNativeBridge, setIsRealNativeBridge] = useState<boolean>(false);
  const [bridgeName, setBridgeName] = useState<string>('');

  // Active UI sub-view: 'meter' | 'manual-entry'
  const [subView, setSubView] = useState<'meter' | 'manual-entry'>('meter');

  // Real-time measuring active state
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);

  // WiFi measurement state
  const [rssiDbm, setRssiDbm] = useState<number | undefined>(
    existingReading?.dbm ?? existingReading?.rssiDbm
  );
  const [signalPercent, setSignalPercent] = useState<number>(
    existingReading?.signal ?? existingReading?.signalPercent ?? 0
  );
  const [speedMbps, setSpeedMbps] = useState<number | undefined>(
    existingReading?.speedMbps
  );
  const [ssid, setSsid] = useState<string>(existingReading?.ssid || '');
  const [bssid, setBssid] = useState<string>('');
  const [connectionType, setConnectionType] = useState<string>('WiFi');
  const [frequency, setFrequency] = useState<string>('');
  const [channel, setChannel] = useState<string | number>('');
  const [ipAddress, setIpAddress] = useState<string>('');
  const [macAddress, setMacAddress] = useState<string>('');
  const [measurementSource, setMeasurementSource] = useState<WifiMeasurementResult['measurementSource']>(
    (existingReading?.measurementSource as any) || 'Native WiFi API'
  );

  // Manual fallback inputs
  const [manualDbm, setManualDbm] = useState<string>(
    existingReading?.dbm !== undefined ? String(existingReading.dbm) : '-57'
  );
  const [manualSignalPercent, setManualSignalPercent] = useState<string>(
    existingReading?.signal !== undefined ? String(existingReading.signal) : '78'
  );
  const [manualSpeedMbps, setManualSpeedMbps] = useState<string>(
    existingReading?.speedMbps !== undefined ? String(existingReading.speedMbps) : '72'
  );
  const [manualLocation, setManualLocation] = useState<string>(existingReading?.location || '');
  const [manualNotes, setManualNotes] = useState<string>(existingReading?.notes || '');

  // Polling ref for continuous measuring
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initial detection when modal opens
  useEffect(() => {
    if (!isOpen) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setIsMeasuring(false);
      return;
    }

    const checkPlatform = async () => {
      const result = await detectPlatformMode();
      setPlatformMode(result.mode);
      setIsRealNativeBridge(result.isRealNativeBridge);
      setBridgeName(result.bridgeName || 'Standard Browser');

      // If user is editing or re-measuring an existing reading, initialize values
      if (existingReading) {
        if (typeof existingReading.dbm === 'number') {
          setRssiDbm(existingReading.dbm);
          setManualDbm(String(existingReading.dbm));
          const pct = rssiToSignalPercent(existingReading.dbm);
          setSignalPercent(pct);
          setManualSignalPercent(String(pct));
        } else if (typeof existingReading.signal === 'number') {
          setSignalPercent(existingReading.signal);
          setManualSignalPercent(String(existingReading.signal));
        }
        if (typeof existingReading.speedMbps === 'number') {
          setSpeedMbps(existingReading.speedMbps);
          setManualSpeedMbps(String(existingReading.speedMbps));
        }
        if (existingReading.location) setManualLocation(existingReading.location);
        if (existingReading.notes) setManualNotes(existingReading.notes);
      } else {
        // Fresh modal open: if in Mode A, immediately fetch first reading
        if (result.mode === 'MODE_A_NATIVE') {
          await performSingleNativeMeasurement();
        }
      }
    };

    checkPlatform();
  }, [isOpen, existingReading]);

  // Clean up polling interval
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  // Single measurement query from native bridge
  const performSingleNativeMeasurement = async () => {
    const data: NativeWifiMeasurement | null = await fetchNativeWifiMeasurement();
    if (data && typeof data.rssiDbm === 'number') {
      const calculatedPct = rssiToSignalPercent(data.rssiDbm);
      const finalPct = data.signalPercent ?? calculatedPct;
      setRssiDbm(data.rssiDbm);
      setSignalPercent(finalPct);
      setManualDbm(String(data.rssiDbm));
      setManualSignalPercent(String(finalPct));
      if (data.linkSpeedMbps !== undefined) {
        setSpeedMbps(data.linkSpeedMbps);
        setManualSpeedMbps(String(data.linkSpeedMbps));
      }
      if (data.ssid) setSsid(data.ssid);
      if (data.bssid) setBssid(data.bssid);
      if (data.frequency) setFrequency(String(data.frequency));
      if (data.channel) setChannel(data.channel);
      if (data.connectionType) setConnectionType(data.connectionType);
      if (data.ipAddress) setIpAddress(data.ipAddress);
      if (data.macAddress) setMacAddress(data.macAddress);
      setMeasurementSource('Native WiFi API');
    }
  };

  // Toggle Continuous Real-Time Measurement (#357, #371)
  const handleToggleMeasuring = async () => {
    if (isMeasuring) {
      // Stop measuring
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setIsMeasuring(false);
    } else {
      // Start measuring
      setIsMeasuring(true);
      await performSingleNativeMeasurement();

      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(async () => {
        await performSingleNativeMeasurement();
      }, 1000);
    }
  };

  // Request Permission Handler for Mode B
  const handleAllowPermission = async () => {
    const granted = await requestNativePermission();
    if (granted) {
      setPlatformMode('MODE_A_NATIVE');
      await performSingleNativeMeasurement();
    } else {
      alert('Permission was not granted by the device. You can enter the reading manually or check device app settings.');
    }
  };

  // Switcher for Dev / Test Mode
  const handleSetPlatformMode = async (mode: PlatformMode) => {
    setDevPlatformModeOverride(mode);
    setPlatformMode(mode);
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsMeasuring(false);

    if (mode === 'MODE_A_NATIVE') {
      await performSingleNativeMeasurement();
    }
  };

  // Live calculation of classification badge and bars
  const currentClassification = getSignalClassification(signalPercent, rssiDbm);

  // Manual input synchronization
  const handleManualDbmChange = (val: string) => {
    setManualDbm(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num <= 0 && num >= -120) {
      setRssiDbm(num);
      const calculatedPct = rssiToSignalPercent(num);
      setSignalPercent(calculatedPct);
      setManualSignalPercent(String(calculatedPct));
    }
  };

  const handleManualPercentChange = (val: string) => {
    setManualSignalPercent(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setSignalPercent(num);
    }
  };

  const handleManualSpeedChange = (val: string) => {
    setManualSpeedMbps(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setSpeedMbps(num);
    } else if (val.trim() === '') {
      setSpeedMbps(undefined);
    }
  };

  // Confirm and Return WiFi Reading to Map
  const handleConfirmReading = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    const now = new Date();
    const formattedDate = now.toISOString().split('T')[0];
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fullTimestamp = `${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${formattedTime}`;

    // Derive final values based on whether user entered manually or measured natively
    const finalRssiDbm = subView === 'manual-entry'
      ? (manualDbm.trim() ? parseInt(manualDbm, 10) : undefined)
      : rssiDbm;

    const finalSignalPercent = subView === 'manual-entry'
      ? (manualSignalPercent.trim() ? parseInt(manualSignalPercent, 10) : signalPercent)
      : signalPercent;

    const finalSpeedMbps = subView === 'manual-entry'
      ? (manualSpeedMbps.trim() ? parseFloat(manualSpeedMbps) : undefined)
      : speedMbps;

    const finalClassification = getSignalClassification(finalSignalPercent, finalRssiDbm);

    const result: WifiMeasurementResult = {
      rssiDbm: typeof finalRssiDbm === 'number' && !isNaN(finalRssiDbm) ? finalRssiDbm : undefined,
      signalPercent: typeof finalSignalPercent === 'number' && !isNaN(finalSignalPercent) ? finalSignalPercent : undefined,
      bars: finalClassification.bars,
      classification: finalClassification.classification,
      speedMbps: typeof finalSpeedMbps === 'number' && !isNaN(finalSpeedMbps) ? finalSpeedMbps : undefined,
      ssid: ssid || undefined,
      bssid: bssid || undefined,
      connectionType: connectionType || 'WiFi',
      ipAddress: ipAddress || undefined,
      macAddress: macAddress || bssid || undefined,
      frequency: frequency || undefined,
      channel: channel || undefined,
      measuredAt: fullTimestamp,
      measurementDate: formattedDate,
      measurementTime: formattedTime,
      measurementSource: subView === 'manual-entry' ? 'Field Calibrated Reading' : (measurementSource || 'Native WiFi API'),
      measurementStatus: 'Measured',
      isRssiAvailable: typeof finalRssiDbm === 'number',
      isSpeedAvailable: typeof finalSpeedMbps === 'number',
      notes: subView === 'manual-entry' && manualNotes ? manualNotes : existingReading?.notes,
    };

    onConfirmReading(result);
    onClose();
  };

  // Circular gauge geometry
  // r=72 gives circumference = 2 * PI * 72 ≈ 452.4
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const arcPercentage = 0.75; // 270-degree arc
  const arcLength = circumference * arcPercentage;
  const safePercent = Math.min(100, Math.max(0, signalPercent || 0));
  const strokeDashoffset = arcLength - (arcLength * safePercent) / 100;

  // Signal Category Color Mapping
  const isExcellent = safePercent >= 81 || (typeof rssiDbm === 'number' && rssiDbm >= -55);
  const isModerate = !isExcellent && (safePercent >= 40 || (typeof rssiDbm === 'number' && rssiDbm >= -75));

  const statusBadgeColor = isExcellent
    ? 'bg-emerald-500 text-white'
    : isModerate
    ? 'bg-amber-400 text-amber-950 font-black'
    : 'bg-rose-500 text-white';

  const statusTextColor = isExcellent
    ? 'text-emerald-300'
    : isModerate
    ? 'text-amber-300'
    : 'text-rose-300';

  return (
    <div
      id="modal-wifi-signal-meter-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in"
    >
      <div
        id="modal-wifi-signal-meter-container"
        className="relative flex flex-col w-full max-w-md max-h-[94vh] rounded-3xl shadow-2xl overflow-hidden border border-emerald-500/40 bg-gradient-to-b from-[#009b65] via-[#008053] to-[#01583b] text-white"
      >
        {/* TOP STATUS BAR & HEADER */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/10 text-white/95">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-emerald-200 animate-pulse" />
            <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
              WiFi Signal Meter
            </h2>
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white">
              v1.0.3
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all text-white cursor-pointer"
              title="Close WiFi Signal Meter"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* PLATFORM ARCHITECTURE SELECTOR / DEV SWITCHER */}
        <div className="px-5 py-2 bg-black/20 border-b border-white/10 flex items-center justify-between text-[11px]">
          <span className="text-emerald-100 font-medium flex items-center gap-1">
            <Layers className="h-3 w-3 text-emerald-300" />
            Platform:
          </span>
          <div className="flex items-center gap-1 bg-black/30 p-0.5 rounded-lg border border-white/15">
            <button
              type="button"
              onClick={() => handleSetPlatformMode('MODE_A_NATIVE')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                platformMode === 'MODE_A_NATIVE'
                  ? 'bg-emerald-400 text-emerald-950 shadow-xs'
                  : 'text-emerald-200 hover:text-white'
              }`}
              title="Native Android App / WebView with Hardware WifiManager Bridge"
            >
              Mode A (Native)
            </button>
            <button
              type="button"
              onClick={() => handleSetPlatformMode('MODE_B_PERMISSION_REQUIRED')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                platformMode === 'MODE_B_PERMISSION_REQUIRED'
                  ? 'bg-amber-400 text-amber-950 shadow-xs'
                  : 'text-emerald-200 hover:text-white'
              }`}
              title="Supported device needing location / WiFi permissions"
            >
              Mode B (Perms)
            </button>
            <button
              type="button"
              onClick={() => handleSetPlatformMode('MODE_C_BROWSER')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                platformMode === 'MODE_C_BROWSER'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-emerald-200 hover:text-white'
              }`}
              title="Normal Desktop Web Browser (No hardware RSSI)"
            >
              Mode C (Browser)
            </button>
          </div>
        </div>

        {/* SCROLLABLE MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {/* =========================================================================
              MODE C: NORMAL DESKTOP WEB BROWSER FALLBACK
             ========================================================================= */}
          {platformMode === 'MODE_C_BROWSER' && subView === 'meter' && (
            <div className="rounded-2xl bg-white p-5 shadow-2xl text-slate-800 space-y-4 animate-in fade-in">
              <div className="flex flex-col items-center text-center space-y-2 py-2">
                <div className="h-14 w-14 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center text-amber-600 shadow-inner">
                  <Smartphone className="h-7 w-7" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-900">
                    WiFi Signal Meter
                  </h3>
                  <div className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                    Standard Web Browser Environment
                  </div>
                </div>

                <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-xs pt-1">
                  <strong>Native WiFi measurement is not available in this browser.</strong>
                  <br />
                  For automatic WiFi dBm measurements, open WIFI HITMAP in the supported mobile/native application.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSubView('manual-entry')}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer"
                >
                  <Edit3 className="h-4 w-4" />
                  Enter Reading Manually
                </button>

                <button
                  type="button"
                  onClick={() => handleSetPlatformMode('MODE_A_NATIVE')}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                >
                  <Radio className="h-3.5 w-3.5 text-emerald-600" />
                  Test Native Android Bridge (Mode A)
                </button>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 leading-normal">
                <strong>Data Integrity Guarantee:</strong> Standard browser JavaScript cannot access raw RF chipsets or BSSID/RSSI. WIFI HITMAP never invents fake random measurements.
              </div>
            </div>
          )}

          {/* =========================================================================
              MODE B: SUPPORTED DEVICE BUT PERMISSION REQUIRED
             ========================================================================= */}
          {platformMode === 'MODE_B_PERMISSION_REQUIRED' && subView === 'meter' && (
            <div className="rounded-2xl bg-white p-5 shadow-2xl text-slate-800 space-y-4 animate-in fade-in">
              <div className="flex flex-col items-center text-center space-y-2 py-2">
                <div className="h-14 w-14 rounded-full bg-emerald-50 border-2 border-emerald-300 flex items-center justify-center text-emerald-600 shadow-inner">
                  <ShieldAlert className="h-7 w-7 text-amber-500" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-900">
                    WiFi Signal Meter
                  </h3>
                  <div className="inline-block px-3 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    Permission Required
                  </div>
                </div>

                <p className="text-xs text-slate-700 font-medium leading-relaxed max-w-xs pt-1">
                  WIFI HITMAP needs permission to read the device&apos;s current WiFi signal information.
                </p>
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleAllowPermission}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Allow Permission
                </button>

                <button
                  type="button"
                  onClick={() => setSubView('manual-entry')}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Enter Reading Manually
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              MODE A: REAL NATIVE WIFI SIGNAL METER
             ========================================================================= */}
          {platformMode === 'MODE_A_NATIVE' && subView === 'meter' && (
            <div className="space-y-4">
              {/* LIVE LUMINOUS SIGNAL GAUGE (#355, #357, #360) */}
              <div className="relative flex flex-col items-center justify-center pt-1 pb-2">
                <div className="relative flex items-center justify-center w-52 h-52 sm:w-56 sm:h-56">
                  <svg className="w-full h-full transform -rotate-135" viewBox="0 0 180 180">
                    {/* Background Track */}
                    <circle
                      cx="90"
                      cy="90"
                      r={radius}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.18)"
                      strokeWidth="14"
                      strokeDasharray={`${arcLength} ${circumference}`}
                      strokeLinecap="round"
                    />
                    {/* Active Glowing Progress Track */}
                    <circle
                      cx="90"
                      cy="90"
                      r={radius}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="14"
                      strokeDasharray={`${arcLength} ${circumference}`}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      className="transition-all duration-500 ease-out drop-shadow-[0_0_14px_rgba(255,255,255,0.85)]"
                    />
                  </svg>

                  {/* Gauge Center Telemetry */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">
                      Estimated Signal Strength
                    </span>
                    <span className="text-5xl sm:text-6xl font-black tracking-tighter text-white drop-shadow-md my-0.5 font-mono">
                      {safePercent}%
                    </span>
                    <span className="text-xl sm:text-2xl font-black tracking-tight text-white drop-shadow-xs font-mono">
                      {typeof rssiDbm === 'number' ? `${rssiDbm} dBm` : '-- dBm'}
                    </span>
                  </div>
                </div>

                {/* Status Category Badge */}
                <div className="mt-1 flex items-center justify-center">
                  <span className={`px-4 py-1 rounded-full text-xs font-black tracking-wider uppercase shadow-md ${statusBadgeColor}`}>
                    {currentClassification.classification}
                  </span>
                </div>

                {/* User Movement Guidance Strip */}
                <div className="flex items-center gap-1.5 text-xs text-white/95 font-medium mt-3 text-center">
                  <Info className="h-3.5 w-3.5 text-emerald-200 shrink-0" />
                  <span>Move around the area to measure WiFi signal strength.</span>
                </div>
              </div>

              {/* REAL-TIME MEASUREMENT CONTROLS & TELEMETRY */}
              <div className="rounded-2xl bg-white p-4 shadow-xl text-slate-900 border border-emerald-200 space-y-3">
                {/* Measuring Button & Indicator */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleMeasuring}
                      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-black text-xs shadow-xs transition-all cursor-pointer ${
                        isMeasuring
                          ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {isMeasuring ? (
                        <>
                          <Square className="h-3.5 w-3.5 fill-current" />
                          Stop Measuring
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-current" />
                          Start Measuring
                        </>
                      )}
                    </button>
                    <span className="text-[11px] font-bold text-slate-500">
                      {isMeasuring ? 'Live updating...' : 'Ready'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSubView('manual-entry')}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="h-3 w-3" />
                    Edit Manually
                  </button>
                </div>

                {/* Telemetry Metric Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="block text-[10px] uppercase font-bold text-slate-500">RSSI</span>
                    <span className="text-base font-black font-mono text-[#ff3366]">
                      {typeof rssiDbm === 'number' ? `${rssiDbm} dBm` : 'Measuring...'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Link Speed</span>
                    <span className="text-base font-black font-mono text-blue-700">
                      {typeof speedMbps === 'number' ? `${speedMbps} Mbps` : 'N/A'}
                    </span>
                  </div>

                  {ssid && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="block text-[10px] uppercase font-bold text-slate-500">SSID</span>
                      <span className="text-xs font-bold text-slate-800 truncate block font-mono">
                        {ssid}
                      </span>
                    </div>
                  )}

                  {bssid && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="block text-[10px] uppercase font-bold text-slate-500">BSSID / MAC</span>
                      <span className="text-xs font-mono text-slate-700 truncate block">
                        {bssid}
                      </span>
                    </div>
                  )}

                  {frequency && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="block text-[10px] uppercase font-bold text-slate-500">Frequency / Band</span>
                      <span className="text-xs font-bold text-slate-800 font-mono">
                        {frequency}
                      </span>
                    </div>
                  )}

                  {channel && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="block text-[10px] uppercase font-bold text-slate-500">Channel</span>
                      <span className="text-xs font-bold text-slate-800 font-mono">
                        CH {channel}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Source Transparency Card */}
              <div className="rounded-xl bg-black/25 border border-white/20 p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                    Hardware Source
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white">
                    Native WiFi API
                  </span>
                </div>
                <p className="text-[11px] text-emerald-100/90 leading-tight">
                  Direct hardware measurements obtained from device RF chipset. Zero fabricated or estimated dummy numbers.
                </p>
              </div>
            </div>
          )}

          {/* =========================================================================
              MANUAL ENTRY FORM (Accessible in Mode C or via button)
             ========================================================================= */}
          {subView === 'manual-entry' && (
            <div className="rounded-2xl bg-white p-5 shadow-2xl text-slate-800 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Manual WiFi Survey Entry
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Input readings from phone or handheld RF meter
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSubView('meter')}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                >
                  Return to Meter
                </button>
              </div>

              {/* Live Preview Strip */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-mono font-black text-sm">
                    {safePercent}%
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-800 block">
                      {typeof rssiDbm === 'number' ? `${rssiDbm} dBm` : '-- dBm'}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      {currentClassification.classification}
                    </span>
                  </div>
                </div>

                {speedMbps !== undefined && (
                  <span className="text-xs font-black font-mono text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                    {speedMbps} Mbps
                  </span>
                )}
              </div>

              {/* Form Fields */}
              <div className="space-y-3 text-xs">
                {/* RSSI & Signal % */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Signal RSSI (dBm) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="-120"
                        max="-20"
                        value={manualDbm}
                        onChange={(e) => handleManualDbmChange(e.target.value)}
                        placeholder="-57"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="absolute right-2.5 top-2 text-[10px] font-bold text-slate-400">
                        dBm
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Estimated Signal (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={manualSignalPercent}
                        onChange={(e) => handleManualPercentChange(e.target.value)}
                        placeholder="78"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="absolute right-2.5 top-2 text-[10px] font-bold text-slate-400">
                        %
                      </span>
                    </div>
                  </div>
                </div>

                {/* Speed Mbps */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Throughput Speed (Mbps) <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={manualSpeedMbps}
                      onChange={(e) => handleManualSpeedChange(e.target.value)}
                      placeholder="72"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-2.5 top-2 text-[10px] font-bold text-slate-400">
                      Mbps
                    </span>
                  </div>
                </div>

                {/* Location Description */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Survey Location <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    placeholder="e.g. Sales Aisle 3 / Checkout Counter"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Survey Notes <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    placeholder="Observation notes, obstruction details, etc."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="p-4 bg-black/35 border-t border-white/15 space-y-2">
          <div className="flex items-center gap-2">
            {/* If in Mode A or Manual Entry, provide the main Confirm / Use Reading button */}
            {(platformMode === 'MODE_A_NATIVE' || subView === 'manual-entry') ? (
              <button
                type="button"
                onClick={handleConfirmReading}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-black text-sm shadow-xl transition-all active:scale-98 cursor-pointer"
              >
                <Check className="h-4 w-4 stroke-[3]" />
                {mode === 'remeasure' ? 'Update Reading' : 'Use This Reading'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSubView('manual-entry')}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-black text-sm shadow-xl transition-all active:scale-98 cursor-pointer"
              >
                <Edit3 className="h-4 w-4" />
                Enter Reading Manually
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-emerald-100 px-1 pt-1">
            <span>
              Hardware Source: <strong className="text-white font-mono">{subView === 'manual-entry' ? 'Manual Calibrated' : (isRealNativeBridge ? bridgeName : 'Native Bridge')}</strong>
            </span>
            <span className="font-mono text-emerald-200">
              {safePercent}% • {typeof rssiDbm === 'number' ? `${rssiDbm} dBm` : '0 dBm'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
