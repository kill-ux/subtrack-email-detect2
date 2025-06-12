import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, AlertTriangle } from "lucide-react";
import { DetectedSubscription } from "@/lib/emailProcessor";

interface DynamicSubscriptionsListProps {
  subscriptions: DetectedSubscription[];
  loading: boolean;
}

export function DynamicSubscriptionsList({ subscriptions, loading }: DynamicSubscriptionsListProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>All Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-gray-200 rounded-full"></div>
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-24 mb-1"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                </div>
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getServiceEmoji = (serviceName: string): string => {
    const name = serviceName.toLowerCase();
    if (name.includes('netflix')) return '🎬';
    if (name.includes('spotify')) return '🎵';
    if (name.includes('github')) return '⚡';
    if (name.includes('adobe')) return '🎨';
    if (name.includes('dropbox')) return '☁️';
    if (name.includes('microsoft')) return '📊';
    if (name.includes('google')) return '📧';
    if (name.includes('slack')) return '💬';
    if (name.includes('zoom')) return '📹';
    if (name.includes('figma')) return '🎨';
    if (name.includes('notion')) return '📝';
    if (name.includes('canva')) return '🎨';
    return '📱';
  };

  const formatNextPayment = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getUsageBadge = (subscription: DetectedSubscription) => {
    const daysSinceDetected = Math.floor(
      (new Date().getTime() - new Date(subscription.detectedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceDetected < 30) return { label: 'New', variant: 'default' as const };
    if (daysSinceDetected < 90) return { label: 'Active', variant: 'default' as const };
    return { label: 'Review', variant: 'destructive' as const };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Subscriptions ({subscriptions.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {subscriptions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No subscriptions detected yet.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Connect your Gmail account to automatically detect subscriptions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Service</th>
                  <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Category</th>
                  <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Amount</th>
                  <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Billing</th>
                  <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Next Payment</th>
                  <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Status</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => {
                  const usage = getUsageBadge(sub);
                  return (
                    <tr key={sub.id || sub.emailId} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{getServiceEmoji(sub.serviceName)}</span>
                          <span className="font-medium">{sub.serviceName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">{sub.category}</td>
                      <td className="py-3 px-2 font-semibold">${sub.amount.toFixed(2)}</td>
                      <td className="py-3 px-2 text-sm capitalize">{sub.billingCycle}</td>
                      <td className="py-3 px-2 text-sm">{formatNextPayment(sub.nextPaymentDate)}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={sub.status === 'active' ? 'default' : 
                                   sub.status === 'trial' ? 'secondary' : 'destructive'} 
                            className="text-xs capitalize"
                          >
                            {sub.status}
                          </Badge>
                          {usage.variant === 'destructive' && 
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          }
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}