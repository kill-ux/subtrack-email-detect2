
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, CreditCard, TrendingUp, TrendingDown } from "lucide-react";

export function StatsCards() {
  const stats = [
    {
      title: "Monthly Spending",
      value: "$247.99",
      change: "+12% from last month",
      changeType: "increase",
      icon: DollarSign,
    },
    {
      title: "Active Subscriptions",
      value: "12",
      change: "+2 this month",
      changeType: "increase",
      icon: CreditCard,
    },
    {
      title: "Yearly Projection",
      value: "$2,975.88",
      change: "Based on current subs",
      changeType: "neutral",
      icon: TrendingUp,
    },
    {
      title: "Potential Savings",
      value: "$89.99",
      change: "From unused subs",
      changeType: "decrease",
      icon: TrendingDown,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat) => (
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
