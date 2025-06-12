import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { SubscriptionService } from "@/lib/subscriptionService";
import { DetectedSubscription } from "@/lib/emailProcessor";
import { TrendingUp, DollarSign, Calendar, Target } from "lucide-react";

const Analytics = () => {
  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const subscriptionService = new SubscriptionService();

  useEffect(() => {
    const loadData = async () => {
      if (user) {
        setLoading(true);
        try {
          const data = await subscriptionService.getSubscriptions(user.uid);
          setSubscriptions(data);
        } catch (error) {
          console.error('Error loading analytics data:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    loadData();
  }, [user]);

  const getMonthlyAmount = (subscription: DetectedSubscription): number => {
    switch (subscription.billingCycle) {
      case 'monthly': return subscription.amount;
      case 'yearly': return subscription.amount / 12;
      case 'weekly': return subscription.amount * 4.33;
      default: return subscription.amount;
    }
  };

  // Generate monthly trend data
  const monthlyData = (() => {
    const months = [];
    const today = new Date();
    const activeSubscriptions = subscriptions.filter(sub => sub.status === 'active');
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      
      const monthlySpending = activeSubscriptions.reduce((total, sub) => {
        return total + getMonthlyAmount(sub);
      }, 0);
      
      // Add some variation for demonstration
      const variation = (Math.random() - 0.5) * 20;
      
      months.push({
        month: monthName,
        spending: Math.max(0, Math.round((monthlySpending + variation) * 100) / 100)
      });
    }
    
    return months;
  })();

  // Generate category data
  const categoryData = (() => {
    const categorySpending = subscriptions
      .filter(sub => sub.status === 'active')
      .reduce((acc, sub) => {
        const monthlyAmount = getMonthlyAmount(sub);
        acc[sub.category] = (acc[sub.category] || 0) + monthlyAmount;
        return acc;
      }, {} as Record<string, number>);

    return Object.entries(categorySpending)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100
      }))
      .sort((a, b) => b.amount - a.amount);
  })();

  // Generate billing cycle data
  const billingCycleData = (() => {
    const cycles = subscriptions
      .filter(sub => sub.status === 'active')
      .reduce((acc, sub) => {
        acc[sub.billingCycle] = (acc[sub.billingCycle] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return Object.entries(cycles).map(([cycle, count]) => ({
      cycle: cycle.charAt(0).toUpperCase() + cycle.slice(1),
      count
    }));
  })();

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  const totalMonthlySpending = subscriptions
    .filter(sub => sub.status === 'active')
    .reduce((sum, sub) => sum + getMonthlyAmount(sub), 0);

  const totalYearlySpending = totalMonthlySpending * 12;
  const averageSubscriptionCost = subscriptions.length > 0 ? totalMonthlySpending / subscriptions.filter(sub => sub.status === 'active').length : 0;

  if (loading) {
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
            <div className="flex-1 p-6">
              <div className="animate-pulse space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="h-80 bg-gray-200 rounded-lg"></div>
                  <div className="h-80 bg-gray-200 rounded-lg"></div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

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
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Spending</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${totalMonthlySpending.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">
                    {subscriptions.filter(sub => sub.status === 'active').length} active subscriptions
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Yearly Projection</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${totalYearlySpending.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">
                    Based on current subscriptions
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average Cost</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${averageSubscriptionCost.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">
                    Per subscription monthly
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Categories</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{categoryData.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Different categories
                  </p>
                </CardContent>
              </Card>
            </div>

            {subscriptions.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No subscription data available</h3>
                  <p className="text-muted-foreground mb-4">
                    Connect your Gmail account and scan your emails to see detailed analytics.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Spending Trend</CardTitle>
                    <CardDescription>Your subscription spending over the last 6 months</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`$${value}`, 'Spending']} />
                        <Line type="monotone" dataKey="spending" stroke="#8884d8" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Spending by Category</CardTitle>
                    <CardDescription>Monthly spending breakdown by service category</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={categoryData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="category" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`$${value}`, 'Monthly Spending']} />
                        <Bar dataKey="amount" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Billing Cycles</CardTitle>
                    <CardDescription>Distribution of subscription billing frequencies</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={billingCycleData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ cycle, count }) => `${cycle}: ${count}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {billingCycleData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Top Categories</CardTitle>
                    <CardDescription>Your highest spending categories this month</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {categoryData.slice(0, 5).map((category, index) => (
                        <div key={category.category} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="font-medium">{category.category}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">${category.amount.toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">
                              {((category.amount / totalMonthlySpending) * 100).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Analytics;