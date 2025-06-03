
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, AlertTriangle, CreditCard, Calendar } from "lucide-react";

const Notifications = () => {
  const notifications = [
    {
      id: 1,
      type: "payment",
      title: "Payment Due Tomorrow",
      description: "Netflix subscription payment of $15.99 is due tomorrow",
      time: "2 hours ago",
      icon: CreditCard,
      severity: "warning"
    },
    {
      id: 2,
      type: "renewal",
      title: "Subscription Renewed",
      description: "Spotify Premium has been automatically renewed for $9.99",
      time: "1 day ago",
      icon: Bell,
      severity: "info"
    },
    {
      id: 3,
      type: "cancellation",
      title: "Cancellation Reminder",
      description: "Adobe Creative Cloud trial ends in 3 days",
      time: "2 days ago",
      icon: AlertTriangle,
      severity: "error"
    },
    {
      id: 4,
      type: "upcoming",
      title: "Upcoming Payment",
      description: "Disney+ subscription renewal in 5 days",
      time: "3 days ago",
      icon: Calendar,
      severity: "info"
    }
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error": return "destructive";
      case "warning": return "secondary";
      default: return "default";
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex items-center gap-4 border-b px-6 py-3">
            <SidebarTrigger />
            <div>
              <h1 className="text-2xl font-bold">Notifications</h1>
              <p className="text-muted-foreground">Stay updated with your subscription alerts</p>
            </div>
          </div>
          <div className="flex-1 p-6 space-y-6">
            <div className="space-y-4">
              {notifications.map((notification) => {
                const IconComponent = notification.icon;
                return (
                  <Card key={notification.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start space-x-4">
                        <div className="p-2 rounded-full bg-muted">
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">{notification.title}</h4>
                            <Badge variant={getSeverityColor(notification.severity)}>
                              {notification.type}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {notification.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {notification.time}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Notifications;
