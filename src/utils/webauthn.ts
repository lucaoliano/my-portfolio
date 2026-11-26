export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  const base64String = btoa(str);
  return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64urlToBuffer(base64url: string): ArrayBuffer {
  const padding = '==='.slice((base64url.length + 3) % 4);
  const base64String = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const str = atob(base64String);
  const buffer = new ArrayBuffer(str.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return buffer;
}

export function generateRandomChallenge(): Uint8Array {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge;
}

export const webAuthnSupported = async () => {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false;
  }
  if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }
  return true;
};

export const registerWebAuthnPasskey = async (
  userId: string = 'user',
  userEmail: string = 'user@myportfolio.app',
  userDisplayName: string = 'Utente Portfolio'
): Promise<string | null> => {
  try {
    const isSupported = await webAuthnSupported();
    if (!isSupported) return null;

    const challenge = generateRandomChallenge();
    const userIdBuffer = new TextEncoder().encode(userId);

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: challenge.buffer as ArrayBuffer,
        rp: {
          name: 'My Portfolio',
          id: window.location.hostname
        },
        user: {
          id: userIdBuffer,
          name: userEmail,
          displayName: userDisplayName
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },  // ES256
          { type: 'public-key', alg: -257 } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
        attestation: 'none'
      }
    })) as PublicKeyCredential | null;

    if (credential && credential.rawId) {
      return bufferToBase64url(credential.rawId);
    }
    return null;
  } catch (error) {
    console.error('WebAuthn Registration Error:', error);
    return null;
  }
};

export const verifyWebAuthnPasskey = async (credentialIdBase64: string): Promise<boolean> => {
  try {
    const isSupported = await webAuthnSupported();
    if (!isSupported) return false;

    const challenge = generateRandomChallenge();
    const credentialIdBuffer = base64urlToBuffer(credentialIdBase64);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge.buffer as ArrayBuffer,
        allowCredentials: [{
          type: 'public-key',
          id: credentialIdBuffer,
        }],
        userVerification: 'required',
        timeout: 60000,
      }
    });

    return !!assertion;
  } catch (error) {
    console.error('WebAuthn Verification Error:', error);
    return false;
  }
};
