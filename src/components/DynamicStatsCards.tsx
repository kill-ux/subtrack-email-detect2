import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, CreditCard, TrendingUp, TrendingDown } from "lucide-react";
import { SubscriptionStats } from "@/lib/subscriptionService";

interface DynamicStatsCardsProps {
  stats: SubscriptionStats | null;
  loading: boolean;
}

export function DynamicStatsCards({ stats, loading }: DynamicStatsCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-4 w-4 bg-gray-200 rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-20"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No subscription data available</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statsData = [
    {
      title: "Monthly Spending",
      value: `$${stats.totalMonthlySpending.toFixed(2)}`,
      change: "+12% from last month",
      changeType: "increase",
      icon: DollarSign,
    },
    {
      title: "Active Subscriptions",
      value: stats.activeSubscriptions.toString(),
      change: `${stats.trialSubscriptions} trials`,
      changeType: "neutral",
      icon: CreditCard,
    },
    {
      title: "Yearly Projection",
      value: `$${stats.totalYearlySpending.toFixed(2)}`,
      change: "Based on current subs",
      changeType: "neutral",
      icon: TrendingUp,
    },
    {
      title: "Upcoming Payments",
      value: stats.upcomingPayments.length.toString(),
      change: "Next 30 days",
      changeType: "neutral",
      icon: TrendingDown,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statsData.map((stat) => (
        <Card key={stat.title} className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className={`text-xs ${
              stat.changeType === 'increase' ? 'text-green-600' :
              stat.changeType === 'decrease' ? 'text-red-600' :
              'text-muted-foreground'
            }`}>
              {stat.change}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}