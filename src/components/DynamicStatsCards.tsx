import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, CreditCard, TrendingUp, Calendar } from "lucide-react";
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
            <p className="text-sm text-muted-foreground mt-2">
              Scan your emails to detect subscriptions automatically
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getChangeText = (current: number, type: string) => {
    if (current === 0) return "No subscriptions yet";
    
    switch (type) {
      case 'spending':
        return `$${(current * 12).toFixed(0)} yearly`;
      case 'active':
        return stats.trialSubscriptions > 0 ? `${stats.trialSubscriptions} trials` : "All active";
      case 'yearly':
        return `$${(current / 12).toFixed(0)} monthly`;
      case 'upcoming':
        return current === 1 ? "1 payment due" : `${current} payments due`;
      default:
        return "";
    }
  };

  const getChangeColor = (type: string, value: number) => {
    switch (type) {
      case 'spending':
        return value > 100 ? 'text-red-600' : value > 50 ? 'text-yellow-600' : 'text-green-600';
      case 'upcoming':
        return value > 3 ? 'text-red-600' : value > 1 ? 'text-yellow-600' : 'text-green-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const statsData = [
    {
      title: "Monthly Spending",
      value: `$${stats.totalMonthlySpending.toFixed(2)}`,
      change: getChangeText(stats.totalMonthlySpending, 'spending'),
      changeType: getChangeColor('spending', stats.totalMonthlySpending),
      icon: DollarSign,
    },
    {
      title: "Active Subscriptions",
      value: stats.activeSubscriptions.toString(),
      change: getChangeText(stats.activeSubscriptions, 'active'),
      changeType: 'text-muted-foreground',
      icon: CreditCard,
    },
    {
      title: "Yearly Projection",
      value: `$${stats.totalYearlySpending.toFixed(2)}`,
      change: getChangeText(stats.totalYearlySpending, 'yearly'),
      changeType: 'text-muted-foreground',
      icon: TrendingUp,
    },
    {
      title: "Upcoming Payments",
      value: stats.upcomingPayments.length.toString(),
      change: getChangeText(stats.upcomingPayments.length, 'upcoming'),
      changeType: getChangeColor('upcoming', stats.upcomingPayments.length),
      icon: Calendar,
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
            <p className={`text-xs ${stat.changeType}`}>
              {stat.change}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}