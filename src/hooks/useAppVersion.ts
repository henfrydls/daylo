import { useState, useEffect } from 'react'

/**
 * Hook to get the app version.
 * Uses Tauri API when running as desktop app, falls back to package.json version for web/dev mode.
 */
export function useAppVersion(): string {
  const [version, setVersion] = useState<string>(__APP_VERSION__)

  useEffect(() => {
    // Try to get version from Tauri API (only available in desktop app)
    const getTauriVersion = async () => {
      try {
        // Dynamic import to avoid errors in web mode
        const { getVersion } = await import('@tauri-apps/api/app')
        const tauriVersion = await getVersion()
        setVersion(tauriVersion)
      } catch {
        // Not running in Tauri, use the fallback version from package.json
        // This is expected in web/dev mode
      }
    }

    getTauriVersion()
  }, [])

  return version
}
