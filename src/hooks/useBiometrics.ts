import { useState, useEffect, useCallback } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { webAuthnSupported, registerWebAuthnPasskey, verifyWebAuthnPasskey } from '../utils/webauthn';
import { auth } from '../config/firebase';

const getBiometricKey = (uid: string) => `@biometric_enabled_${uid}`;
const getWebauthnIdKey = (uid: string) => `@webauthn_credential_id_${uid}`;

export function useBiometrics(userId?: string) {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const activeUserId = userId ?? auth.currentUser?.uid;

  const authenticate = useCallback(async (promptMessage = 'Sblocca per accedere ai tuoi dati'): Promise<boolean> => {
    try {
      const currentUid = userId ?? auth.currentUser?.uid;
      if (!currentUid) return false;

      if (Platform.OS === 'web') {
        const credentialId = await AsyncStorage.getItem(getWebauthnIdKey(currentUid));
        if (!credentialId) return false;
        return await verifyWebAuthnPasskey(credentialId);
      } else {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!compatible || !enrolled) return false;

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage,
          fallbackLabel: 'Usa il codice del dispositivo',
          cancelLabel: 'Annulla',
          disableDeviceFallback: false,
        });
        return result.success;
      }
    } catch (error) {
      console.error('Error during biometric auth:', error);
      return false;
    }
  }, [userId]);

  useEffect(() => {
    let isMounted = true;

    const checkSupportAndLoadState = async () => {
      try {
        if (Platform.OS === 'web') {
          const supported = await webAuthnSupported();
          if (isMounted) setIsSupported(supported);
        } else {
          const compatible = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          if (isMounted) setIsSupported(compatible && enrolled);
        }

        // Clean up legacy global keys to prevent security leaks from older versions
        try {
          await AsyncStorage.multiRemove(['@biometric_enabled', '@webauthn_credential_id']);
        } catch {
          // ignore cleanup error
        }

        const currentUid = userId ?? auth.currentUser?.uid;
        if (!currentUid) {
          if (isMounted) {
            setIsEnabled(false);
          }
          return;
        }

        const savedState = await AsyncStorage.getItem(getBiometricKey(currentUid));
        if (isMounted) {
          setIsEnabled(savedState === 'true');
        }
      } catch (error) {
        console.error('Error checking biometric support and state:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    checkSupportAndLoadState();

    return () => {
      isMounted = false;
    };
  }, [userId, activeUserId]);

  const toggleBiometric = async (value: boolean) => {
    try {
      const currentUid = userId ?? auth.currentUser?.uid;
      if (!currentUid) return false;

      const user = auth.currentUser;
      const bioKey = getBiometricKey(currentUid);
      const webauthnKey = getWebauthnIdKey(currentUid);

      if (value) {
        if (Platform.OS === 'web') {
          // On Web, register a new passkey tied to this user
          const userEmail = user?.email || 'user@myportfolio.app';
          const userDisplayName = user?.displayName || userEmail.split('@')[0];
          
          const credentialId = await registerWebAuthnPasskey(currentUid, userEmail, userDisplayName);
          if (!credentialId) return false;
          await AsyncStorage.setItem(webauthnKey, credentialId);
        } else {
          // On Native, require authentication before enabling it
          const authResult = await authenticate('Autenticati per abilitare lo sblocco biometrico');
          if (!authResult) return false;
        }
      } else {
        if (Platform.OS === 'web') {
          await AsyncStorage.removeItem(webauthnKey);
        }
      }
      
      await AsyncStorage.setItem(bioKey, value.toString());
      setIsEnabled(value);
      return true;
    } catch (error) {
      console.error('Error saving biometric state:', error);
      return false;
    }
  };

  return {
    isSupported,
    isEnabled,
    isLoading,
    toggleBiometric,
    authenticate
  };
}

