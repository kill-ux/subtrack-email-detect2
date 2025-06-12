import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const AuthCallback = () => {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Processing authorization...');
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      if (error) {
        setError(`Authorization failed: ${error}`);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        return;
      }

      if (!user) {
        setError('No user found');
        return;
      }

      try {
        setStatus('Exchanging authorization code for tokens...');
        
        // Exchange authorization code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: '616003184852-2sjlhqid5sfme4lg3q3n1c6bc14sc7tv.apps.googleusercontent.com',
            client_secret: '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',
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: `${window.location.origin}/auth/callback`,
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to exchange authorization code');
        }

        const tokens = await tokenResponse.json();
        
        setStatus('Saving authorization...');
        
        // Store the tokens in Firestore
        await setDoc(doc(db, "users", user.uid), {
          gmailAuthorized: true,
          gmailAuthCode: code,
          gmailTokens: tokens,
          authInProgress: false,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        setStatus('Authorization complete! Redirecting...');
        
        // Redirect back to dashboard
        setTimeout(() => {
          navigate('/dashboard');
        }, 1000);
      } catch (err) {
        console.error('Error handling auth callback:', err);
        setError('Failed to complete authorization');
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
            <p className="text-red-700">{error}</p>
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
            <p className="text-gray-600">{status}</p>
          </div>
          
          <div className="space-y-2 text-sm text-gray-500">
            <p>✓ Securing your connection</p>
            <p>✓ Validating permissions</p>
            <p>✓ Setting up email scanning</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;