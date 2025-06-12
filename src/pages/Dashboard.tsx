import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DynamicStatsCards } from "@/components/DynamicStatsCards";
import { DynamicSubscriptionsList } from "@/components/DynamicSubscriptionsList";
import { DynamicSpendingChart } from "@/components/DynamicSpendingChart";
import { DynamicUpcomingPayments } from "@/components/DynamicUpcomingPayments";
import { DetailsSidebar } from "@/components/DetailsSidebar";
import { EmailProcessingButton } from "@/components/EmailProcessingButton";
import { useState, useEffect } from "react";
import { GmailAuthDialog } from "@/components/GmailAuthDialog";
import { useAuth } from "@/lib/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SubscriptionService, SubscriptionStats } from "@/lib/subscriptionService";
import { DetectedSubscription } from "@/lib/emailProcessor";

const Dashboard = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [showGmailAuth, setShowGmailAuth] = useState(false);
  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const subscriptionService = new SubscriptionService();

  useEffect(() => {
    const checkGmailAuthAndLoadData = async () => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const hasGmailAuth = userDoc.exists() && userDoc.data()?.gmailAuthorized;
        
        if (!hasGmailAuth) {
          setShowGmailAuth(true);
          setLoading(false);
        } else {
          await loadSubscriptionData();
        }
      }
    };

    checkGmailAuthAndLoadData();
  }, [user]);

  const loadSubscriptionData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const [subscriptionsData, statsData] = await Promise.all([
        subscriptionService.getSubscriptions(user.uid),
        subscriptionService.getSubscriptionStats(user.uid)
      ]);
      
      setSubscriptions(subscriptionsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessingComplete = () => {
    loadSubscriptionData();
  };

  const handleGmailAuthComplete = () => {
    setShowGmailAuth(false);
    loadSubscriptionData();
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex items-center gap-4 border-b px-6 py-3">
            <SidebarTrigger />
            <DashboardHeader onShowDetails={() => setShowDetails(true)} />
            <EmailProcessingButton onProcessingComplete={handleProcessingComplete} />
          </div>
          <div className="flex-1 p-6 space-y-6">
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
          </div>
        </main>
        {showDetails && (
          <DetailsSidebar onClose={() => setShowDetails(false)} />
        )}
        <GmailAuthDialog 
          open={showGmailAuth} 
          onOpenChange={setShowGmailAuth}
        />
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;