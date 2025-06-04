import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";

interface GmailAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GmailAuthDialog({ open, onOpenChange }: GmailAuthDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleGmailAuth = async () => {
    setLoading(true);
    try {
      const clientId = "616003184852-2sjlhqid5sfme4lg3q3n1c6bc14sc7tv.apps.googleusercontent.com";
      const redirectUri = `${window.location.origin}/auth/callback`;
      const scope = "https://www.googleapis.com/auth/gmail.readonly";
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
      
      window.location.href = authUrl;
    } catch (error) {
      console.error("Gmail auth error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Connect Gmail Account</DialogTitle>
          <DialogDescription>
            Allow SubTracker to scan your emails for subscriptions. We only need read access to detect your active subscriptions.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 py-4">
          <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
            <Mail className="h-6 w-6 text-blue-500" />
            <div className="flex-1">
              <h4 className="font-medium text-sm">Read-only Access</h4>
              <p className="text-sm text-muted-foreground">
                We never store your emails or send emails on your behalf
              </p>
            </div>
          </div>
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