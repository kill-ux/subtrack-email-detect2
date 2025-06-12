import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Shield, Key, Database, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/use-toast";

interface EmailSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function EmailSetupDialog({ open, onOpenChange, onComplete }: EmailSetupDialogProps) {
  const [emailAddress, setEmailAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleEmailSetup = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in first",
        variant: "destructive"
      });
      return;
    }

    if (!emailAddress || !emailAddress.includes('@')) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
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
      
      // Create authorization URL with user ID and email as state parameters
      const state = JSON.stringify({
        userId: user.uid,
        targetEmail: emailAddress
      });
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `login_hint=${encodeURIComponent(emailAddress)}&` +
        `state=${encodeURIComponent(state)}`;
      
      // Store initial setup state in Firebase
      await setDoc(doc(db, "users", user.uid), {
        // User identification
        userId: user.uid,
        authUserEmail: user.email, // The email used for authentication
        
        // Target email for Gmail access
        targetEmail: emailAddress,
        emailSetupInProgress: true,
        emailSetupStartedAt: new Date().toISOString(),
        
        // Gmail authorization status
        gmailAuthorized: false,
        
        // Metadata
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      console.log(`🔐 Starting Gmail setup for user: ${user.uid}`);
      console.log(`📧 Auth email: ${user.email}`);
      console.log(`📬 Target email: ${emailAddress}`);
      console.log(`🔗 Redirect URI: ${redirectUri}`);
      
      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error("Email setup error:", error);
      toast({
        title: "Setup Error",
        description: "Failed to start email setup process",
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
            Setup Email Access
          </DialogTitle>
          <DialogDescription>
            Enter the Gmail address you want to scan for subscriptions. This can be different from your login email.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-6 py-4">
          {/* Email Input */}
          <div className="space-y-2">
            <Label htmlFor="targetEmail">Gmail Address to Scan</Label>
            <Input
              id="targetEmail"
              type="email"
              placeholder="example@gmail.com"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              disabled={loading}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              This is the Gmail account we'll scan for subscription emails
            </p>
          </div>

          {/* Security Information */}
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <Shield className="h-5 w-5 text-blue-500" />
              <div className="flex-1">
                <h4 className="font-medium text-sm">Read-only Access</h4>
                <p className="text-xs text-muted-foreground">
                  We only read emails, never send or modify anything
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <Key className="h-5 w-5 text-green-500" />
              <div className="flex-1">
                <h4 className="font-medium text-sm">Secure Token Storage</h4>
                <p className="text-xs text-muted-foreground">
                  Access tokens are encrypted and linked to your account
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <Database className="h-5 w-5 text-purple-500" />
              <div className="flex-1">
                <h4 className="font-medium text-sm">Data Structure</h4>
                <p className="text-xs text-muted-foreground">
                  Stored securely: users/{user?.uid}/emailAccess
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
          
          {/* User Info Display */}
          {user && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Your Account:</strong> {user.email}
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>User ID:</strong> {user.uid}
              </p>
              {emailAddress && (
                <p className="text-xs text-muted-foreground">
                  <strong>Email to Scan:</strong> {emailAddress}
                </p>
              )}
            </div>
          )}
          
          <Button
            onClick={handleEmailSetup}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600"
            disabled={loading || !emailAddress}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              "Setup Gmail Access"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}