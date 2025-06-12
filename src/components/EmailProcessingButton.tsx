import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Mail, Loader2, Database, Key, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { EmailProcessor } from "@/lib/emailProcessor";
import { GmailTokenManager } from "@/lib/gmailTokenManager";
import { useToast } from "@/components/ui/use-toast";

interface EmailProcessingButtonProps {
  onProcessingComplete: () => void;
}

export function EmailProcessingButton({ onProcessingComplete }: EmailProcessingButtonProps) {
  const [processing, setProcessing] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [currentStep, setCurrentStep] = useState('');
  const { user } = useAuth();
  const { toast } = useToast();

  const handleProcessEmails = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in first",
        variant: "destructive"
      });
      return;
    }

    setProcessing(true);
    setDebugInfo({});
    setCurrentStep('Initializing...');
    
    try {
      console.log(`🚀 Starting email processing for user: ${user.uid}`);
      
      setCurrentStep('Checking Gmail authorization...');
      
      // Initialize token manager
      const tokenManager = new GmailTokenManager(user.uid);
      
      // Check authorization status
      const authStatus = await tokenManager.getAuthStatus();
      setDebugInfo(prev => ({
        ...prev,
        userId: user.uid,
        userEmail: user.email,
        authStatus: authStatus ? 'Found' : 'Not found',
        gmailAuthorized: authStatus?.gmailAuthorized || false,
        hasTokens: !!authStatus?.gmailTokens
      }));

      if (!authStatus?.gmailAuthorized) {
        toast({
          title: "Gmail Not Connected",
          description: "Please connect your Gmail account first",
          variant: "destructive"
        });
        return;
      }

      if (!authStatus?.gmailTokens?.access_token) {
        toast({
          title: "No Access Token",
          description: "Gmail access token not found. Please reconnect your account.",
          variant: "destructive"
        });
        return;
      }

      setCurrentStep('Validating access token...');
      
      // Check token validity
      const validToken = await tokenManager.getValidAccessToken();
      setDebugInfo(prev => ({
        ...prev,
        tokenValid: !!validToken,
        tokenLength: validToken ? validToken.length : 0
      }));

      if (!validToken) {
        toast({
          title: "Token Error",
          description: "Unable to obtain valid access token. Please reconnect your account.",
          variant: "destructive"
        });
        return;
      }

      setCurrentStep('Connecting to Gmail API...');
      
      // Initialize email processor
      const processor = new EmailProcessor(user.uid);

      // Process emails
      setCurrentStep('Scanning emails for subscriptions...');
      
      toast({
        title: "Processing Started",
        description: "Scanning your emails for subscriptions...",
      });

      const detectedSubscriptions = await processor.processEmails();
      
      setCurrentStep('Processing complete!');
      
      setDebugInfo(prev => ({
        ...prev,
        subscriptionsFound: detectedSubscriptions.length,
        processingComplete: true,
        stackBlitzFound: detectedSubscriptions.filter(sub => 
          sub.serviceName.toLowerCase().includes('stackblitz')
        ).length
      }));

      toast({
        title: "Email Processing Complete",
        description: `Found ${detectedSubscriptions.length} subscriptions`,
      });

      onProcessingComplete();
    } catch (error) {
      console.error('❌ Error processing emails:', error);
      
      setCurrentStep('Error occurred');
      
      setDebugInfo(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
      
      let errorMessage = "Failed to process emails. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes('access token')) {
          errorMessage = "Gmail access token expired. Please reconnect your account.";
        } else if (error.message.includes('Gmail API')) {
          errorMessage = "Gmail API error. Please check your connection and try again.";
        } else if (error.message.includes('not authorized')) {
          errorMessage = "Gmail not authorized. Please connect your account first.";
        }
      }
      
      toast({
        title: "Processing Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const getStepIcon = (step: string) => {
    if (step.includes('Error')) return <AlertCircle className="h-3 w-3 text-red-500" />;
    if (step.includes('complete')) return <CheckCircle className="h-3 w-3 text-green-500" />;
    return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
  };

  return (
    <div className="flex flex-col gap-2">
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

      {/* Current Step Indicator */}
      {processing && currentStep && (
        <div className="text-xs bg-blue-50 p-2 rounded flex items-center gap-2">
          {getStepIcon(currentStep)}
          <span className="font-medium">{currentStep}</span>
        </div>
      )}

      {/* Debug Information */}
      {Object.keys(debugInfo).length > 0 && (
        <div className="text-xs bg-gray-100 p-2 rounded max-w-xs">
          <div className="flex items-center gap-1 mb-1">
            <Database className="h-3 w-3" />
            <span className="font-medium">Debug Info:</span>
          </div>
          <div className="space-y-1">
            {debugInfo.userId && (
              <div><strong>User ID:</strong> {debugInfo.userId.substring(0, 8)}...</div>
            )}
            {debugInfo.userEmail && (
              <div><strong>Email:</strong> {debugInfo.userEmail}</div>
            )}
            {debugInfo.authStatus && (
              <div><strong>Auth Status:</strong> {debugInfo.authStatus}</div>
            )}
            {debugInfo.gmailAuthorized !== undefined && (
              <div><strong>Gmail Auth:</strong> {debugInfo.gmailAuthorized ? '✅' : '❌'}</div>
            )}
            {debugInfo.hasTokens !== undefined && (
              <div><strong>Has Tokens:</strong> {debugInfo.hasTokens ? '✅' : '❌'}</div>
            )}
            {debugInfo.tokenValid !== undefined && (
              <div><strong>Token Valid:</strong> {debugInfo.tokenValid ? '✅' : '❌'}</div>
            )}
            {debugInfo.subscriptionsFound !== undefined && (
              <div><strong>Found:</strong> {debugInfo.subscriptionsFound} subscriptions</div>
            )}
            {debugInfo.stackBlitzFound !== undefined && debugInfo.stackBlitzFound > 0 && (
              <div className="text-green-600"><strong>StackBlitz:</strong> {debugInfo.stackBlitzFound} found! 🎉</div>
            )}
            {debugInfo.error && (
              <div className="text-red-600"><strong>Error:</strong> {debugInfo.error}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}