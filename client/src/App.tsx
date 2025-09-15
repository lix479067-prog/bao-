import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import Customers from "@/pages/customers";
import Projects from "@/pages/projects";
import Users from "@/pages/users";
import EmployeeCodes from "@/pages/employee-codes";
import BotConfig from "@/pages/bot-config";
import Templates from "@/pages/templates";
import Settings from "@/pages/settings";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <div className="flex min-h-screen bg-background">
            <Sidebar />
            <div className="flex-1 ml-64">
              <Header />
              <main className="p-6">
                <Switch>
                  <Route path="/" component={Dashboard} />
                  <Route path="/orders" component={Orders} />
                  <Route path="/customers" component={Customers} />
                  <Route path="/projects" component={Projects} />
                  <Route path="/users" component={Users} />
                  <Route path="/employee-codes" component={EmployeeCodes} />
                  <Route path="/bot-config" component={BotConfig} />
                  <Route path="/templates" component={Templates} />
                  <Route path="/settings" component={Settings} />
                  <Route component={NotFound} />
                </Switch>
              </main>
            </div>
          </div>
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
