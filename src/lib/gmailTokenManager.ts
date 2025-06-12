import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface GmailTokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
  obtained_at: string;
}

export interface UserGmailData {
  userId: string;
  email: string;
  displayName?: string;
  gmailAuthorized: boolean;
  authInProgress: boolean;
  authCompletedAt?: string;
  gmailAuthCode?: string;
  gmailTokens?: GmailTokens;
  updatedAt: string;
  lastTokenRefresh?: string;
}

export class GmailTokenManager {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Get Gmail tokens for the user from Firebase
   * Document path: users/{userId}
   */
  async getTokens(): Promise<GmailTokens | null> {
    try {
      const userDocRef = doc(db, 'users', this.userId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.error(`❌ User document not found for ID: ${this.userId}`);
        return null;
      }

      const userData = userDoc.data() as UserGmailData;
      
      if (!userData.gmailAuthorized) {
        console.error(`❌ Gmail not authorized for user: ${this.userId}`);
        return null;
      }

      if (!userData.gmailTokens) {
        console.error(`❌ No Gmail tokens found for user: ${this.userId}`);
        return null;
      }

      console.log(`✅ Retrieved Gmail tokens for user: ${this.userId}`);
      return userData.gmailTokens;
    } catch (error) {
      console.error('❌ Error getting Gmail tokens:', error);
      return null;
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidAccessToken(): Promise<string | null> {
    try {
      const tokens = await this.getTokens();
      if (!tokens) {
        return null;
      }

      // Check if token is expired
      const expiresAt = new Date(tokens.expires_at);
      const now = new Date();
      const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

      if (expiresAt.getTime() - now.getTime() > bufferTime) {
        // Token is still valid
        console.log(`✅ Access token is valid for user: ${this.userId}`);
        return tokens.access_token;
      }

      // Token is expired or about to expire, refresh it
      console.log(`🔄 Access token expired for user: ${this.userId}, refreshing...`);
      const newTokens = await this.refreshTokens(tokens.refresh_token);
      
      if (newTokens) {
        return newTokens.access_token;
      }

      return null;
    } catch (error) {
      console.error('❌ Error getting valid access token:', error);
      return null;
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshTokens(refreshToken: string): Promise<GmailTokens | null> {
    try {
      const clientId = '616003184852-2sjlhqid5sfme4lg3q3n1c6bc14sc7tv.apps.googleusercontent.com';
      const clientSecret = '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';

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Token refresh failed:', response.status, errorData);
        return null;
      }

      const newTokenData = await response.json();
      
      // Create new tokens object
      const newTokens: GmailTokens = {
        access_token: newTokenData.access_token,
        refresh_token: refreshToken, // Keep the original refresh token
        scope: newTokenData.scope || 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: newTokenData.token_type || 'Bearer',
        expires_in: newTokenData.expires_in,
        expires_at: new Date(Date.now() + (newTokenData.expires_in * 1000)).toISOString(),
        obtained_at: new Date().toISOString()
      };

      // Update tokens in Firebase
      await this.saveTokens(newTokens);
      
      console.log(`✅ Tokens refreshed successfully for user: ${this.userId}`);
      return newTokens;
    } catch (error) {
      console.error('❌ Error refreshing tokens:', error);
      return null;
    }
  }

  /**
   * Save tokens to Firebase
   */
  async saveTokens(tokens: GmailTokens): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', this.userId);
      
      await updateDoc(userDocRef, {
        gmailTokens: tokens,
        lastTokenRefresh: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ Tokens saved successfully for user: ${this.userId}`);
    } catch (error) {
      console.error('❌ Error saving tokens:', error);
      throw error;
    }
  }

  /**
   * Check if user has Gmail authorization
   */
  async isGmailAuthorized(): Promise<boolean> {
    try {
      const userDocRef = doc(db, 'users', this.userId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        return false;
      }

      const userData = userDoc.data() as UserGmailData;
      return userData.gmailAuthorized === true && !!userData.gmailTokens;
    } catch (error) {
      console.error('❌ Error checking Gmail authorization:', error);
      return false;
    }
  }

  /**
   * Revoke Gmail authorization
   */
  async revokeAuthorization(): Promise<void> {
    try {
      const tokens = await this.getTokens();
      
      if (tokens) {
        // Revoke the token with Google
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, {
          method: 'POST'
        });
      }

      // Update Firebase document
      const userDocRef = doc(db, 'users', this.userId);
      await updateDoc(userDocRef, {
        gmailAuthorized: false,
        gmailTokens: null,
        gmailAuthCode: null,
        authInProgress: false,
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ Gmail authorization revoked for user: ${this.userId}`);
    } catch (error) {
      console.error('❌ Error revoking authorization:', error);
      throw error;
    }
  }

  /**
   * Get user's Gmail authorization status and metadata
   */
  async getAuthStatus(): Promise<UserGmailData | null> {
    try {
      const userDocRef = doc(db, 'users', this.userId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        return null;
      }

      return userDoc.data() as UserGmailData;
    } catch (error) {
      console.error('❌ Error getting auth status:', error);
      return null;
    }
  }
}