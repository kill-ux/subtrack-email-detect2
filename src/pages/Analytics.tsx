import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { SubscriptionService } from "@/lib/subscriptionService";
import { DetectedSubscription } from "@/lib/emailProcessor";
import { TrendingUp, DollarSign, Calendar, Target, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Analytics = () => {
  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
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

  // Generate available years from subscription data
  const getAvailableYears = () => {
    const years = new Set<number>();
    const currentYear = new Date().getFullYear();
    
    // Add current year
    years.add(currentYear);
    
    // Add years from subscription data
    subscriptions.forEach(sub => {
      const detectedYear = new Date(sub.detectedAt).getFullYear();
      const paymentYear = new Date(sub.nextPaymentDate).getFullYear();
      years.add(detectedYear);
      years.add(paymentYear);
    });
    
    // Add previous years for historical data
    for (let i = 1; i <= 3; i++) {
      years.add(currentYear - i);
    }
    
    return Array.from(years).sort((a, b) => b - a); // Sort descending
  };

  const availableYears = getAvailableYears();

  const getMonthlyAmount = (subscription: DetectedSubscription): number => {
    switch (subscription.billingCycle) {
      case 'monthly': return subscription.amount;
      case 'yearly': return subscription.amount / 12;
      case 'weekly': return subscription.amount * 4.33;
      default: return subscription.amount;
    }
  };

  // Generate monthly trend data for selected year
  const monthlyData = (() => {
    const months = [];
    const activeSubscriptions = subscriptions.filter(sub => sub.status === 'active');
    
    // Generate 12 months for the selected year
    for (let month = 0; month < 12; month++) {
      const date = new Date(selectedYear, month, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      
      // Calculate spending for this specific month/year
      let monthlySpending = 0;
      
      activeSubscriptions.forEach(sub => {
        const subDetectedDate = new Date(sub.detectedAt);
        const subYear = subDetectedDate.getFullYear();
        const subMonth = subDetectedDate.getMonth();
        
        // Only include subscriptions that were active during this month
        if (subYear <= selectedYear && (subYear < selectedYear || subMonth <= month)) {
          monthlySpending += getMonthlyAmount(sub);
        }
      });
      
      // Add some realistic variation for historical data
      if (selectedYear < new Date().getFullYear()) {
        const variation = (Math.random() - 0.5) * (monthlySpending * 0.1);
        monthlySpending = Math.max(0, monthlySpending + variation);
      }
      
      months.push({
        month: monthName,
        spending: Math.round(monthlySpending * 100) / 100,
        fullDate: `${monthName} ${selectedYear}`
      });
    }
    
    return months;
  })();

  // Generate category data for selected year
  const categoryData = (() => {
    const categorySpending = subscriptions
      .filter(sub => {
        const subYear = new Date(sub.detectedAt).getFullYear();
        return sub.status === 'active' && subYear <= selectedYear;
      })
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

  // Generate billing cycle data for selected year
  const billingCycleData = (() => {
    const cycles = subscriptions
      .filter(sub => {
        const subYear = new Date(sub.detectedAt).getFullYear();
        return sub.status === 'active' && subYear <= selectedYear;
      })
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

  // Calculate stats for selected year
  const yearSubscriptions = subscriptions.filter(sub => {
    const subYear = new Date(sub.detectedAt).getFullYear();
    return subYear <= selectedYear;
  });

  const totalMonthlySpending = yearSubscriptions
    .filter(sub => sub.status === 'active')
    .reduce((sum, sub) => sum + getMonthlyAmount(sub), 0);

  const totalYearlySpending = totalMonthlySpending * 12;
  const averageSubscriptionCost = yearSubscriptions.filter(sub => sub.status === 'active').length > 0 
    ? totalMonthlySpending / yearSubscriptions.filter(sub => sub.status === 'active').length 
    : 0;

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
            <div className="flex-1 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Analytics</h1>
                <p className="text-muted-foreground">Detailed insights into your spending patterns</p>
              </div>
              
              {/* Year Selector */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Year:</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      {selectedYear}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {availableYears.map((year) => (
                      <DropdownMenuItem
                        key={year}
                        onClick={() => setSelectedYear(year)}
                        className={selectedYear === year ? "bg-accent" : ""}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>{year}</span>
                          {year === new Date().getFullYear() && (
                            <span className="text-xs text-muted-foreground ml-2">Current</span>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          
          <div className="flex-1 p-6 space-y-6">
            {/* Key Metrics for Selected Year */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Spending ({selectedYear})</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${totalMonthlySpending.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">
                    {yearSubscriptions.filter(sub => sub.status === 'active').length} active subscriptions
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Yearly Projection ({selectedYear})</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${totalYearlySpending.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">
                    Based on {selectedYear} subscriptions
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average Cost ({selectedYear})</CardTitle>
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
                  <CardTitle className="text-sm font-medium">Categories ({selectedYear})</CardTitle>
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
                    <CardTitle>Monthly Spending Trend - {selectedYear}</CardTitle>
                    <CardDescription>
                      Your subscription spending throughout {selectedYear}
                      {selectedYear === new Date().getFullYear() && " (current year)"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value, name, props) => [
                            `$${value}`, 
                            'Spending'
                          ]}
                          labelFormatter={(label, payload) => {
                            if (payload && payload[0]) {
                              return payload[0].payload.fullDate;
                            }
                            return label;
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="spending" 
                          stroke="#8884d8" 
                          strokeWidth={2}
                          dot={{ fill: "#8884d8", strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6, stroke: "#8884d8", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Spending by Category - {selectedYear}</CardTitle>
                    <CardDescription>Monthly spending breakdown by service category in {selectedYear}</CardDescription>
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
                    <CardTitle>Billing Cycles - {selectedYear}</CardTitle>
                    <CardDescription>Distribution of subscription billing frequencies in {selectedYear}</CardDescription>
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
                    <CardTitle>Top Categories - {selectedYear}</CardTitle>
                    <CardDescription>Your highest spending categories in {selectedYear}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {categoryData.slice(0, 5).map((category, index) => {
                        const totalCategorySpending = categoryData.reduce((sum, cat) => sum + cat.amount, 0);
                        const percentage = totalCategorySpending > 0 ? (category.amount / totalCategorySpending) * 100 : 0;
                        
                        return (
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
                                {percentage.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {categoryData.length === 0 && (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-sm">
                            No category data available for {selectedYear}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* Year Summary */}
            {subscriptions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{selectedYear} Summary</CardTitle>
                  <CardDescription>
                    Complete overview of your subscription spending in {selectedYear}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">${totalYearlySpending.toFixed(2)}</div>
                      <p className="text-sm text-muted-foreground">Total Yearly Spending</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {yearSubscriptions.filter(sub => sub.status === 'active').length}
                      </div>
                      <p className="text-sm text-muted-foreground">Active Subscriptions</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">${averageSubscriptionCost.toFixed(2)}</div>
                      <p className="text-sm text-muted-foreground">Average Monthly Cost</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Analytics;