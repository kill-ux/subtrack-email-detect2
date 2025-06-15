import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Mail, Loader2, CheckCircle, AlertCircle, Calendar, ChevronDown, X } from "lucide-react";
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

interface ScanningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanComplete: () => void;
}

export function ScanningDialog({ open, onOpenChange, onScanComplete }: ScanningDialogProps) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [scanResults, setScanResults] = useState<{
    found: number;
    processed: number;
    errors: number;
  } | null>(null);
  const [scanComplete, setScanComplete] = useState(false);
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

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setScanning(false);
      setProgress(0);
      setCurrentStep('');
      setScanResults(null);
      setScanComplete(false);
    }
  }, [open]);

  const handleStartScan = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in first",
        variant: "destructive"
      });
      return;
    }

    setScanning(true);
    setProgress(0);
    setScanResults(null);
    setScanComplete(false);
    
    try {
      console.log(`🚀 Starting email scan for user: ${user.uid} (Year: ${selectedYear})`);
      
      setCurrentStep('Checking Gmail authorization...');
      setProgress(10);
      
      // Initialize token manager
      const tokenManager = new GmailTokenManager(user.uid);
      
      // Check authorization status
      const authStatus = await tokenManager.getAuthStatus();

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
      setProgress(20);
      
      // Check token validity
      const validToken = await tokenManager.getValidAccessToken();

      if (!validToken) {
        toast({
          title: "Token Error",
          description: "Unable to obtain valid access token. Please reconnect your account.",
          variant: "destructive"
        });
        return;
      }

      setCurrentStep('Connecting to Gmail API...');
      setProgress(30);
      
      // Initialize email processor with year filter
      const processor = new EmailProcessor(user.uid);

      // Process emails for the selected year
      setCurrentStep(`Stage 1: Scanning ${selectedYear} emails...`);
      setProgress(40);
      
      // Simulate progress updates during processing
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 90) {
            return prev + Math.random() * 10;
          }
          return prev;
        });
      }, 2000);

      const detectedSubscriptions = await processor.processEmailsForYear(selectedYear);
      
      clearInterval(progressInterval);
      setProgress(100);
      setCurrentStep('Scan complete!');
      
      setScanResults({
        found: detectedSubscriptions.length,
        processed: detectedSubscriptions.length,
        errors: 0
      });

      setScanComplete(true);

      toast({
        title: "Email Scan Complete",
        description: `Found ${detectedSubscriptions.length} subscriptions from ${selectedYear}`,
      });

      // Auto-close after 3 seconds if successful
      setTimeout(() => {
        onScanComplete();
        onOpenChange(false);
      }, 3000);

    } catch (error) {
      console.error('❌ Error during email scan:', error);
      
      setCurrentStep('Error occurred');
      setProgress(0);
      
      let errorMessage = "Failed to scan emails. Please try again.";
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
        title: "Scan Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setScanning(false);
    }
  };

  const getStepIcon = () => {
    if (scanComplete) return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (currentStep.includes('Error')) return <AlertCircle className="h-5 w-5 text-red-500" />;
    if (scanning) return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    return <Mail className="h-5 w-5 text-gray-400" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStepIcon()}
              <DialogTitle>
                {scanComplete ? 'Scan Complete!' : scanning ? 'Scanning Emails...' : 'Scan for Subscriptions'}
              </DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              disabled={scanning}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription>
            {scanComplete 
              ? `Successfully scanned your ${selectedYear} emails for subscription receipts`
              : scanning 
                ? `Analyzing your ${selectedYear} emails using AI-powered detection`
                : `Select a year and scan your emails to automatically detect subscription receipts`
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {!scanning && !scanComplete && (
            <>
              {/* Year Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Year to Scan</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {selectedYear}
                        {selectedYear === new Date().getFullYear() && (
                          <span className="text-xs text-muted-foreground">(Current)</span>
                        )}
                      </div>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-full">
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
              </div>

              {/* Scan Information */}
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">What we'll scan:</h4>
                  <ul className="space-y-1 text-blue-800">
                    <li>• Payment receipts and invoices</li>
                    <li>• Subscription confirmations</li>
                    <li>• Billing notifications</li>
                    <li>• Service renewal emails</li>
                  </ul>
                </div>
                
                <div className="bg-green-50 p-3 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">AI-Powered Detection:</h4>
                  <ul className="space-y-1 text-green-800">
                    <li>• Two-stage validation process</li>
                    <li>• Enhanced StackBlitz & dev tool detection</li>
                    <li>• Smart amount and currency recognition</li>
                    <li>• High accuracy with detailed reasoning</li>
                  </ul>
                </div>
              </div>

              <Button
                onClick={handleStartScan}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600"
                size="lg"
              >
                <Mail className="h-4 w-4 mr-2" />
                Start Scanning {selectedYear}
              </Button>
            </>
          )}

          {scanning && (
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>

              {/* Current Step */}
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 text-blue-900">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="font-medium">{currentStep}</span>
                </div>
              </div>

              {/* Scanning Steps */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Stage 1: Traditional pattern matching</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span>Stage 2: AI validation with Gemini</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <span>Stage 3: Save validated subscriptions</span>
                </div>
              </div>
            </div>
          )}

          {scanComplete && scanResults && (
            <div className="space-y-4">
              {/* Results Summary */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h3 className="font-medium text-green-900">Scan Results</h3>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{scanResults.found}</div>
                    <div className="text-xs text-green-700">Subscriptions Found</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{scanResults.processed}</div>
                    <div className="text-xs text-blue-700">Emails Processed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-600">{scanResults.errors}</div>
                    <div className="text-xs text-gray-700">Errors</div>
                  </div>
                </div>
              </div>

              {/* Success Message */}
              <div className="text-center text-sm text-muted-foreground">
                <p>Your dashboard will update automatically.</p>
                <p>This dialog will close in a few seconds...</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}