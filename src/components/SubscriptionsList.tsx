
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, AlertTriangle } from "lucide-react";

const subscriptions = [
  {
    id: 1,
    service: "Netflix",
    category: "Entertainment",
    amount: "$15.99",
    billing: "Monthly",
    nextPayment: "Dec 15, 2024",
    status: "active",
    usage: "High",
    logo: "🎬",
  },
  {
    id: 2,
    service: "Spotify Premium",
    category: "Music",
    amount: "$9.99",
    billing: "Monthly",
    nextPayment: "Dec 18, 2024",
    status: "active",
    usage: "High",
    logo: "🎵",
  },
  {
    id: 3,
    service: "GitHub Pro",
    category: "Development",
    amount: "$4.00",
    billing: "Monthly",
    nextPayment: "Dec 22, 2024",
    status: "active",
    usage: "Medium",
    logo: "⚡",
  },
  {
    id: 4,
    service: "Adobe Creative Cloud",
    category: "Design",
    amount: "$52.99",
    billing: "Monthly",
    nextPayment: "Dec 28, 2024",
    status: "active",
    usage: "Low",
    logo: "🎨",
  },
  {
    id: 5,
    service: "Dropbox Plus",
    category: "Storage",
    amount: "$9.99",
    billing: "Monthly",
    nextPayment: "Jan 5, 2025",
    status: "warning",
    usage: "Low",
    logo: "☁️",
  },
];

export function SubscriptionsList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>All Subscriptions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Service</th>
                <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Category</th>
                <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Amount</th>
                <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Billing</th>
                <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Next Payment</th>
                <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Usage</th>
                <th className="text-left py-3 px-2 font-medium text-sm text-muted-foreground">Status</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="border-b hover:bg-muted/50">
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{sub.logo}</span>
                      <span className="font-medium">{sub.service}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-sm text-muted-foreground">{sub.category}</td>
                  <td className="py-3 px-2 font-semibold">{sub.amount}</td>
                  <td className="py-3 px-2 text-sm">{sub.billing}</td>
                  <td className="py-3 px-2 text-sm">{sub.nextPayment}</td>
                  <td className="py-3 px-2">
                    <Badge variant={
                      sub.usage === 'High' ? 'default' :
                      sub.usage === 'Medium' ? 'secondary' :
                      'destructive'
                    } className="text-xs">
                      {sub.usage}
                    </Badge>
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={sub.status === 'active' ? 'default' : 'destructive'} className="text-xs">
                        {sub.status === 'active' ? 'Active' : 'Review'}
                      </Badge>
                      {sub.status === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
