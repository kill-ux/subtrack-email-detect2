
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const Analytics = () => {
  const monthlyData = [
    { month: "Jan", spending: 245 },
    { month: "Feb", spending: 289 },
    { month: "Mar", spending: 267 },
    { month: "Apr", spending: 298 },
    { month: "May", spending: 312 },
    { month: "Jun", spending: 335 }
  ];

  const categoryData = [
    { category: "Entertainment", amount: 89 },
    { category: "Productivity", amount: 65 },
    { category: "News", amount: 45 },
    { category: "Music", amount: 35 },
    { category: "Cloud Storage", amount: 25 }
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex items-center gap-4 border-b px-6 py-3">
            <SidebarTrigger />
            <div>
              <h1 className="text-2xl font-bold">Analytics</h1>
              <p className="text-muted-foreground">Detailed insights into your spending patterns</p>
            </div>
          </div>
          <div className="flex-1 p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Spending Trend</CardTitle>
                  <CardDescription>Your subscription spending over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="spending" stroke="#8884d8" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Spending by Category</CardTitle>
                  <CardDescription>Breakdown of your subscriptions by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="amount" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Analytics;
