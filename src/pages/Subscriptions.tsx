
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const Subscriptions = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex items-center gap-4 border-b px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Subscriptions</h1>
                <p className="text-muted-foreground">Manage all your subscriptions</p>
              </div>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Subscription
              </Button>
            </div>
          </div>
          <div className="flex-1 p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Active Subscriptions</CardTitle>
                  <CardDescription>Your currently active services</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">12</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Paused Subscriptions</CardTitle>
                  <CardDescription>Temporarily paused services</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">3</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Cancelled Subscriptions</CardTitle>
                  <CardDescription>Recently cancelled services</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">5</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Subscriptions;
