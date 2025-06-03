
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";

const upcomingPayments = [
  {
    service: "Netflix",
    amount: "$15.99",
    date: "Dec 15",
    daysLeft: 3,
    color: "bg-red-500",
  },
  {
    service: "Spotify",
    amount: "$9.99",
    date: "Dec 18",
    daysLeft: 6,
    color: "bg-green-500",
  },
  {
    service: "GitHub Pro",
    amount: "$4.00",
    date: "Dec 22",
    daysLeft: 10,
    color: "bg-gray-800",
  },
  {
    service: "Adobe CC",
    amount: "$52.99",
    date: "Dec 28",
    daysLeft: 16,
    color: "bg-red-600",
  },
];

export function UpcomingPayments() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Upcoming Payments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {upcomingPayments.map((payment) => (
          <div key={payment.service} className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${payment.color}`} />
              <div>
                <p className="font-medium text-sm">{payment.service}</p>
                <p className="text-xs text-muted-foreground">{payment.date}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-sm">{payment.amount}</p>
              <Badge variant="secondary" className="text-xs">
                {payment.daysLeft} days
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
