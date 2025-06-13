import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DynamicStatsCards } from "@/components/DynamicStatsCards";
import { DynamicSubscriptionsList } from "@/components/DynamicSubscriptionsList";
import { DynamicSpendingChart } from "@/components/DynamicSpendingChart";
import { DynamicUpcomingPayments } from "@/components/DynamicUpcomingPayments";
import { DetailsSidebar } from "@/components/DetailsSidebar";
import { EmailProcessingButton } from "@/components/EmailProcessingButton";
import { EmailSetupDialog } from "@/components/EmailSetupDialog";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SubscriptionService, SubscriptionStats } from "@/lib/subscriptionService";
import { DetectedSubscription } from "@/lib/emailProcessor";

const Dashboard = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [showEmailSetup, setShowEmailSetup] = useState(false);
  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasEmailAccess, setHasEmailAccess] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const { user } = useAuth();
  const subscriptionService = new SubscriptionService();

  useEffect(() => {
    const checkEmailAccessAndLoadData = async () => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        const hasGmailAuth = userData?.gmailAuthorized === true;
        const hasTargetEmail = !!userData?.targetEmail;
        
        setHasEmailAccess(hasGmailAuth && hasTargetEmail);
        
        if (!hasGmailAuth || !hasTargetEmail) {
          setShowEmailSetup(true);
          setLoading(false);
        } else {
          await loadSubscriptionData();
        }
      }
    };

    checkEmailAccessAndLoadData();
  }, [user, selectedYear]); // Re-load when year changes

  const loadSubscriptionData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      console.log(`📊 Dashboard loading data for ${selectedYear}...`);
      
      // Load subscriptions for selected year
      const [subscriptionsData, statsData] = await Promise.all([
        selectedYear === new Date().getFullYear() 
          ? subscriptionService.getSubscriptions(user.uid)
          : subscriptionService.getSubscriptionsForYear(user.uid, selectedYear),
        subscriptionService.getSubscriptionStats(user.uid, selectedYear)
      ]);
      
      setSubscriptions(subscriptionsData);
      setStats(statsData);
      
      console.log(`✅ Dashboard loaded for ${selectedYear}: ${subscriptionsData.length} subscriptions`);
    } catch (error) {
      console.error('Error loading subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessingComplete = () => {
    loadSubscriptionData();
  };

  const handleEmailSetupComplete = () => {
    setShowEmailSetup(false);
    setHasEmailAccess(true);
    loadSubscriptionData();
  };

  // Generate available years from subscription data
  const getAvailableYears = () => {
    const years = new Set<number>();
    const currentYear = new Date().getFullYear();
    
    // Add current year
    years.add(currentYear);
    
    // Add years from subscription data
    subscriptions.forEach(sub => {
      const detectedYear = new Date(sub.detectedAt).getFullYear();
      const paymentYear = new Date(sub.nextPaymentDate).getFullYear();
      years.add(detectedYear);
      years.add(paymentYear);
    });
    
    // Add previous years for historical data
    for (let i = 1; i <= 3; i++) {
      years.add(currentYear - i);
    }
    
    return Array.from(years).sort((a, b) => b - a); // Sort descending
  };

  const availableYears = getAvailableYears();

  const handleYearChange = (year: number) => {
    console.log(`📅 Dashboard year changed to: ${year}`);
    setSelectedYear(year);
    // Data will reload automatically via useEffect
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex items-center gap-4 border-b px-6 py-3">
            <SidebarTrigger />
            <DashboardHeader onShowDetails={() => setShowDetails(true)} />
            
            {/* Year Selector */}
            {hasEmailAccess && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Year:</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Calendar className="h-4 w-4" />
                      {selectedYear}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {availableYears.map((year) => (
                      <DropdownMenuItem
                        key={year}
                        onClick={() => handleYearChange(year)}
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
            )}
            
            {hasEmailAccess && (
              <EmailProcessingButton onProcessingComplete={handleProcessingComplete} />
            )}
          </div>
          <div className="flex-1 p-6 space-y-6">
            {hasEmailAccess ? (
              <>
                {/* Year indicator */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {selectedYear} Dashboard
                      {selectedYear === new Date().getFullYear() && " (Current Year)"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedYear === new Date().getFullYear() 
                        ? `Your subscription data from January to ${new Date().toLocaleDateString('en-US', { month: 'long' })} ${selectedYear}`
                        : `Complete subscription data for ${selectedYear}`
                      }
                    </p>
                  </div>
                </div>
                
                <DynamicStatsCards stats={stats} loading={loading} />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <DynamicSpendingChart stats={stats} loading={loading} />
                  </div>
                  <div>
                    <DynamicUpcomingPayments stats={stats} loading={loading} />
                  </div>
                </div>
                <DynamicSubscriptionsList subscriptions={subscriptions} loading={loading} />
              </>
            ) : (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <h2 className="text-xl font-semibold mb-2">Email Setup Required</h2>
                  <p className="text-muted-foreground mb-4">
                    Please set up email access to start tracking your subscriptions
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
        {showDetails && (
          <DetailsSidebar onClose={() => setShowDetails(false)} />
        )}
        <EmailSetupDialog 
          open={showEmailSetup} 
          onOpenChange={setShowEmailSetup}
          onComplete={handleEmailSetupComplete}
        />
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;