import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, Shield, Key, Database } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/use-toast";

interface GmailAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GmailAuthDialog({ open, onOpenChange }: GmailAuthDialogProps) {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleGmailAuth = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in first",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    try {
      // Google OAuth 2.0 configuration
      const clientId = "616003184852-2sjlhqid5sfme4lg3q3n1c6bc14sc7tv.apps.googleusercontent.com";
      const redirectUri = `${window.location.origin}/auth/callback`;
      const scope = "https://www.googleapis.com/auth/gmail.readonly";
      
      // Create authorization URL with user ID as state parameter
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${user.uid}`; // Pass user ID as state parameter
      
      // Store initial auth state in Firebase with user ID as document ID
      await setDoc(doc(db, "users", user.uid), {
        // User identification
        userId: user.uid,
        email: user.email,
        
        // Gmail authorization status
        gmailAuthorized: false,
        authInProgress: true,
        authStartedAt: new Date().toISOString(),
        
        // Metadata
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      console.log(`🔐 Starting Gmail auth for user: ${user.uid}`);
      console.log(`📧 User email: ${user.email}`);
      console.log(`🔗 Redirect URI: ${redirectUri}`);
      
      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error("Gmail auth error:", error);
      toast({
        title: "Authentication Error",
        description: "Failed to start Gmail authentication",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Connect Gmail Account
          </DialogTitle>
          <DialogDescription>
            Allow SubTracker to scan your emails for subscriptions. We only need read access to detect your active subscriptions and will never send emails on your behalf.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-6 py-4">
          {/* Security Information */}
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <Shield className="h-5 w-5 text-blue-500" />
              <div className="flex-1">
                <h4 className="font-medium text-sm">Read-only Access</h4>
                <p className="text-xs text-muted-foreground">
                  We never store your emails or send emails on your behalf
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <Key className="h-5 w-5 text-green-500" />
              <div className="flex-1">
                <h4 className="font-medium text-sm">Secure Token Storage</h4>
                <p className="text-xs text-muted-foreground">
                  Tokens are encrypted and linked to your user ID
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <Database className="h-5 w-5 text-purple-500" />
              <div className="flex-1">
                <h4 className="font-medium text-sm">Data Structure</h4>
                <p className="text-xs text-muted-foreground">
                  Stored in Firebase: users/{user?.uid}/gmailTokens
                </p>
              </div>
            </div>
          </div>
          
          {/* What we detect */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>What we detect:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
              <li>Subscription receipts and invoices</li>
              <li>Billing amounts and cycles (monthly, yearly, weekly)</li>
              <li>Service names and categories</li>
              <li>Next payment dates</li>
              <li>StackBlitz and other development tool subscriptions</li>
            </ul>
          </div>
          
          {/* User ID Display */}
          {user && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Your User ID:</strong> {user.uid}
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Email:</strong> {user.email}
              </p>
            </div>
          )}
          
          <Button
            onClick={handleGmailAuth}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600"
            disabled={loading}
          >
            {loading ? "Connecting..." : "Connect Gmail"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}