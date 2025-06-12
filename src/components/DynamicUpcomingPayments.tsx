import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
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
    if (name.includes('adobe')) return 'bg-red-600';
    if (name.includes('dropbox')) return 'bg-blue-500';
    if (name.includes('microsoft')) return 'bg-blue-600';
    if (name.includes('google')) return 'bg-yellow-500';
    if (name.includes('stackblitz')) return 'bg-blue-400';
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
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Upcoming Payments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {upcomingPayments.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-muted-foreground">No upcoming payments in the next 30 days</p>
          </div>
        ) : (
          upcomingPayments.slice(0, 5).map((payment, index) => (
            <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${getServiceColor(payment.serviceName)}`} />
                <div>
                  <p className="font-medium text-sm">{payment.serviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(payment.nextPaymentDate)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-sm">${payment.amount.toFixed(2)}</p>
                <Badge 
                  variant={payment.daysUntilPayment <= 3 ? "destructive" : "secondary"} 
                  className="text-xs"
                >
                  {getDaysLabel(payment.daysUntilPayment)}
                </Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}