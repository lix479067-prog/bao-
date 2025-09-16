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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { OrderDetailsModal } from "@/components/modals/order-details-modal";
import { TelegramUserLink } from "@/components/ui/telegram-user-link";
import { formatDateTimeBeijing } from "@shared/utils/timeUtils";
import { 
  Search, 
  Building2, 
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
  Briefcase,
  FileText,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Projects() {
  // Initialize filters from URL parameters
  const getInitialFilters = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      search: urlParams.get('search') || "",
      page: parseInt(urlParams.get('page') || "1"),
      selectedProject: urlParams.get('project') || null,
      orderType: urlParams.get('type') || "all",
      orderStatus: urlParams.get('status') || "all",
      dateFrom: urlParams.get('from') || "",
      dateTo: urlParams.get('to') || "",
      orderPage: parseInt(urlParams.get('orderPage') || "1"),
    };
  };

  const [filters, setFilters] = useState(getInitialFilters);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<any>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.page > 1) params.set("page", filters.page.toString());
    if (filters.selectedProject) params.set("project", filters.selectedProject);
    if (filters.orderType && filters.orderType !== "all") params.set("type", filters.orderType);
    if (filters.orderStatus && filters.orderStatus !== "all") params.set("status", filters.orderStatus);
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
    if (filters.orderPage > 1) params.set("orderPage", filters.orderPage.toString());
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [filters]);

  // Search projects
  const { data: projectsData, isLoading: projectsLoading, refetch: refetchProjects } = useQuery({
    queryKey: ["/api/projects/search", filters.search, filters.page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.search) params.append("name", filters.search);
      params.append("page", filters.page.toString());
      params.append("limit", "20");
      
      return fetch(`/api/projects/search?${params}`).then(res => res.json());
    },
    enabled: true,
  });

  // Project statistics
  const { data: projectStats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["/api/projects", filters.selectedProject, "stats", filters.orderType, filters.orderStatus, filters.dateFrom, filters.dateTo],
    queryFn: () => {
      if (!filters.selectedProject) return null;
      
      const params = new URLSearchParams();
      if (filters.orderType && filters.orderType !== "all") params.append("type", filters.orderType);
      if (filters.orderStatus && filters.orderStatus !== "all") params.append("status", filters.orderStatus);
      if (filters.dateFrom) params.append("from", filters.dateFrom);
      if (filters.dateTo) params.append("to", filters.dateTo);
      
      const encodedProject = encodeURIComponent(filters.selectedProject);
      return fetch(`/api/projects/${encodedProject}/stats?${params}`).then(res => res.json());
    },
    enabled: !!filters.selectedProject,
  });

  // Project orders
  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ["/api/projects", filters.selectedProject, "orders", filters.orderType, filters.orderStatus, filters.dateFrom, filters.dateTo, filters.orderPage],
    queryFn: () => {
      if (!filters.selectedProject) return null;
      
      const params = new URLSearchParams();
      if (filters.orderType && filters.orderType !== "all") params.append("type", filters.orderType);
      if (filters.orderStatus && filters.orderStatus !== "all") params.append("status", filters.orderStatus);
      if (filters.dateFrom) params.append("from", filters.dateFrom);
      if (filters.dateTo) params.append("to", filters.dateTo);
      params.append("page", filters.orderPage.toString());
      params.append("limit", "10");
      
      const encodedProject = encodeURIComponent(filters.selectedProject);
      return fetch(`/api/projects/${encodedProject}/orders?${params}`).then(res => res.json());
    },
    enabled: !!filters.selectedProject,
  });

  // Mutation for updating order status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, rejectionReason }: { orderId: string; status: string; rejectionReason?: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status, rejectionReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
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

  // Mutation for deleting order
  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      await apiRequest("DELETE", `/api/orders/${orderId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      refetchStats();
      refetchOrders();
      setOrderToDelete(null);
      toast({
        title: "成功",
        description: "订单已删除",
      });
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: "删除失败: " + error.message,
        variant: "destructive",
      });
    },
  });

  // Handle project selection
  const handleProjectSelect = (projectName: string) => {
    setFilters(prev => ({ 
      ...prev, 
      selectedProject: projectName,
      orderPage: 1,
      orderType: "all",
      orderStatus: "all",
      dateFrom: "",
      dateTo: ""
    }));
  };

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

  const handleDeleteOrder = (order: any) => {
    setOrderToDelete(order);
  };

  const confirmDeleteOrder = () => {
    if (orderToDelete) {
      deleteOrderMutation.mutate(orderToDelete.id);
    }
  };

  // Check if any mutation is processing
  const isProcessing = updateStatusMutation.isPending || modifyOrderMutation.isPending || deleteOrderMutation.isPending;

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

  const handleRefreshAll = () => {
    refetchProjects();
    if (filters.selectedProject) {
      refetchStats();
      refetchOrders();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">项目分析</h1>
        <p className="text-muted-foreground">搜索和分析项目交易数据</p>
      </div>

      {/* Search Section */}
      <Card data-testid="card-project-search">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2" data-testid="text-search-title">
              <Search className="h-5 w-5" />
              项目搜索
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefreshAll}
              disabled={projectsLoading || statsLoading || ordersLoading}
              data-testid="button-refresh-all"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", (projectsLoading || statsLoading || ordersLoading) && "animate-spin")} />
              刷新数据
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="输入项目名称搜索..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                className="w-full"
                data-testid="input-project-search"
              />
            </div>
            <Button 
              variant="default"
              onClick={() => refetchProjects()}
              disabled={projectsLoading}
              data-testid="button-search"
            >
              <Search className="h-4 w-4 mr-2" />
              搜索
            </Button>
          </div>

          {/* Project List */}
          <div className="mt-6">
            {projectsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="p-4 border rounded-lg">
                    <Skeleton className="h-6 w-full" />
                  </div>
                ))}
              </div>
            ) : projectsData?.projects && projectsData.projects.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projectsData.projects.map((projectName: string) => (
                    <Card 
                      key={projectName} 
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-accent/50 border",
                        filters.selectedProject === projectName && "ring-2 ring-primary bg-accent/30"
                      )}
                      onClick={() => handleProjectSelect(projectName)}
                      data-testid={`project-card-${projectName}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <Briefcase className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate" data-testid={`text-project-name-${projectName}`}>
                              {projectName}
                            </p>
                            <p className="text-sm text-muted-foreground">点击查看详情</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Project Search Pagination */}
                {projectsData.total > 20 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-muted-foreground" data-testid="text-project-pagination-info">
                      显示 {((filters.page - 1) * 20) + 1}-{Math.min(filters.page * 20, projectsData.total)} 个项目，共 {projectsData.total} 个
                    </p>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                        disabled={filters.page <= 1 || projectsLoading}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        上一页
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                        disabled={filters.page >= Math.ceil(projectsData.total / 20) || projectsLoading}
                        data-testid="button-next-page"
                      >
                        下一页
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : projectsData?.projects && projectsData.projects.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground" data-testid="text-no-projects">
                  {filters.search ? "未找到匹配的项目" : "暂无项目数据"}
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Project Statistics */}
      {filters.selectedProject && (
        <Card data-testid="card-project-stats">
          <CardHeader>
            <CardTitle className="flex items-center gap-2" data-testid="text-stats-title">
              <TrendingUp className="h-5 w-5" />
              项目统计：{filters.selectedProject}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="p-4">
                    <Skeleton className="h-8 w-full mb-2" />
                    <Skeleton className="h-4 w-2/3" />
                  </Card>
                ))}
              </div>
            ) : projectStats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">总订单数</p>
                      <p className="text-2xl font-bold" data-testid="text-total-orders">{projectStats.totalOrders}</p>
                    </div>
                    <FileText className="h-8 w-8 text-blue-500" />
                  </div>
                </Card>
                
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">总金额</p>
                      <p className="text-2xl font-bold" data-testid="text-total-amount">¥{projectStats.totalAmount}</p>
                    </div>
                    <DollarSign className="h-8 w-8 text-green-500" />
                  </div>
                </Card>
                
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">平均金额</p>
                      <p className="text-2xl font-bold" data-testid="text-avg-amount">¥{projectStats.avgAmount}</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-purple-500" />
                  </div>
                </Card>
                
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">入款订单</p>
                      <p className="text-2xl font-bold text-blue-600" data-testid="text-deposit-count">{projectStats.depositCount}</p>
                    </div>
                    <ArrowUpRight className="h-8 w-8 text-blue-500" />
                  </div>
                </Card>
                
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">出款订单</p>
                      <p className="text-2xl font-bold text-green-600" data-testid="text-withdrawal-count">{projectStats.withdrawalCount}</p>
                    </div>
                    <ArrowDownLeft className="h-8 w-8 text-green-500" />
                  </div>
                </Card>
                
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">退款订单</p>
                      <p className="text-2xl font-bold text-red-600" data-testid="text-refund-count">{projectStats.refundCount}</p>
                    </div>
                    <RotateCcw className="h-8 w-8 text-red-500" />
                  </div>
                </Card>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">暂无统计数据</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Project Orders */}
      {filters.selectedProject && (
        <Card data-testid="card-project-orders">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2" data-testid="text-orders-title">
                <FileText className="h-5 w-5" />
                项目订单
              </CardTitle>
              
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={filters.orderType} onValueChange={(value) => setFilters(prev => ({ ...prev, orderType: value, orderPage: 1 }))}>
                    <SelectTrigger className="w-32" data-testid="select-order-type">
                      <SelectValue placeholder="订单类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型</SelectItem>
                      <SelectItem value="deposit">入款报备</SelectItem>
                      <SelectItem value="withdrawal">出款报备</SelectItem>
                      <SelectItem value="refund">退款报备</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={filters.orderStatus} onValueChange={(value) => setFilters(prev => ({ ...prev, orderStatus: value, orderPage: 1 }))}>
                    <SelectTrigger className="w-32" data-testid="select-order-status">
                      <SelectValue placeholder="订单状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="pending">待处理</SelectItem>
                      <SelectItem value="approved">已确认</SelectItem>
                      <SelectItem value="rejected">已拒绝</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value, orderPage: 1 }))}
                    className="w-40"
                    data-testid="input-date-from"
                  />
                  <span className="text-muted-foreground">至</span>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value, orderPage: 1 }))}
                    className="w-40"
                    data-testid="input-date-to"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-full" />
                  </div>
                ))}
              </div>
            ) : ordersData?.orders && ordersData.orders.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>订单号</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>客户</TableHead>
                        <TableHead>员工</TableHead>
                        <TableHead>金额</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>提交时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersData.orders.map((order: any) => (
                        <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                          <TableCell className="font-medium" data-testid={`text-order-number-${order.id}`}>
                            {order.orderNumber}
                          </TableCell>
                          <TableCell>
                            {getTypeBadge(order.type)}
                          </TableCell>
                          <TableCell data-testid={`text-customer-${order.id}`}>
                            {order.customerName || '未知客户'}
                          </TableCell>
                          <TableCell data-testid={`text-employee-${order.id}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {order.telegramUser?.firstName || order.telegramUser?.username || '未知员工'}
                              </span>
                              {order.telegramUser && (
                                <TelegramUserLink 
                                  user={{
                                    username: order.telegramUser.username,
                                    telegramId: order.telegramUser.telegramId,
                                    firstName: order.telegramUser.firstName
                                  }}
                                  variant="button"
                                  className="ml-1"
                                  data-testid={`telegram-contact-${order.id}`}
                                />
                              )}
                            </div>
                          </TableCell>
                          <TableCell data-testid={`text-amount-${order.id}`}>
                            {order.amount}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(order.status)}
                          </TableCell>
                          <TableCell className="text-muted-foreground" data-testid={`text-created-${order.id}`}>
                            {formatDateTimeBeijing(order.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => openOrderDetails(order)}
                                data-testid={`button-view-${order.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {order.status === 'pending' && (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => handleQuickApprove(order.id)}
                                    disabled={isProcessing}
                                    className="text-green-600 hover:text-green-500"
                                    data-testid={`button-approve-${order.id}`}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleDeleteOrder(order)}
                                disabled={isProcessing}
                                className="text-red-600 hover:text-red-500"
                                data-testid={`button-delete-order-${order.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Orders Pagination */}
                {ordersData.total > 10 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-muted-foreground" data-testid="text-orders-pagination-info">
                      显示 {((filters.orderPage - 1) * 10) + 1}-{Math.min(filters.orderPage * 10, ordersData.total)} 个订单，共 {ordersData.total} 个
                    </p>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setFilters(prev => ({ ...prev, orderPage: Math.max(1, prev.orderPage - 1) }))}
                        disabled={filters.orderPage <= 1 || ordersLoading}
                        data-testid="button-orders-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        上一页
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setFilters(prev => ({ ...prev, orderPage: prev.orderPage + 1 }))}
                        disabled={filters.orderPage >= Math.ceil(ordersData.total / 10) || ordersLoading}
                        data-testid="button-orders-next-page"
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
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          open={isOrderModalOpen}
          onOpenChange={(open) => !open && closeOrderDetails()}
          order={selectedOrder}
          onApprove={handleOrderApprove}
          onReject={handleOrderReject}
          onModifyAndApprove={handleOrderModifyAndApprove}
          isProcessing={isProcessing}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-order">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除订单</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除订单 <strong>{orderToDelete?.orderNumber}</strong> 吗？
              <br />
              <br />
              此操作不可撤销，订单的所有数据都将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => setOrderToDelete(null)}
              data-testid="button-cancel-delete"
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteOrder}
              disabled={deleteOrderMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteOrderMutation.isPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}