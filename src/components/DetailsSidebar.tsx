
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, ChevronLeft, ChevronRight, Calendar, DollarSign, Zap } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface DetailsSidebarProps {
  onClose: () => void;
}

// Mock detailed subscription data
const subscriptionsDetails = [
  {
    id: 1,
    name: "Netflix",
    price: 15.99,
    status: "active",
    nextPayment: "2024-02-15",
    description: "Streaming service for movies and TV shows",
    category: "Entertainment",
    billingCycle: "Monthly",
    features: ["4K Streaming", "Multiple Profiles", "Download Content"],
  },
  {
    id: 2,
    name: "Spotify",
    price: 9.99,
    status: "active",
    nextPayment: "2024-02-10",
    description: "Music streaming platform",
    category: "Music",
    billingCycle: "Monthly",
    features: ["Ad-free Music", "Offline Listening", "High Quality Audio"],
  },
  {
    id: 3,
    name: "Adobe Creative Suite",
    price: 52.99,
    status: "active",
    nextPayment: "2024-02-20",
    description: "Complete creative tools suite",
    category: "Productivity",
    billingCycle: "Monthly",
    features: ["Photoshop", "Illustrator", "InDesign", "Cloud Storage"],
  },
  {
    id: 4,
    name: "Microsoft 365",
    price: 12.99,
    status: "active",
    nextPayment: "2024-02-25",
    description: "Office productivity suite",
    category: "Productivity",
    billingCycle: "Monthly",
    features: ["Word", "Excel", "PowerPoint", "OneDrive", "Teams"],
  },
  {
    id: 5,
    name: "GitHub Pro",
    price: 4.00,
    status: "active",
    nextPayment: "2024-02-08",
    description: "Advanced development platform",
    category: "Development",
    billingCycle: "Monthly",
    features: ["Private Repositories", "Advanced Security", "Code Review Tools"],
  },
  {
    id: 6,
    name: "Figma Professional",
    price: 12.00,
    status: "trial",
    nextPayment: "2024-02-28",
    description: "Collaborative design tool",
    category: "Design",
    billingCycle: "Monthly",
    features: ["Unlimited Projects", "Version History", "Team Libraries"],
  },
];

const ITEMS_PER_PAGE = 2;

export function DetailsSidebar({ onClose }: DetailsSidebarProps) {
  const [currentPage, setCurrentPage] = useState(1);
  
  const totalPages = Math.ceil(subscriptionsDetails.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentItems = subscriptionsDetails.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="w-96 border-l bg-background flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Subscription Details</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {currentItems.map((subscription) => (
          <Card key={subscription.id} className="w-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{subscription.name}</CardTitle>
                <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
                  {subscription.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{subscription.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">${subscription.price}</p>
                    <p className="text-xs text-muted-foreground">{subscription.billingCycle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Next Payment</p>
                    <p className="text-xs text-muted-foreground">{subscription.nextPayment}</p>
                  </div>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium mb-2">Category</p>
                <Badge variant="outline">{subscription.category}</Badge>
              </div>
              
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Features
                </p>
                <ul className="space-y-1">
                  {subscription.features.map((feature, index) => (
                    <li key={index} className="text-xs text-muted-foreground flex items-center gap-2">
                      <div className="w-1 h-1 bg-primary rounded-full" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="p-4 border-t">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, subscriptionsDetails.length)} of {subscriptionsDetails.length}
          </p>
        </div>
        
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <PaginationItem key={page}>
                <PaginationLink
                  onClick={() => handlePageChange(page)}
                  isActive={currentPage === page}
                  className="cursor-pointer"
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            ))}
            
            <PaginationItem>
              <PaginationNext 
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
