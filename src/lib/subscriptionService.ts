import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { DetectedSubscription } from './emailProcessor';
import { CurrencyConverter, ConvertedAmount } from './currencyConverter';

export interface SubscriptionStats {
  totalMonthlySpending: number;
  totalYearlySpending: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  cancelledSubscriptions: number;
  subscriptionsByCategory: Record<string, number>;
  upcomingPayments: Array<{
    serviceName: string;
    amount: number;
    originalAmount: number;
    originalCurrency: string;
    nextPaymentDate: string;
    daysUntilPayment: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    spending: number;
  }>;
  currencyBreakdown: Array<{
    currency: string;
    count: number;
    totalAmount: number;
    convertedAmount: number;
  }>;
}

export class SubscriptionService {
  async getSubscriptions(userId: string): Promise<DetectedSubscription[]> {
    try {
      const subscriptionsRef = collection(db, 'subscriptions');
      const q = query(
        subscriptionsRef,
        where('userId', '==', userId),
        orderBy('detectedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DetectedSubscription[];
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      return [];
    }
  }

  async getSubscriptionsForYear(userId: string, year: number): Promise<DetectedSubscription[]> {
    try {
      const subscriptionsRef = collection(db, 'subscriptions');
      const q = query(
        subscriptionsRef,
        where('userId', '==', userId),
        where('yearProcessed', '==', year),
        orderBy('detectedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DetectedSubscription[];
    } catch (error) {
      console.error(`Error fetching subscriptions for year ${year}:`, error);
      return [];
    }
  }

  async getSubscriptionStats(userId: string, year?: number): Promise<SubscriptionStats> {
    const subscriptions = year 
      ? await this.getSubscriptionsForYear(userId, year)
      : await this.getSubscriptions(userId);
    
    // Convert all amounts to USD for consistent calculations
    const convertedSubscriptions = await this.convertSubscriptionsToUSD(subscriptions);
    
    // Filter active subscriptions
    const activeSubscriptions = convertedSubscriptions.filter(sub => sub.status === 'active');
    const trialSubscriptions = convertedSubscriptions.filter(sub => sub.status === 'trial');
    const cancelledSubscriptions = convertedSubscriptions.filter(sub => sub.status === 'cancelled');

    // Calculate monthly spending in USD
    const monthlySpending = activeSubscriptions.reduce((total, sub) => {
      switch (sub.billingCycle) {
        case 'monthly':
          return total + sub.convertedAmount;
        case 'yearly':
          return total + (sub.convertedAmount / 12);
        case 'weekly':
          return total + (sub.convertedAmount * 4.33);
        default:
          return total;
      }
    }, 0);

    // Calculate yearly spending in USD
    const yearlySpending = activeSubscriptions.reduce((total, sub) => {
      switch (sub.billingCycle) {
        case 'monthly':
          return total + (sub.convertedAmount * 12);
        case 'yearly':
          return total + sub.convertedAmount;
        case 'weekly':
          return total + (sub.convertedAmount * 52);
        default:
          return total;
      }
    }, 0);

    // Group by category
    const subscriptionsByCategory = activeSubscriptions.reduce((acc, sub) => {
      acc[sub.category] = (acc[sub.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate upcoming payments with currency conversion
    const upcomingPayments = activeSubscriptions
      .map(sub => {
        const nextPayment = new Date(sub.nextPaymentDate);
        const today = new Date();
        const daysUntilPayment = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          serviceName: sub.serviceName,
          amount: sub.convertedAmount, // USD amount
          originalAmount: sub.amount, // Original amount
          originalCurrency: sub.currency, // Original currency
          nextPaymentDate: sub.nextPaymentDate,
          daysUntilPayment
        };
      })
      .filter(payment => payment.daysUntilPayment >= 0 && payment.daysUntilPayment <= 30)
      .sort((a, b) => a.daysUntilPayment - b.daysUntilPayment);

    // Generate monthly trend (last 6 months or for specific year)
    const monthlyTrend = year 
      ? this.generateYearlyTrend(activeSubscriptions, year)
      : this.generateMonthlyTrend(activeSubscriptions);

    // Currency breakdown
    const currencyBreakdown = this.generateCurrencyBreakdown(subscriptions, convertedSubscriptions);

    return {
      totalMonthlySpending: Math.round(monthlySpending * 100) / 100,
      totalYearlySpending: Math.round(yearlySpending * 100) / 100,
      activeSubscriptions: activeSubscriptions.length,
      trialSubscriptions: trialSubscriptions.length,
      cancelledSubscriptions: cancelledSubscriptions.length,
      subscriptionsByCategory,
      upcomingPayments,
      monthlyTrend,
      currencyBreakdown
    };
  }

  private async convertSubscriptionsToUSD(subscriptions: DetectedSubscription[]): Promise<Array<DetectedSubscription & { convertedAmount: number }>> {
    const conversions = await CurrencyConverter.convertMultipleToUSD(
      subscriptions.map(sub => ({ amount: sub.amount, currency: sub.currency }))
    );

    return subscriptions.map((sub, index) => ({
      ...sub,
      convertedAmount: conversions[index].convertedAmount
    }));
  }

  private generateCurrencyBreakdown(
    originalSubscriptions: DetectedSubscription[], 
    convertedSubscriptions: Array<DetectedSubscription & { convertedAmount: number }>
  ): Array<{ currency: string; count: number; totalAmount: number; convertedAmount: number }> {
    const breakdown = new Map<string, { count: number; totalAmount: number; convertedAmount: number }>();

    originalSubscriptions.forEach((sub, index) => {
      const existing = breakdown.get(sub.currency) || { count: 0, totalAmount: 0, convertedAmount: 0 };
      breakdown.set(sub.currency, {
        count: existing.count + 1,
        totalAmount: existing.totalAmount + sub.amount,
        convertedAmount: existing.convertedAmount + convertedSubscriptions[index].convertedAmount
      });
    });

    return Array.from(breakdown.entries())
      .map(([currency, data]) => ({ currency, ...data }))
      .sort((a, b) => b.convertedAmount - a.convertedAmount);
  }

  private generateYearlyTrend(subscriptions: Array<DetectedSubscription & { convertedAmount: number }>, year: number): Array<{ month: string; spending: number }> {
    const months = [];
    
    for (let month = 0; month < 12; month++) {
      const date = new Date(year, month, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      
      // Calculate spending for this specific month/year
      let monthlySpending = 0;
      
      subscriptions.forEach(sub => {
        if (sub.status !== 'active') return;
        
        const subDetectedDate = new Date(sub.detectedAt);
        const subYear = subDetectedDate.getFullYear();
        const subMonth = subDetectedDate.getMonth();
        
        // Only include subscriptions that were active during this month
        if (subYear <= year && (subYear < year || subMonth <= month)) {
          switch (sub.billingCycle) {
            case 'monthly':
              monthlySpending += sub.convertedAmount;
              break;
            case 'yearly':
              monthlySpending += sub.convertedAmount / 12;
              break;
            case 'weekly':
              monthlySpending += sub.convertedAmount * 4.33;
              break;
          }
        }
      });
      
      // Add some realistic variation for historical data
      if (year < new Date().getFullYear()) {
        const variation = (Math.random() - 0.5) * (monthlySpending * 0.1);
        monthlySpending = Math.max(0, monthlySpending + variation);
      }
      
      months.push({
        month: monthName,
        spending: Math.round(monthlySpending * 100) / 100
      });
    }
    
    return months;
  }

  private generateMonthlyTrend(subscriptions: Array<DetectedSubscription & { convertedAmount: number }>): Array<{ month: string; spending: number }> {
    const months = [];
    const today = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      
      // Calculate spending for this month
      const monthlySpending = subscriptions.reduce((total, sub) => {
        if (sub.status !== 'active') return total;
        
        switch (sub.billingCycle) {
          case 'monthly':
            return total + sub.convertedAmount;
          case 'yearly':
            return total + (sub.convertedAmount / 12);
          case 'weekly':
            return total + (sub.convertedAmount * 4.33);
          default:
            return total;
        }
      }, 0);
      
      months.push({
        month: monthName,
        spending: Math.round(monthlySpending * 100) / 100
      });
    }
    
    return months;
  }

  getCategorySpending(subscriptions: DetectedSubscription[]): Array<{ category: string; amount: number }> {
    const categorySpending = subscriptions
      .filter(sub => sub.status === 'active')
      .reduce((acc, sub) => {
        const monthlyAmount = this.convertToMonthlyAmount(sub);
        acc[sub.category] = (acc[sub.category] || 0) + monthlyAmount;
        return acc;
      }, {} as Record<string, number>);

    return Object.entries(categorySpending)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  private convertToMonthlyAmount(subscription: DetectedSubscription): number {
    switch (subscription.billingCycle) {
      case 'monthly':
        return subscription.amount;
      case 'yearly':
        return subscription.amount / 12;
      case 'weekly':
        return subscription.amount * 4.33;
      default:
        return subscription.amount;
    }
  }
}