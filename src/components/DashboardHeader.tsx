import { Button } from "@/components/ui/button";
import { Plus, Download, Info, Search } from "lucide-react";

interface DashboardHeaderProps {
  onShowDetails: () => void;
  onScanSubscriptions: () => void;
}

export function DashboardHeader({ onShowDetails, onScanSubscriptions }: DashboardHeaderProps) {
  return (
    <div className="flex-1 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Track and manage your subscriptions</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onShowDetails}>
          <Info className="h-4 w-4 mr-2" />
          Details
        </Button>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button size="sm" onClick={onScanSubscriptions} className="bg-gradient-to-r from-blue-600 to-purple-600">
          <Search className="h-4 w-4 mr-2" />
          Scan & Add Subscriptions
        </Button>
      </div>
    </div>
  );
}