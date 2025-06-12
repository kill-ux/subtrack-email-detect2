import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { EmailProcessor } from "@/lib/emailProcessor";
import { useToast } from "@/components/ui/use-toast";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface EmailProcessingButtonProps {
  onProcessingComplete: () => void;
}

export function EmailProcessingButton({ onProcessingComplete }: EmailProcessingButtonProps) {
  const [processing, setProcessing] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleProcessEmails = async () => {
    if (!user) return;

    setProcessing(true);
    try {
      // Get user's Gmail tokens
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();
      
      if (!userData?.gmailAuthorized) {
        toast({
          title: "Gmail Not Connected",
          description: "Please connect your Gmail account first",
          variant: "destructive"
        });
        return;
      }

      // Initialize email processor
      const processor = new EmailProcessor({
        access_token: userData.gmailTokens?.access_token,
        refresh_token: userData.gmailTokens?.refresh_token,
      });

      // Process emails
      const detectedSubscriptions = await processor.processEmails(user.uid);
      
      toast({
        title: "Email Processing Complete",
        description: `Found ${detectedSubscriptions.length} subscriptions`,
      });

      onProcessingComplete();
    } catch (error) {
      console.error('Error processing emails:', error);
      toast({
        title: "Processing Failed",
        description: "Failed to process emails. Please try again.",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Button 
      onClick={handleProcessEmails} 
      disabled={processing}
      className="gap-2"
    >
      {processing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Mail className="h-4 w-4" />
      )}
      {processing ? "Processing Emails..." : "Scan Emails"}
    </Button>
  );
}