import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, Search, Download, MoreHorizontal, Calendar, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { SubscriptionService } from "@/lib/subscriptionService";
import { DetectedSubscription } from "@/lib/emailProcessor";

const Subscriptions = () => {
  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'trial' | 'cancelled'>('all');
  const { user } = useAuth();
  const subscriptionService = new SubscriptionService();

  useEffect(() => {
    const loadSubscriptions = async () => {
      if (user) {
        setLoading(true);
        try {
          const data = await subscriptionService.getSubscriptions(user.uid);
          setSubscriptions(data);
        } catch (error) {
          console.error('Error loading subscriptions:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    loadSubscriptions();
  }, [user]);

  const filteredSubscriptions = subscriptions.filter(sub => {
    const matchesSearch = sub.serviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sub.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || sub.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getServiceEmoji = (serviceName: string): string => {
    const name = serviceName.toLowerCase();
    if (name.includes('netflix')) return '🎬';
    if (name.includes('spotify')) return '🎵';
    if (name.includes('github')) return '⚡';
    if (name.includes('stackblitz')) return '⚡';
    if (name.includes('adobe')) return '🎨';
    if (name.includes('dropbox')) return '☁️';
    if (name.includes('microsoft')) return '📊';
    if (name.includes('google')) return '📧';
    if (name.includes('figma')) return '🎨';
    if (name.includes('notion')) return '📝';
    return '📱';
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'trial': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const getMonthlyAmount = (subscription: DetectedSubscription): number => {
    switch (subscription.billingCycle) {
      case 'monthly': return subscription.amount;
      case 'yearly': return subscription.amount / 12;
      case 'weekly': return subscription.amount * 4.33;
      default: return subscription.amount;
    }
  };

  const formatNextPayment = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `${diffDays} days`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  const activeSubscriptions = subscriptions.filter(sub => sub.status === 'active');
  const trialSubscriptions = subscriptions.filter(sub => sub.status === 'trial');
  const cancelledSubscriptions = subscriptions.filter(sub => sub.status === 'cancelled');
  const totalMonthlySpending = activeSubscriptions.reduce((sum, sub) => sum + getMonthlyAmount(sub), 0);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex items-center gap-4 border-b px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Subscriptions</h1>
                <p className="text-muted-foreground">Manage all your subscriptions</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Subscription
                </Button>
              </div>
            </div>
          </div>
          
          <div className="flex-1 p-6 space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{activeSubscriptions.length}</div>
                  <p className="text-xs text-muted-foreground">
                    ${totalMonthlySpending.toFixed(2)}/month
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Trial Subscriptions</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{trialSubscriptions.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {trialSubscriptions.length > 0 ? 'Convert before expiry' : 'No trials active'}
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Spending</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${totalMonthlySpending.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">
                    ${(totalMonthlySpending * 12).toFixed(0)} yearly
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{cancelledSubscriptions.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Recently cancelled
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filters and Search */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>All Subscriptions ({filteredSubscriptions.length})</CardTitle>
                    <CardDescription>Automatically detected from your email receipts</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search subscriptions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 w-64"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant={filterStatus === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterStatus('all')}
                      >
                        All
                      </Button>
                      <Button
                        variant={filterStatus === 'active' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterStatus('active')}
                      >
                        Active
                      </Button>
                      <Button
                        variant={filterStatus === 'trial' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterStatus('trial')}
                      >
                        Trial
                      </Button>
                      <Button
                        variant={filterStatus === 'cancelled' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterStatus('cancelled')}
                      >
                        Cancelled
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="animate-pulse flex items-center justify-between p-4 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                          <div>
                            <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-24"></div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="h-4 bg-gray-200 rounded w-16 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-20"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredSubscriptions.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <DollarSign className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {searchTerm || filterStatus !== 'all' ? 'No matching subscriptions' : 'No subscriptions detected yet'}
                    </h3>
                    <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
                      {searchTerm || filterStatus !== 'all' 
                        ? 'Try adjusting your search or filter criteria'
                        : 'Connect your Gmail account and scan your emails to automatically detect subscription receipts.'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredSubscriptions.map((sub) => (
                      <div key={sub.id || sub.emailId} className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0">
                            <span className="text-2xl">{getServiceEmoji(sub.serviceName)}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm truncate">{sub.serviceName}</h4>
                              <Badge variant={getStatusBadgeVariant(sub.status)} className="text-xs">
                                {sub.status}
                              </Badge>
                              {sub.confidence < 0.8 && (
                                <AlertTriangle className="h-3 w-3 text-yellow-500" title="Low confidence detection" />
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="capitalize">{sub.category}</span>
                              <span>•</span>
                              <span className="capitalize">{sub.billingCycle}</span>
                              {sub.billingCycle !== 'monthly' && (
                                <>
                                  <span>•</span>
                                  <span>${getMonthlyAmount(sub).toFixed(2)}/mo</span>
                                </>
                              )}
                              <span>•</span>
                              <span>Detected {new Date(sub.detectedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="font-semibold text-sm">
                              ${sub.amount.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Next: {formatNextPayment(sub.nextPaymentDate)}
                            </div>
                          </div>
                          
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Subscriptions;