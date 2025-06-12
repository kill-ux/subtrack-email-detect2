import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, AlertTriangle, ExternalLink, Calendar, DollarSign } from "lucide-react";
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
              <div key={i} className="animate-pulse flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="h-4 bg-gray-200 rounded w-16 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-20"></div>
                </div>
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
    if (name.includes('stackblitz')) return '⚡';
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
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `${diffDays} days`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  const getPaymentUrgency = (dateString: string): 'urgent' | 'warning' | 'normal' => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 1) return 'urgent';
    if (diffDays <= 7) return 'warning';
    return 'normal';
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'trial': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const getMonthlyAmount = (subscription: DetectedSubscription): number => {
    switch (subscription.billingCycle) {
      case 'monthly': return subscription.amount;
      case 'yearly': return subscription.amount / 12;
      case 'weekly': return subscription.amount * 4.33;
      default: return subscription.amount;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>All Subscriptions ({subscriptions.length})</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Automatically detected from your email receipts
            </p>
          </div>
          {subscriptions.length > 0 && (
            <div className="text-right">
              <p className="text-sm font-medium">
                Total Monthly: ${subscriptions
                  .filter(sub => sub.status === 'active')
                  .reduce((sum, sub) => sum + getMonthlyAmount(sub), 0)
                  .toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {subscriptions.filter(sub => sub.status === 'active').length} active
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {subscriptions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No subscriptions detected yet</h3>
            <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
              Connect your Gmail account and scan your emails to automatically detect subscription receipts.
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Receipt-based detection</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Secure & private</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((sub) => {
              const urgency = getPaymentUrgency(sub.nextPaymentDate);
              const monthlyAmount = getMonthlyAmount(sub);
              
              return (
                <div key={sub.id || sub.emailId} className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">{getServiceEmoji(sub.serviceName)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-sm truncate">{sub.serviceName}</h4>
                        <Badge variant={getStatusBadgeVariant(sub.status)} className="text-xs">
                          {sub.status}
                        </Badge>
                        {sub.confidence < 0.8 && (
                          <AlertTriangle className="h-3 w-3 text-yellow-500" title="Low confidence detection" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="capitalize">{sub.category}</span>
                        <span>•</span>
                        <span className="capitalize">{sub.billingCycle}</span>
                        {sub.billingCycle !== 'monthly' && (
                          <>
                            <span>•</span>
                            <span>${monthlyAmount.toFixed(2)}/mo</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-semibold text-sm">
                        ${sub.amount.toFixed(2)}
                      </div>
                      <div className={`text-xs flex items-center gap-1 ${
                        urgency === 'urgent' ? 'text-red-600' :
                        urgency === 'warning' ? 'text-yellow-600' :
                        'text-muted-foreground'
                      }`}>
                        <Calendar className="h-3 w-3" />
                        {formatNextPayment(sub.nextPaymentDate)}
                      </div>
                    </div>
                    
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            
            {subscriptions.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Last updated: {new Date().toLocaleDateString()}
                  </span>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ExternalLink className="h-3 w-3" />
                    View Details
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}