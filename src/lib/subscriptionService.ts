import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { DetectedSubscription } from './emailProcessor';

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
    nextPaymentDate: string;
    daysUntilPayment: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    spending: number;
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

  async getSubscriptionStats(userId: string): Promise<SubscriptionStats> {
    const subscriptions = await this.getSubscriptions(userId);
    
    // Filter active subscriptions
    const activeSubscriptions = subscriptions.filter(sub => sub.status === 'active');
    const trialSubscriptions = subscriptions.filter(sub => sub.status === 'trial');
    const cancelledSubscriptions = subscriptions.filter(sub => sub.status === 'cancelled');

    // Calculate monthly spending
    const monthlySpending = activeSubscriptions.reduce((total, sub) => {
      switch (sub.billingCycle) {
        case 'monthly':
          return total + sub.amount;
        case 'yearly':
          return total + (sub.amount / 12);
        case 'weekly':
          return total + (sub.amount * 4.33); // Average weeks per month
        default:
          return total;
      }
    }, 0);

    // Calculate yearly spending
    const yearlySpending = activeSubscriptions.reduce((total, sub) => {
      switch (sub.billingCycle) {
        case 'monthly':
          return total + (sub.amount * 12);
        case 'yearly':
          return total + sub.amount;
        case 'weekly':
          return total + (sub.amount * 52);
        default:
          return total;
      }
    }, 0);

    // Group by category
    const subscriptionsByCategory = activeSubscriptions.reduce((acc, sub) => {
      acc[sub.category] = (acc[sub.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate upcoming payments
    const upcomingPayments = activeSubscriptions
      .map(sub => {
        const nextPayment = new Date(sub.nextPaymentDate);
        const today = new Date();
        const daysUntilPayment = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          serviceName: sub.serviceName,
          amount: sub.amount,
          nextPaymentDate: sub.nextPaymentDate,
          daysUntilPayment
        };
      })
      .filter(payment => payment.daysUntilPayment >= 0 && payment.daysUntilPayment <= 30)
      .sort((a, b) => a.daysUntilPayment - b.daysUntilPayment);

    // Generate monthly trend (last 6 months)
    const monthlyTrend = this.generateMonthlyTrend(activeSubscriptions);

    return {
      totalMonthlySpending: Math.round(monthlySpending * 100) / 100,
      totalYearlySpending: Math.round(yearlySpending * 100) / 100,
      activeSubscriptions: activeSubscriptions.length,
      trialSubscriptions: trialSubscriptions.length,
      cancelledSubscriptions: cancelledSubscriptions.length,
      subscriptionsByCategory,
      upcomingPayments,
      monthlyTrend
    };
  }

  private generateMonthlyTrend(subscriptions: DetectedSubscription[]): Array<{ month: string; spending: number }> {
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
            return total + sub.amount;
          case 'yearly':
            return total + (sub.amount / 12);
          case 'weekly':
            return total + (sub.amount * 4.33);
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