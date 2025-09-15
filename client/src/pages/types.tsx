import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { OrderDetailsModal } from "@/components/modals/order-details-modal";
import { TelegramUserLink } from "@/components/ui/telegram-user-link";
import { formatDateTimeBeijing } from "@shared/utils/timeUtils";
import { 
  Search, 
  TrendingUp, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RotateCcw,
  Calendar,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  Users,
  Building2,
  BarChart3,
  PieChart,
  Activity
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Types() {
  // Initialize filters from URL parameters
  const getInitialFilters = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      selectedType: urlParams.get('type') || "deposit",
      status: urlParams.get('status') || "all",
      employee: urlParams.get('employee') || "",
      dateFrom: urlParams.get('from') || "",
      dateTo: urlParams.get('to') || "",
      customerPage: parseInt(urlParams.get('customerPage') || "1"),
      projectPage: parseInt(urlParams.get('projectPage') || "1"),
      orderPage: parseInt(urlParams.get('orderPage') || "1"),
    };
  };

  const [filters, setFilters] = useState(getInitialFilters);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.selectedType && filters.selectedType !== "deposit") params.set("type", filters.selectedType);
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.employee) params.set("employee", filters.employee);
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
    if (filters.customerPage > 1) params.set("customerPage", filters.customerPage.toString());
    if (filters.projectPage > 1) params.set("projectPage", filters.projectPage.toString());
    if (filters.orderPage > 1) params.set("orderPage", filters.orderPage.toString());
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [filters]);

  // Type overview data
  const { data: typesOverview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery({
    queryKey: ["/api/types/search", filters.status, filters.employee, filters.dateFrom, filters.dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.append("status", filters.status);
      if (filters.employee) params.append("employee", filters.employee);
      if (filters.dateFrom) params.append("from", filters.dateFrom);
      if (filters.dateTo) params.append("to", filters.dateTo);
      
      return fetch(`/api/types/search?${params}`).then(res => res.json());
    },
    enabled: true,
  });

  // Type statistics
  const { data: typeStats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["/api/types", filters.selectedType, "stats", filters.status, filters.employee, filters.dateFrom, filters.dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.append("status", filters.status);
      if (filters.employee) params.append("employee", filters.employee);
      if (filters.dateFrom) params.append("from", filters.dateFrom);
      if (filters.dateTo) params.append("to", filters.dateTo);
      
      return fetch(`/api/types/${filters.selectedType}/stats?${params}`).then(res => res.json());
    },
    enabled: !!filters.selectedType,
  });

  // Type customers
  const { data: customersData, isLoading: customersLoading, refetch: refetchCustomers } = useQuery({
    queryKey: ["/api/types", filters.selectedType, "customers", filters.status, filters.employee, filters.dateFrom, filters.dateTo, filters.customerPage],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.append("status", filters.status);
      if (filters.employee) params.append("employee", filters.employee);
      if (filters.dateFrom) params.append("from", filters.dateFrom);
      if (filters.dateTo) params.append("to", filters.dateTo);
      params.append("page", filters.customerPage.toString());
      params.append("limit", "10");
      
      return fetch(`/api/types/${filters.selectedType}/customers?${params}`).then(res => res.json());
    },
    enabled: !!filters.selectedType,
  });

  // Type projects
  const { data: projectsData, isLoading: projectsLoading, refetch: refetchProjects } = useQuery({
    queryKey: ["/api/types", filters.selectedType, "projects", filters.status, filters.employee, filters.dateFrom, filters.dateTo, filters.projectPage],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.append("status", filters.status);
      if (filters.employee) params.append("employee", filters.employee);
      if (filters.dateFrom) params.append("from", filters.dateFrom);
      if (filters.dateTo) params.append("to", filters.dateTo);
      params.append("page", filters.projectPage.toString());
      params.append("limit", "10");
      
      return fetch(`/api/types/${filters.selectedType}/projects?${params}`).then(res => res.json());
    },
    enabled: !!filters.selectedType,
  });

  // Type orders
  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ["/api/types", filters.selectedType, "orders", filters.status, filters.employee, filters.dateFrom, filters.dateTo, filters.orderPage],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.append("status", filters.status);
      if (filters.employee) params.append("employee", filters.employee);
      if (filters.dateFrom) params.append("from", filters.dateFrom);
      if (filters.dateTo) params.append("to", filters.dateTo);
      params.append("page", filters.orderPage.toString());
      params.append("limit", "10");
      
      return fetch(`/api/types/${filters.selectedType}/orders?${params}`).then(res => res.json());
    },
    enabled: !!filters.selectedType,
  });

  // Mutation for updating order status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, rejectionReason }: { orderId: string; status: string; rejectionReason?: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status, rejectionReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      refetchStats();
      refetchOrders();
      toast({
        title: "成功",
        description: "订单状态已更新",
      });
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: "更新失败: " + error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for modifying and approving order
  const modifyOrderMutation = useMutation({
    mutationFn: async ({ orderId, modifiedContent }: { orderId: string; modifiedContent: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/modify`, { modifiedContent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      refetchStats();
      refetchOrders();
      toast({
        title: "成功",
        description: "订单已修改并通过",
      });
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: "修改失败: " + error.message,
        variant: "destructive",
      });
    },
  });

  // Quick approve handler for inline buttons
  const handleQuickApprove = (orderId: string) => {
    updateStatusMutation.mutate({ orderId, status: "approved" });
  };

  // Order details modal handlers
  const openOrderDetails = (order: any) => {
    setSelectedOrder(order);
    setIsOrderModalOpen(true);
  };

  const closeOrderDetails = () => {
    setSelectedOrder(null);
    setIsOrderModalOpen(false);
  };

  const handleOrderApprove = (orderId: string) => {
    updateStatusMutation.mutate({ orderId, status: "approved" });
  };

  const handleOrderReject = (orderId: string, rejectionReason: string) => {
    updateStatusMutation.mutate({ orderId, status: "rejected", rejectionReason });
  };

  const handleOrderModifyAndApprove = (orderId: string, modifiedContent: string) => {
    modifyOrderMutation.mutate({ orderId, modifiedContent });
  };

  // Check if any mutation is processing
  const isProcessing = updateStatusMutation.isPending || modifyOrderMutation.isPending;

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "default" as const,
      approved: "default" as const,
      rejected: "destructive" as const,
    };
    
    const labels = {
      pending: "待处理",
      approved: "已确认",
      rejected: "已拒绝",
    };

    return (
      <Badge variant={variants[status as keyof typeof variants] || "default"} data-testid={`status-${status}`}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  const getTypeBadge = (type: string) => {
    const labels = {
      deposit: "入款报备",
      withdrawal: "出款报备",
      refund: "退款报备",
    };

    const colors = {
      deposit: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      withdrawal: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      refund: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"}`} data-testid={`type-${type}`}>
        {labels[type as keyof typeof labels] || type}
      </span>
    );
  };

  const getTypeDisplayName = (type: string) => {
    const names = {
      deposit: "入款报备",
      withdrawal: "出款报备",
      refund: "退款报备",
    };
    return names[type as keyof typeof names] || type;
  };

  const getTypeIcon = (type: string) => {
    const icons = {
      deposit: ArrowDownLeft,
      withdrawal: ArrowUpRight,
      refund: RotateCcw,
    };
    return icons[type as keyof typeof icons] || FileText;
  };

  const handleRefreshAll = () => {
    refetchOverview();
    refetchStats();
    refetchCustomers();
    refetchProjects();
    refetchOrders();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">类型分析</h1>
        <p className="text-muted-foreground">分析不同订单类型的统计数据和分布情况</p>
      </div>

      {/* Filters Section */}
      <Card data-testid="card-filters">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2" data-testid="text-filters-title">
              <Filter className="h-5 w-5" />
              筛选条件
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefreshAll}
              disabled={overviewLoading || statsLoading}
              data-testid="button-refresh-all"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", (overviewLoading || statsLoading) && "animate-spin")} />
              刷新数据
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">订单状态</label>
              <Select 
                value={filters.status} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
                data-testid="select-status"
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="pending">待处理</SelectItem>
                  <SelectItem value="approved">已确认</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">员工筛选</label>
              <Input
                placeholder="输入员工名称..."
                value={filters.employee}
                onChange={(e) => setFilters(prev => ({ ...prev, employee: e.target.value }))}
                data-testid="input-employee"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">开始日期</label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                data-testid="input-date-from"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">结束日期</label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                data-testid="input-date-to"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Types Overview */}
      <Card data-testid="card-types-overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-overview-title">
            <PieChart className="h-5 w-5" />
            类型概览
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overviewLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-6 border rounded-lg">
                  <Skeleton className="h-6 w-full mb-4" />
                  <Skeleton className="h-8 w-24 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : typesOverview?.types && typesOverview.types.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {typesOverview.types.map((type: any) => {
                const Icon = getTypeIcon(type.key);
                const isSelected = filters.selectedType === type.key;
                
                return (
                  <Card 
                    key={type.key} 
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-accent/50 border-2",
                      isSelected && "ring-2 ring-primary bg-accent/30 border-primary"
                    )}
                    onClick={() => setFilters(prev => ({ 
                      ...prev, 
                      selectedType: type.key,
                      customerPage: 1,
                      projectPage: 1,
                      orderPage: 1
                    }))}
                    data-testid={`type-card-${type.key}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                            <Icon className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground" data-testid={`text-type-name-${type.key}`}>
                              {type.name}
                            </p>
                            <p className="text-sm text-muted-foreground">点击查看详情</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">订单数量</span>
                          <span className="font-medium" data-testid={`text-type-count-${type.key}`}>
                            {type.count}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">总金额</span>
                          <span className="font-medium" data-testid={`text-type-amount-${type.key}`}>
                            ¥{type.amount}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground" data-testid="text-no-types">暂无类型数据</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Type Details */}
      {filters.selectedType && (
        <>
          {/* Type Statistics */}
          <Card data-testid={`card-type-stats-${filters.selectedType}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" data-testid="text-stats-title">
                <BarChart3 className="h-5 w-5" />
                {getTypeDisplayName(filters.selectedType)} 统计
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="p-4 border rounded-lg">
                      <Skeleton className="h-4 w-16 mb-2" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              ) : typeStats ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">总订单数</span>
                    </div>
                    <p className="text-2xl font-bold" data-testid="text-total-orders">
                      {typeStats.totalOrders}
                    </p>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">总金额</span>
                    </div>
                    <p className="text-2xl font-bold" data-testid="text-total-amount">
                      ¥{typeStats.totalAmount}
                    </p>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">平均金额</span>
                    </div>
                    <p className="text-2xl font-bold" data-testid="text-avg-amount">
                      ¥{typeStats.avgAmount}
                    </p>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">已确认</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600" data-testid="text-approved-count">
                      {typeStats.approvedCount}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">暂无统计数据</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customers and Projects */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Customers */}
            <Card data-testid={`card-type-customers-${filters.selectedType}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="text-customers-title">
                  <Users className="h-5 w-5" />
                  客户排行
                </CardTitle>
              </CardHeader>
              <CardContent>
                {customersLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : customersData?.customers && customersData.customers.length > 0 ? (
                  <>
                    <div className="space-y-3">
                      {customersData.customers.map((customer: any, index: number) => (
                        <div key={customer.name} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`customer-row-${index}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-primary">
                                {index + 1}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium" data-testid={`text-customer-name-${index}`}>
                                {customer.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {customer.count} 单 • {customer.lastOrderDate}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium" data-testid={`text-customer-amount-${index}`}>
                              ¥{customer.amount}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Customer Pagination */}
                    {customersData.total > 10 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground" data-testid="text-customer-pagination-info">
                          显示 {((filters.customerPage - 1) * 10) + 1}-{Math.min(filters.customerPage * 10, customersData.total)} 个客户，共 {customersData.total} 个
                        </p>
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setFilters(prev => ({ ...prev, customerPage: Math.max(1, prev.customerPage - 1) }))}
                            disabled={filters.customerPage <= 1 || customersLoading}
                            data-testid="button-prev-customers"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setFilters(prev => ({ ...prev, customerPage: prev.customerPage + 1 }))}
                            disabled={filters.customerPage >= Math.ceil(customersData.total / 10) || customersLoading}
                            data-testid="button-next-customers"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground" data-testid="text-no-customers">暂无客户数据</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Projects */}
            <Card data-testid={`card-type-projects-${filters.selectedType}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="text-projects-title">
                  <Building2 className="h-5 w-5" />
                  项目排行
                </CardTitle>
              </CardHeader>
              <CardContent>
                {projectsLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : projectsData?.projects && projectsData.projects.length > 0 ? (
                  <>
                    <div className="space-y-3">
                      {projectsData.projects.map((project: any, index: number) => (
                        <div key={project.name} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`project-row-${index}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-primary">
                                {index + 1}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium" data-testid={`text-project-name-${index}`}>
                                {project.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {project.count} 单 • {project.lastOrderDate}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium" data-testid={`text-project-amount-${index}`}>
                              ¥{project.amount}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Project Pagination */}
                    {projectsData.total > 10 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground" data-testid="text-project-pagination-info">
                          显示 {((filters.projectPage - 1) * 10) + 1}-{Math.min(filters.projectPage * 10, projectsData.total)} 个项目，共 {projectsData.total} 个
                        </p>
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setFilters(prev => ({ ...prev, projectPage: Math.max(1, prev.projectPage - 1) }))}
                            disabled={filters.projectPage <= 1 || projectsLoading}
                            data-testid="button-prev-projects"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setFilters(prev => ({ ...prev, projectPage: prev.projectPage + 1 }))}
                            disabled={filters.projectPage >= Math.ceil(projectsData.total / 10) || projectsLoading}
                            data-testid="button-next-projects"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground" data-testid="text-no-projects">暂无项目数据</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Orders */}
          <Card data-testid={`card-type-orders-${filters.selectedType}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" data-testid="text-orders-title">
                <FileText className="h-5 w-5" />
                {getTypeDisplayName(filters.selectedType)} 订单
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : ordersData?.orders && ordersData.orders.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>订单号</TableHead>
                          <TableHead>员工</TableHead>
                          <TableHead>金额</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>创建时间</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ordersData.orders.map((order: any) => (
                          <TableRow key={order.id} data-testid={`order-row-${order.id}`}>
                            <TableCell>
                              <span className="font-mono text-sm" data-testid={`text-order-number-${order.id}`}>
                                {order.orderNumber}
                              </span>
                            </TableCell>
                            <TableCell>
                              <TelegramUserLink user={order.telegramUser} />
                            </TableCell>
                            <TableCell>
                              <span className="font-medium" data-testid={`text-order-amount-${order.id}`}>
                                ¥{order.amount}
                              </span>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(order.status)}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground" data-testid={`text-order-date-${order.id}`}>
                                {formatDateTimeBeijing(order.createdAt, { showSeconds: false })}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openOrderDetails(order)}
                                  data-testid={`button-view-${order.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                  查看
                                </Button>
                                {order.status === "pending" && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleQuickApprove(order.id)}
                                    disabled={isProcessing}
                                    data-testid={`button-approve-${order.id}`}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                    通过
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Order Pagination */}
                  {ordersData.total > 10 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground" data-testid="text-order-pagination-info">
                        显示 {((filters.orderPage - 1) * 10) + 1}-{Math.min(filters.orderPage * 10, ordersData.total)} 个订单，共 {ordersData.total} 个
                      </p>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setFilters(prev => ({ ...prev, orderPage: Math.max(1, prev.orderPage - 1) }))}
                          disabled={filters.orderPage <= 1 || ordersLoading}
                          data-testid="button-prev-orders"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          上一页
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setFilters(prev => ({ ...prev, orderPage: prev.orderPage + 1 }))}
                          disabled={filters.orderPage >= Math.ceil(ordersData.total / 10) || ordersLoading}
                          data-testid="button-next-orders"
                        >
                          下一页
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground" data-testid="text-no-orders">暂无订单数据</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        open={isOrderModalOpen}
        onOpenChange={setIsOrderModalOpen}
        onApprove={handleOrderApprove}
        onReject={handleOrderReject}
        onModifyAndApprove={handleOrderModifyAndApprove}
        isProcessing={isProcessing}
      />
    </div>
  );
}