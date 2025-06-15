import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DynamicStatsCards } from "@/components/DynamicStatsCards";
import { DynamicSubscriptionsList } from "@/components/DynamicSubscriptionsList";
import { DynamicSpendingChart } from "@/components/DynamicSpendingChart";
import { DynamicUpcomingPayments } from "@/components/DynamicUpcomingPayments";
import { DetailsSidebar } from "@/components/DetailsSidebar";
import { ScanningDialog } from "@/components/ScanningDialog";
import { EmailSetupDialog } from "@/components/EmailSetupDialog";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SubscriptionService, SubscriptionStats } from "@/lib/subscriptionService";
import { DetectedSubscription } from "@/lib/emailProcessor";

const Dashboard = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [showEmailSetup, setShowEmailSetup] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasEmailAccess, setHasEmailAccess] = useState(false);
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
  }, [user]);

  const loadSubscriptionData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      console.log(`📊 Dashboard loading current year data...`);
      
      // Load current year subscriptions and stats
      const [subscriptionsData, statsData] = await Promise.all([
        subscriptionService.getSubscriptions(user.uid),
        subscriptionService.getSubscriptionStats(user.uid)
      ]);
      
      setSubscriptions(subscriptionsData);
      setStats(statsData);
      
      console.log(`✅ Dashboard loaded: ${subscriptionsData.length} subscriptions`);
    } catch (error) {
      console.error('Error loading subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScanComplete = () => {
    loadSubscriptionData();
  };

  const handleEmailSetupComplete = () => {
    setShowEmailSetup(false);
    setHasEmailAccess(true);
    loadSubscriptionData();
  };

  const handleScanSubscriptions = () => {
    setShowScanDialog(true);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex items-center gap-4 border-b px-6 py-3">
            <SidebarTrigger />
            <DashboardHeader 
              onShowDetails={() => setShowDetails(true)}
              onScanSubscriptions={handleScanSubscriptions}
            />
          </div>
          <div className="flex-1 p-6 space-y-6">
            {hasEmailAccess ? (
              <>
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
        <ScanningDialog
          open={showScanDialog}
          onOpenChange={setShowScanDialog}
          onScanComplete={handleScanComplete}
        />
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;