
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { month: 'Jan', spending: 220 },
  { month: 'Feb', spending: 235 },
  { month: 'Mar', spending: 247 },
  { month: 'Apr', spending: 231 },
  { month: 'May', spending: 259 },
  { month: 'Jun', spending: 248 },
];

export function SpendingChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Spending Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value) => [`$${value}`, 'Spending']} />
            <Line 
              type="monotone" 
              dataKey="spending" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: "hsl(var(--primary))" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
