import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardHeader } from "@/components/DashboardHeader";
import { StatsCards } from "@/components/StatsCards";
import { SubscriptionsList } from "@/components/SubscriptionsList";
import { SpendingChart } from "@/components/SpendingChart";
import { DetailsSidebar } from "@/components/DetailsSidebar";
import { useState } from "react";
import { UpcomingPayments } from "@/components/UpcomingPayments";

const Dashboard = () => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex items-center gap-4 border-b px-6 py-3">
            <SidebarTrigger />
            <DashboardHeader onShowDetails={() => setShowDetails(true)} />
          </div>
          <div className="flex-1 p-6 space-y-6">
            <StatsCards />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <SpendingChart />
              </div>
              <div>
                <UpcomingPayments />
              </div>
            </div>
            <SubscriptionsList />
          </div>
        </main>
        {showDetails && (
          <DetailsSidebar onClose={() => setShowDetails(false)} />
        )}
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
