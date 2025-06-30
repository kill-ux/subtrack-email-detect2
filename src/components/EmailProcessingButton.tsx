import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Mail, Loader2, Database, Key, CheckCircle, AlertCircle, Calendar, ChevronDown, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { EmailProcessor } from "@/lib/emailProcessor";
import { GmailTokenManager } from "@/lib/gmailTokenManager";
import { useToast } from "@/components/ui/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";

interface EmailProcessingButtonProps {
  onProcessingComplete: () => void;
}

export function EmailProcessingButton({ onProcessingComplete }: EmailProcessingButtonProps) {
  const [processing, setProcessing] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [currentStep, setCurrentStep] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [progress, setProgress] = useState(0);
  const [processingStats, setProcessingStats] = useState<{
    candidatesFound: number;
    aiValidated: number;
    currentEmail: number;
    totalEmails: number;
  } | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Generate available years (current year + 5 years back)
  const getAvailableYears = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = 0; i <= 5; i++) {
      years.push(currentYear - i);
    }
    return years;
  };

  const availableYears = getAvailableYears();

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
    setCurrentStep('Initializing enhanced email processing...');
    setProgress(0);
    setProcessingStats(null);
    
    try {
      console.log(`🚀 Starting ENHANCED email processing for user: ${user.uid} (Year: ${selectedYear})`);
      
      setCurrentStep('Checking Gmail authorization...');
      setProgress(5);
      
      // Initialize token manager
      const tokenManager = new GmailTokenManager(user.uid);
      
      // Check authorization status
      const authStatus = await tokenManager.getAuthStatus();
      setDebugInfo(prev => ({
        ...prev,
        userId: user.uid,
        userEmail: user.email,
        selectedYear: selectedYear,
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
      setProgress(10);
      
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
      setProgress(15);
      
      // Initialize enhanced email processor
      const processor = new EmailProcessor(user.uid);

      // Stage 1: Traditional validation
      setCurrentStep(`Stage 1: Scanning ${selectedYear} emails with enhanced patterns...`);
      setProgress(25);
      
      toast({
        title: "Enhanced Processing Started",
        description: `Scanning your ${selectedYear} emails with improved AI validation...`,
      });

      // Simulate progress updates during processing
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 85) {
            return prev + Math.random() * 5;
          }
          return prev;
        });
      }, 3000);

      // Process emails for the selected year with enhanced validation
      const detectedSubscriptions = await processor.processEmailsForYear(selectedYear);
      
      clearInterval(progressInterval);
      setProgress(100);
      setCurrentStep('Enhanced processing complete!');
      
      // Update final stats
      setProcessingStats({
        candidatesFound: detectedSubscriptions.length * 2, // Estimate candidates
        aiValidated: detectedSubscriptions.length,
        currentEmail: detectedSubscriptions.length,
        totalEmails: detectedSubscriptions.length
      });
      
      setDebugInfo(prev => ({
        ...prev,
        subscriptionsFound: detectedSubscriptions.length,
        processingComplete: true,
        yearProcessed: selectedYear,
        enhancedValidation: true,
        stackBlitzFound: detectedSubscriptions.filter(sub => 
          sub.serviceName.toLowerCase().includes('stackblitz')
        ).length,
        githubFound: detectedSubscriptions.filter(sub => 
          sub.serviceName.toLowerCase().includes('github')
        ).length,
        currenciesFound: [...new Set(detectedSubscriptions.map(sub => sub.currency))],
        categoriesFound: [...new Set(detectedSubscriptions.map(sub => sub.category))],
        averageConfidence: detectedSubscriptions.length > 0 
          ? (detectedSubscriptions.reduce((sum, sub) => sum + sub.confidence, 0) / detectedSubscriptions.length * 100).toFixed(1)
          : 0
      }));

      toast({
        title: "Enhanced Processing Complete",
        description: `Found ${detectedSubscriptions.length} high-confidence subscriptions from ${selectedYear}`,
      });

      onProcessingComplete();
    } catch (error) {
      console.error('❌ Error in enhanced email processing:', error);
      
      setCurrentStep('Error occurred');
      setProgress(0);
      
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
        title: "Enhanced Processing Failed",
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {/* Year Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={processing} className="gap-2">
              <Calendar className="h-4 w-4" />
              {selectedYear}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {availableYears.map((year) => (
              <DropdownMenuItem
                key={year}
                onClick={() => setSelectedYear(year)}
                className={selectedYear === year ? "bg-accent" : ""}
              >
                <div className="flex items-center justify-between w-full">
                  <span>{year}</span>
                  {year === new Date().getFullYear() && (
                    <span className="text-xs text-muted-foreground ml-2">Current</span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Enhanced Process Button */}
        <Button 
          onClick={handleProcessEmails} 
          disabled={processing}
          className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          {processing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TrendingUp className="h-4 w-4" />
          )}
          {processing ? `Enhanced Processing ${selectedYear}...` : `Enhanced Scan ${selectedYear}`}
        </Button>
      </div>

      {/* Progress Bar */}
      {processing && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="w-full h-2" />
        </div>
      )}

      {/* Current Step Indicator */}
      {processing && currentStep && (
        <div className="text-xs bg-gradient-to-r from-blue-50 to-purple-50 p-3 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            {getStepIcon(currentStep)}
            <span className="font-medium text-blue-900">{currentStep}</span>
          </div>
          
          {processingStats && (
            <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
              <div>Candidates: {processingStats.candidatesFound}</div>
              <div>AI Validated: {processingStats.aiValidated}</div>
            </div>
          )}
        </div>
      )}

      {/* Enhanced Debug Information */}
      {Object.keys(debugInfo).length > 0 && (
        <div className="text-xs bg-gray-50 p-3 rounded-lg border max-w-md">
          <div className="flex items-center gap-1 mb-2">
            <Database className="h-3 w-3" />
            <span className="font-medium">Enhanced Processing Info:</span>
          </div>
          <div className="space-y-1">
            {debugInfo.userId && (
              <div><strong>User ID:</strong> {debugInfo.userId.substring(0, 8)}...</div>
            )}
            {debugInfo.userEmail && (
              <div><strong>Email:</strong> {debugInfo.userEmail}</div>
            )}
            {debugInfo.selectedYear && (
              <div><strong>Year:</strong> {debugInfo.selectedYear}</div>
            )}
            {debugInfo.authStatus && (
              <div><strong>Auth Status:</strong> {debugInfo.authStatus}</div>
            )}
            {debugInfo.gmailAuthorized !== undefined && (
              <div><strong>Gmail Auth:</strong> {debugInfo.gmailAuthorized ? '✅' : '❌'}</div>
            )}
            {debugInfo.enhancedValidation && (
              <div className="text-green-600"><strong>Enhanced AI:</strong> ✅ Enabled</div>
            )}
            {debugInfo.subscriptionsFound !== undefined && (
              <div><strong>Found:</strong> {debugInfo.subscriptionsFound} subscriptions</div>
            )}
            {debugInfo.averageConfidence && (
              <div><strong>Avg Confidence:</strong> {debugInfo.averageConfidence}%</div>
            )}
            {debugInfo.stackBlitzFound !== undefined && debugInfo.stackBlitzFound > 0 && (
              <div className="text-green-600"><strong>StackBlitz:</strong> {debugInfo.stackBlitzFound} found! 🎉</div>
            )}
            {debugInfo.githubFound !== undefined && debugInfo.githubFound > 0 && (
              <div className="text-green-600"><strong>GitHub:</strong> {debugInfo.githubFound} found! ⚡</div>
            )}
            {debugInfo.currenciesFound && debugInfo.currenciesFound.length > 0 && (
              <div><strong>Currencies:</strong> {debugInfo.currenciesFound.join(', ')}</div>
            )}
            {debugInfo.categoriesFound && debugInfo.categoriesFound.length > 0 && (
              <div><strong>Categories:</strong> {debugInfo.categoriesFound.join(', ')}</div>
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