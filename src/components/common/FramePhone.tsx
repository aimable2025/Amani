import React, { createContext, useContext, useEffect, useState } from 'react';
import { BatteryCharging, Signal, Wifi, WifiOff } from 'lucide-react';

export type ViewportDisplayMode = 'phone' | 'desktop';

interface ViewportModeContextValue {
  displayMode: ViewportDisplayMode;
  setDisplayMode: (mode: ViewportDisplayMode) => void;
  toggleDisplayMode: () => void;
}

const ViewportModeContext = createContext<ViewportModeContextValue>({
  displayMode: 'desktop',
  setDisplayMode: () => {},
  toggleDisplayMode: () => {},
});

export const useViewportMode = () => useContext(ViewportModeContext);

const VIEWPORT_MODE_STORAGE_KEY = 'ets_amani_viewport_display_mode_v2';

export interface FramePhoneProps {
  children: React.ReactNode;
  appName?: string;
}

export const FramePhone: React.FC<FramePhoneProps> = ({
  children,
  appName = 'Ets AMANI',
}) => {
  const [displayMode, setDisplayModeState] = useState<ViewportDisplayMode>(() => {
    try {
      const saved = localStorage.getItem(VIEWPORT_MODE_STORAGE_KEY);
      if (saved === 'desktop' || saved === 'phone') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'desktop';
  });

  const setDisplayMode = (mode: ViewportDisplayMode) => {
    setDisplayModeState(mode);
    try {
      localStorage.setItem(VIEWPORT_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const toggleDisplayMode = () => {
    setDisplayMode(displayMode === 'phone' ? 'desktop' : 'phone');
  };

  const [currentTime, setCurrentTime] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };

    const timer = setInterval(updateClock, 15000);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isDesktopFullscreen = displayMode === 'desktop';

  return (
    <ViewportModeContext.Provider
      value={{ displayMode, setDisplayMode, toggleDisplayMode }}
    >
      <div
        className={
          isDesktopFullscreen
            ? 'min-h-screen w-full bg-[var(--app-bg)] text-[var(--app-text)] flex flex-col'
            : 'min-h-screen w-full bg-slate-950 flex items-center justify-center sm:py-6 sm:px-4'
        }
      >
        {isDesktopFullscreen ? (
          <div className="relative flex-1 w-full min-h-screen flex flex-col bg-[var(--app-bg)] text-[var(--app-text)]">
            {children}
          </div>
        ) : (
          <div className="relative w-full h-dvh sm:h-[min(860px,93vh)] sm:w-[420px] sm:max-w-[420px] flex flex-col">
            <div className="relative w-full h-full flex flex-col sm:rounded-[44px] sm:p-[10px] sm:bg-slate-800 sm:shadow-2xl sm:ring-1 sm:ring-white/15">
              <div className="relative w-full h-full flex flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)] sm:rounded-[34px]">
                <div className="no-print hidden sm:flex relative w-full h-10 bg-slate-950 text-white px-5 items-center justify-between text-[11px] font-semibold select-none shrink-0 z-[80] border-b border-white/10">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="tabular-nums font-bold tracking-tight text-white">
                      {currentTime}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="truncate text-[10px] font-medium text-slate-300 max-w-[90px]">
                      {appName}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-200">
                    <Signal className="h-3 w-3 text-slate-300" />
                    {isOnline ? (
                      <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                    )}
                    <BatteryCharging className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                </div>

                <div className="relative flex-1 w-full overflow-hidden flex flex-col [transform:translateZ(0)]">
                  <div className="flex-1 w-full overflow-y-auto overflow-x-hidden bg-[var(--app-bg)] text-[var(--app-text)] relative flex flex-col">
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ViewportModeContext.Provider>
  );
};

export default FramePhone;
