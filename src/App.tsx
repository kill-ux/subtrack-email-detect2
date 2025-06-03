import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import SignIn from "./pages/SignIn";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Subscriptions from "./pages/Subscriptions";
import Analytics from "./pages/Analytics";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/login" element={<Login />} />

          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/subscriptions" element={<Subscriptions />} />
          <Route path="/dashboard/analytics" element={<Analytics />} />
          <Route path="/dashboard/notifications" element={<Notifications />} />
          <Route path="/dashboard/settings" element={<Settings />} />

          {/* Catch-all route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
