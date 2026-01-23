import { useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useVisitStore } from '../stores/visitStore';

export function useNetworkState() {
  const { isOnline, setOnline } = useVisitStore();

  useEffect(() => {
    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(online);
    });

    // Check initial state
    NetInfo.fetch().then((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(online);
    });

    return () => {
      unsubscribe();
    };
  }, [setOnline]);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable !== false;
  }, []);

  return { isOnline, checkConnection };
}
