
import { useState } from 'react';
import { Calendar, ChevronDown, DollarSign, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Dashboard = () => {
  const [selectedMonth, setSelectedMonth] = useState('2024-06');
  
  const months = [
    { value: '2024-06', label: 'June 2024' },
    { value: '2024-05', label: 'May 2024' },
    { value: '2024-04', label: 'April 2024' },
    { value: '2024-03', label: 'March 2024' },
    { value: '2024-02', label: 'February 2024' },
    { value: '2024-01', label: 'January 2024' },
  ];

  const subscriptions = [
    { name: "Netflix", amount: 15.99, status: "active", nextBilling: "2024-06-15", category: "Entertainment" },
    { name: "Spotify", amount: 9.99, status: "active", nextBilling: "2024-06-10", category: "Music" },
    { name: "Adobe Creative Cloud", amount: 52.99, status: "active", nextBilling: "2024-06-20", category: "Software" },
    { name: "AWS", amount: 89.47, status: "active", nextBilling: "2024-06-01", category: "Cloud" },
    { name: "GitHub Pro", amount: 4.00, status: "active", nextBilling: "2024-06-25", category: "Development" },
    { name: "Unused Fitness App", amount: 29.99, status: "inactive", nextBilling: "2024-06-12", category: "Health" },
  ];

  const totalActive = subscriptions.filter(sub => sub.status === 'active').reduce((sum, sub) => sum + sub.amount, 0);
  const totalInactive = subscriptions.filter(sub => sub.status === 'inactive').reduce((sum, sub) => sum + sub.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">Track and manage your subscriptions</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Active</p>
                <p className="text-2xl font-bold text-gray-900">${totalActive.toFixed(2)}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Potential Savings</p>
                <p className="text-2xl font-bold text-red-600">${totalInactive.toFixed(2)}</p>
              </div>
              <div className="bg-red-100 p-3 rounded-lg">
                <TrendingDown className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Subscriptions</p>
                <p className="text-2xl font-bold text-gray-900">{subscriptions.filter(s => s.status === 'active').length}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Unused Services</p>
                <p className="text-2xl font-bold text-orange-600">{subscriptions.filter(s => s.status === 'inactive').length}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg">
                <AlertCircle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Subscriptions List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Your Subscriptions</h2>
          </div>
          
          <div className="divide-y divide-gray-200">
            {subscriptions.map((subscription, index) => (
              <div key={index} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`w-3 h-3 rounded-full ${subscription.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <div>
                      <h3 className="font-medium text-gray-900">{subscription.name}</h3>
                      <p className="text-sm text-gray-500">{subscription.category}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">${subscription.amount}</p>
                      <p className="text-sm text-gray-500">Next: {subscription.nextBilling}</p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        subscription.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {subscription.status}
                      </span>
                      
                      {subscription.status === 'inactive' && (
                        <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50">
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
