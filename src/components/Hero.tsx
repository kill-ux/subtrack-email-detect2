import { ArrowRight, Mail, TrendingUp, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const Hero = () => {
  return (
    <section className="pt-24 pb-16 bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-6xl font-bold text-gray-900 leading-tight">
                Never Miss a 
                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {" "}Subscription
                </span>
                {" "}Again
              </h1>
              <p className="text-xl text-gray-600 leading-relaxed">
                Our AI automatically scans your email to track all your subscriptions, 
                sending you smart alerts and insights to save money and stay organized.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/login">
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-lg px-8 py-6"
                >
                  Connect Your Email
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg px-8 py-6 border-2"
              >
                Watch Demo
              </Button>
            </div>

            <div className="flex items-center space-x-8 text-sm text-gray-500">
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <span>Read-only access</span>
              </div>
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4" />
                <span>AI-powered detection</span>
              </div>
              <div className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4" />
                <span>Save $1000+ yearly</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="bg-white rounded-2xl shadow-2xl p-6 border border-gray-200">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Monthly Overview</h3>
                  <span className="text-2xl font-bold text-red-500">$247.89</span>
                </div>
                
                <div className="space-y-3">
                  {[
                    { name: "Netflix", amount: "$15.99", color: "bg-red-500" },
                    { name: "Spotify", amount: "$9.99", color: "bg-green-500" },
                    { name: "Adobe Creative", amount: "$52.99", color: "bg-blue-500" },
                    { name: "AWS", amount: "$89.47", color: "bg-orange-500" },
                    { name: "GitHub Pro", amount: "$4.00", color: "bg-purple-500" }
                  ].map((sub, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${sub.color}`}></div>
                        <span className="font-medium text-gray-900">{sub.name}</span>
                      </div>
                      <span className="font-semibold text-gray-900">{sub.amount}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-yellow-800">
                        Found 3 unused subscriptions this month
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
