import { useEffect, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useVisitStore } from '../stores/visitStore';
import { processPendingUploads } from '../lib/upload';

const SYNC_DEBOUNCE_MS = 2000; // Wait 2 seconds after reconnect before syncing

export function useOfflineSync() {
  const { isOnline, setOnline, pendingUploads, isSyncing, setSyncing } = useVisitStore();
  const wasOfflineRef = useRef(!isOnline);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const nowOnline = state.isConnected === true && state.isInternetReachable !== false;

      // Track if we were offline
      if (!nowOnline) {
        wasOfflineRef.current = true;
      }

      // Update store
      setOnline(nowOnline);

      // If we just came back online and have pending uploads, schedule sync
      if (nowOnline && wasOfflineRef.current && pendingUploads.length > 0 && !isSyncing) {
        // Clear any existing timeout
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }

        // Debounce the sync to avoid rapid retries during flaky connections
        syncTimeoutRef.current = setTimeout(async () => {
          console.log('[OfflineSync] Reconnected, processing pending uploads...');
          setSyncing(true);

          try {
            await processPendingUploads();
            console.log('[OfflineSync] Pending uploads processed');
          } catch (error) {
            console.error('[OfflineSync] Error processing pending uploads:', error);
          } finally {
            setSyncing(false);
            wasOfflineRef.current = false;
          }
        }, SYNC_DEBOUNCE_MS);
      }
    });

    // Check initial state
    NetInfo.fetch().then((state) => {
      const nowOnline = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(nowOnline);

      // Process pending uploads if online at startup
      if (nowOnline && pendingUploads.length > 0 && !isSyncing) {
        console.log('[OfflineSync] App started online with pending uploads, syncing...');
        setSyncing(true);
        processPendingUploads()
          .catch((error) => {
            console.error('[OfflineSync] Error processing pending uploads at startup:', error);
          })
          .finally(() => {
            setSyncing(false);
          });
      }
    });

    return () => {
      unsubscribe();
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [pendingUploads.length]); // Re-run when pending uploads change

  return { isOnline, isSyncing, pendingCount: pendingUploads.length };
}
