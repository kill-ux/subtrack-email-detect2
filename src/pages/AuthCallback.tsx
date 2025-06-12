import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const AuthCallback = () => {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Processing authorization...');
  const [debugInfo, setDebugInfo] = useState<any>({});
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state'); // This should be the user ID
      const error = urlParams.get('error');

      // Set initial debug info
      setDebugInfo({
        code: code ? 'Present' : 'Missing',
        state: state || 'Missing',
        error: error || 'None',
        currentUser: user?.uid || 'Not logged in'
      });

      if (error) {
        setError(`Authorization failed: ${error}`);
        return;
      }

      if (!code) {
        setError('No authorization code received from Google');
        return;
      }

      if (!user) {
        setError('No user found. Please sign in first.');
        return;
      }

      // Verify state parameter matches current user
      if (state && state !== user.uid) {
        setError('Security error: State parameter mismatch');
        return;
      }

      try {
        setStatus('Exchanging authorization code for access tokens...');
        
        // Google OAuth 2.0 client credentials
        const clientId = '616003184852-2sjlhqid5sfme4lg3q3n1c6bc14sc7tv.apps.googleusercontent.com';
        const clientSecret = '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';
        const redirectUri = `${window.location.origin}/auth/callback`;

        // Exchange authorization code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }),
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.text();
          throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorData}`);
        }

        const tokens = await tokenResponse.json();
        
        setStatus('Saving tokens to Firebase database...');
        
        // Get current user data to preserve existing fields
        const userDocRef = doc(db, "users", user.uid);
        const existingUserDoc = await getDoc(userDocRef);
        const existingData = existingUserDoc.exists() ? existingUserDoc.data() : {};

        // Prepare the complete user document with Gmail tokens
        const userDocumentData = {
          // Preserve existing user data
          ...existingData,
          
          // User identification
          userId: user.uid,
          email: user.email,
          displayName: user.displayName || null,
          
          // Gmail authorization status
          gmailAuthorized: true,
          authInProgress: false,
          authCompletedAt: new Date().toISOString(),
          
          // Store the authorization code (for reference)
          gmailAuthCode: code,
          
          // Store the complete token object
          gmailTokens: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            scope: tokens.scope,
            token_type: tokens.token_type,
            expires_in: tokens.expires_in,
            expires_at: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
            obtained_at: new Date().toISOString()
          },
          
          // Metadata
          updatedAt: new Date().toISOString(),
          lastTokenRefresh: new Date().toISOString()
        };

        // Save to Firebase with user ID as document ID
        await setDoc(userDocRef, userDocumentData, { merge: true });

        setStatus('Verifying token storage...');
        
        // Verify the data was saved correctly
        const verificationDoc = await getDoc(userDocRef);
        if (!verificationDoc.exists()) {
          throw new Error('Failed to verify token storage');
        }

        const savedData = verificationDoc.data();
        if (!savedData.gmailTokens?.access_token) {
          throw new Error('Access token not found after saving');
        }

        setDebugInfo(prev => ({
          ...prev,
          tokensSaved: 'Success',
          accessTokenLength: savedData.gmailTokens.access_token.length,
          hasRefreshToken: !!savedData.gmailTokens.refresh_token,
          expiresAt: savedData.gmailTokens.expires_at
        }));

        setStatus('Authorization complete! Redirecting to dashboard...');
        
        console.log('✅ Gmail authorization completed successfully');
        console.log('📊 User document structure:', {
          userId: user.uid,
          path: `users/${user.uid}`,
          gmailAuthorized: true,
          tokenFields: Object.keys(savedData.gmailTokens || {})
        });
        
        // Redirect back to dashboard after a short delay
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
        
      } catch (err) {
        console.error('❌ Error handling auth callback:', err);
        setError(`Failed to complete authorization: ${err instanceof Error ? err.message : 'Unknown error'}`);
        
        // Update debug info with error
        setDebugInfo(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Unknown error'
        }));
      }
    };

    handleCallback();
  }, [navigate, user]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Authorization Error</h1>
            <p className="text-red-700 mb-4">{error}</p>
            
            {/* Debug Information */}
            <div className="text-left bg-red-100 p-3 rounded text-xs">
              <p><strong>Debug Info:</strong></p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="text-center max-w-md mx-auto p-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Connecting Gmail</h1>
            <p className="text-gray-600 mb-4">{status}</p>
          </div>
          
          <div className="space-y-2 text-sm text-gray-500 mb-6">
            <p>✓ Securing your connection</p>
            <p>✓ Validating permissions</p>
            <p>✓ Setting up email scanning</p>
            <p>✓ Storing tokens securely</p>
          </div>

          {/* Debug Information */}
          {Object.keys(debugInfo).length > 0 && (
            <div className="text-left bg-gray-100 p-3 rounded text-xs">
              <p><strong>Process Info:</strong></p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;