import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, CreditCard, Calendar, CheckCircle, Clock, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { SubscriptionService } from "@/lib/subscriptionService";
import { DetectedSubscription } from "@/lib/emailProcessor";

const Notifications = () => {
  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const subscriptionService = new SubscriptionService();

  useEffect(() => {
    const loadData = async () => {
      if (user) {
        setLoading(true);
        try {
          const data = await subscriptionService.getSubscriptions(user.uid);
          setSubscriptions(data);
        } catch (error) {
          console.error('Error loading notifications data:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    loadData();
  }, [user]);

  const generateNotifications = () => {
    const notifications = [];
    const now = new Date();

    // Payment due notifications
    subscriptions
      .filter(sub => sub.status === 'active')
      .forEach(sub => {
        const paymentDate = new Date(sub.nextPaymentDate);
        const diffTime = paymentDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 7 && diffDays >= 0) {
          notifications.push({
            id: `payment-${sub.id}`,
            type: "payment",
            title: diffDays === 0 ? "Payment Due Today" : 
                   diffDays === 1 ? "Payment Due Tomorrow" : 
                   `Payment Due in ${diffDays} Days`,
            description: `${sub.serviceName} subscription payment of $${sub.amount.toFixed(2)} is due ${
              diffDays === 0 ? 'today' : 
              diffDays === 1 ? 'tomorrow' : 
              `in ${diffDays} days`
            }`,
            time: `${diffDays} days`,
            icon: CreditCard,
            severity: diffDays <= 1 ? "error" : diffDays <= 3 ? "warning" : "info",
            subscription: sub
          });
        }
      });

    // Trial expiration notifications
    subscriptions
      .filter(sub => sub.status === 'trial')
      .forEach(sub => {
        const paymentDate = new Date(sub.nextPaymentDate);
        const diffTime = paymentDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 7) {
          notifications.push({
            id: `trial-${sub.id}`,
            type: "trial",
            title: "Trial Ending Soon",
            description: `${sub.serviceName} trial ends ${
              diffDays <= 0 ? 'today' : 
              diffDays === 1 ? 'tomorrow' : 
              `in ${diffDays} days`
            }. Cancel or convert to paid subscription.`,
            time: `${diffDays} days`,
            icon: AlertTriangle,
            severity: diffDays <= 1 ? "error" : "warning",
            subscription: sub
          });
        }
      });

    // Recent renewals
    subscriptions
      .filter(sub => sub.status === 'active')
      .forEach(sub => {
        const detectedDate = new Date(sub.detectedAt);
        const diffTime = now.getTime() - detectedDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 3) {
          notifications.push({
            id: `renewal-${sub.id}`,
            type: "renewal",
            title: "Subscription Renewed",
            description: `${sub.serviceName} has been automatically renewed for $${sub.amount.toFixed(2)}`,
            time: diffDays === 0 ? 'Today' : `${diffDays} days ago`,
            icon: CheckCircle,
            severity: "info",
            subscription: sub
          });
        }
      });

    // Sort by urgency and time
    return notifications.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      const aSeverity = severityOrder[a.severity as keyof typeof severityOrder];
      const bSeverity = severityOrder[b.severity as keyof typeof severityOrder];
      
      if (aSeverity !== bSeverity) {
        return aSeverity - bSeverity;
      }
      
      return a.time.localeCompare(b.time);
    });
  };

  const notifications = generateNotifications();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error": return "destructive";
      case "warning": return "secondary";
      default: return "default";
    }
  };

  const getServiceEmoji = (serviceName: string): string => {
    const name = serviceName.toLowerCase();
    if (name.includes('netflix')) return '🎬';
    if (name.includes('spotify')) return '🎵';
    if (name.includes('github')) return '⚡';
    if (name.includes('stackblitz')) return '⚡';
    if (name.includes('adobe')) return '🎨';
    if (name.includes('dropbox')) return '☁️';
    if (name.includes('microsoft')) return '📊';
    if (name.includes('google')) return '📧';
    if (name.includes('figma')) return '🎨';
    if (name.includes('notion')) return '📝';
    return '📱';
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex items-center gap-4 border-b px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Notifications</h1>
                <p className="text-muted-foreground">Stay updated with your subscription alerts</p>
              </div>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
          <div className="flex-1 p-6 space-y-6">
            {/* Notification Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Urgent Alerts</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {notifications.filter(n => n.severity === 'error').length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Require immediate attention
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Warnings</CardTitle>
                  <Clock className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">
                    {notifications.filter(n => n.severity === 'warning').length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Action needed soon
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recent Updates</CardTitle>
                  <Bell className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {notifications.filter(n => n.severity === 'info').length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Informational updates
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Notifications List */}
            <Card>
              <CardHeader>
                <CardTitle>All Notifications ({notifications.length})</CardTitle>
                <CardDescription>Recent alerts and updates about your subscriptions</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="animate-pulse flex items-start space-x-4 p-4 rounded-lg border">
                        <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">All caught up!</h3>
                    <p className="text-muted-foreground mb-4">
                      No urgent notifications at the moment. We'll alert you when payments are due or trials are expiring.
                    </p>
                    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>All subscriptions monitored</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span>Automatic alerts enabled</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {notifications.map((notification) => {
                      const IconComponent = notification.icon;
                      return (
                        <Card key={notification.id} className={`${
                          notification.severity === 'error' ? 'border-red-200 bg-red-50' :
                          notification.severity === 'warning' ? 'border-yellow-200 bg-yellow-50' :
                          'border-gray-200'
                        }`}>
                          <CardContent className="p-4">
                            <div className="flex items-start space-x-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">
                                  {notification.subscription ? getServiceEmoji(notification.subscription.serviceName) : '📱'}
                                </span>
                                <div className={`p-2 rounded-full ${
                                  notification.severity === 'error' ? 'bg-red-100' :
                                  notification.severity === 'warning' ? 'bg-yellow-100' :
                                  'bg-blue-100'
                                }`}>
                                  <IconComponent className={`h-4 w-4 ${
                                    notification.severity === 'error' ? 'text-red-600' :
                                    notification.severity === 'warning' ? 'text-yellow-600' :
                                    'text-blue-600'
                                  }`} />
                                </div>
                              </div>
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-semibold">{notification.title}</h4>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={getSeverityColor(notification.severity)} className="text-xs">
                                      {notification.type}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {notification.time}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {notification.description}
                                </p>
                                {notification.subscription && (
                                  <div className="flex items-center gap-4 mt-2">
                                    <span className="text-xs text-muted-foreground">
                                      Category: {notification.subscription.category}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      Billing: {notification.subscription.billingCycle}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Notifications;