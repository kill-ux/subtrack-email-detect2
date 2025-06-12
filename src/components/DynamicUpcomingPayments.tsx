import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { SubscriptionStats } from "@/lib/subscriptionService";

interface DynamicUpcomingPaymentsProps {
  stats: SubscriptionStats | null;
  loading: boolean;
}

export function DynamicUpcomingPayments({ stats, loading }: DynamicUpcomingPaymentsProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Upcoming Payments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-gray-200 rounded-full"></div>
                <div>
                  <div className="h-4 bg-gray-200 rounded w-20 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
              <div className="text-right">
                <div className="h-4 bg-gray-200 rounded w-12 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const upcomingPayments = stats?.upcomingPayments || [];

  const getServiceColor = (serviceName: string): string => {
    const name = serviceName.toLowerCase();
    if (name.includes('netflix')) return 'bg-red-500';
    if (name.includes('spotify')) return 'bg-green-500';
    if (name.includes('github')) return 'bg-gray-800';
    if (name.includes('stackblitz')) return 'bg-blue-400';
    if (name.includes('adobe')) return 'bg-red-600';
    if (name.includes('dropbox')) return 'bg-blue-500';
    if (name.includes('microsoft')) return 'bg-blue-600';
    if (name.includes('google')) return 'bg-yellow-500';
    if (name.includes('figma')) return 'bg-purple-500';
    if (name.includes('notion')) return 'bg-gray-700';
    return 'bg-purple-500';
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getDaysLabel = (days: number): string => {
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  const getUrgencyIcon = (days: number) => {
    if (days < 0) return <AlertTriangle className="h-3 w-3 text-red-500" />;
    if (days <= 1) return <AlertTriangle className="h-3 w-3 text-red-500" />;
    if (days <= 7) return <Clock className="h-3 w-3 text-yellow-500" />;
    return <CheckCircle className="h-3 w-3 text-green-500" />;
  };

  const getBadgeVariant = (days: number) => {
    if (days < 0) return "destructive";
    if (days <= 1) return "destructive";
    if (days <= 7) return "secondary";
    return "outline";
  };

  const totalUpcoming = upcomingPayments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Upcoming Payments
          </CardTitle>
          {upcomingPayments.length > 0 && (
            <div className="text-right">
              <p className="text-sm font-medium">${totalUpcoming.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">next 30 days</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcomingPayments.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="font-medium text-sm mb-1">All caught up!</h3>
            <p className="text-xs text-muted-foreground">
              No payments due in the next 30 days
            </p>
          </div>
        ) : (
          <>
            {upcomingPayments.slice(0, 6).map((payment, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${getServiceColor(payment.serviceName)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{payment.serviceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(payment.nextPaymentDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="font-semibold text-sm">${payment.amount.toFixed(2)}</p>
                    <div className="flex items-center gap-1">
                      {getUrgencyIcon(payment.daysUntilPayment)}
                      <Badge 
                        variant={getBadgeVariant(payment.daysUntilPayment)} 
                        className="text-xs"
                      >
                        {getDaysLabel(payment.daysUntilPayment)}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {upcomingPayments.length > 6 && (
              <div className="text-center pt-2">
                <p className="text-xs text-muted-foreground">
                  +{upcomingPayments.length - 6} more payments this month
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}