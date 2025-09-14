import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EmployeeCode, AdminGroup, SystemSetting } from "@shared/schema";
import { 
  KeyRound, 
  Users, 
  Plus, 
  Copy, 
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw
} from "lucide-react";

export default function EmployeeCodes() {
  const [employeeName, setEmployeeName] = useState("");
  const [codeType, setCodeType] = useState<"employee" | "admin">("employee");
  const [adminActivationCode, setAdminActivationCode] = useState("");
  const [isEditingCode, setIsEditingCode] = useState(false);
  const { toast } = useToast();

  // Fetch employee codes
  const { data: employeeCodes, isLoading: isLoadingCodes } = useQuery<EmployeeCode[]>({
    queryKey: ["/api/employee-codes"],
  });

  // Fetch admin groups
  const { data: adminGroups, isLoading: isLoadingGroups } = useQuery<AdminGroup[]>({
    queryKey: ["/api/admin-groups"],
  });

  // Fetch settings (including admin activation code)
  const { data: settings, isLoading: isLoadingSettings } = useQuery<SystemSetting[]>({
    queryKey: ["/api/settings"],
  });

  // Get admin activation code from settings
  const currentAdminCode = settings?.find((s) => s.key === "admin_activation_code")?.value || "";

  // Create employee code mutation
  const createCodeMutation = useMutation({
    mutationFn: async ({ name, type }: { name: string; type: "employee" | "admin" }) => {
      const response = await apiRequest("POST", "/api/employee-codes", { name, type });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-codes"] });
      setEmployeeName("");
      setCodeType("employee");
      const typeLabel = data.type === "admin" ? "管理员工码" : "员工码";
      toast({
        title: `${typeLabel}创建成功`,
        description: `${typeLabel} ${data.code} 已创建，15分钟内有效`,
      });
      
      // Copy to clipboard
      navigator.clipboard.writeText(data.code);
      toast({
        title: "已复制到剪贴板",
        description: `${typeLabel}已自动复制到剪贴板`,
      });
    },
    onError: () => {
      toast({
        title: "创建失败",
        description: "员工码创建失败，请重试",
        variant: "destructive",
      });
    },
  });

  // Update admin activation code mutation
  const updateAdminCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("PUT", "/api/settings/admin-activation-code", { code });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setIsEditingCode(false);
      setAdminActivationCode("");
      toast({
        title: "更新成功",
        description: "管理群激活码已更新",
      });
    },
    onError: () => {
      toast({
        title: "更新失败",
        description: "管理群激活码更新失败，请重试",
        variant: "destructive",
      });
    },
  });

  const handleCreateCode = () => {
    if (!employeeName.trim()) {
      toast({
        title: "请输入员工姓名",
        description: "员工姓名不能为空",
        variant: "destructive",
      });
      return;
    }
    createCodeMutation.mutate({ name: employeeName.trim(), type: codeType });
  };

  const handleUpdateAdminCode = () => {
    if (!adminActivationCode.match(/^\d{4}$/)) {
      toast({
        title: "格式错误",
        description: "管理群激活码必须是4位数字",
        variant: "destructive",
      });
      return;
    }
    updateAdminCodeMutation.mutate(adminActivationCode);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "已复制",
      description: "已复制到剪贴板",
    });
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "未知";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleString("zh-CN");
  };

  const getExpirationStatus = (expiresAt: Date | string) => {
    const now = new Date();
    const expiry = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
    const isExpired = now > expiry;
    const minutesLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60));
    
    if (isExpired) {
      return <Badge variant="destructive" data-testid="status-expired"><XCircle className="w-3 h-3 mr-1" />已过期</Badge>;
    } else if (minutesLeft < 5) {
      return <Badge variant="secondary" data-testid="status-expiring"><Clock className="w-3 h-3 mr-1" />即将过期</Badge>;
    } else {
      return <Badge variant="default" data-testid="status-valid"><CheckCircle2 className="w-3 h-3 mr-1" />有效 ({minutesLeft}分钟)</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">员工码管理</h1>
        <p className="text-muted-foreground">生成和管理员工激活码，配置管理群</p>
      </div>

      {/* Generate Employee Code */}
      <Card data-testid="card-generate-code">
        <CardHeader>
          <CardTitle data-testid="text-generate-title">
            <KeyRound className="w-5 h-5 inline-block mr-2" />
            生成员工码
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="employee-name">员工姓名</Label>
              <Input
                id="employee-name"
                placeholder="请输入员工姓名"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateCode()}
                data-testid="input-employee-name"
              />
            </div>
            <div className="w-48">
              <Label htmlFor="code-type">码类型</Label>
              <Select value={codeType} onValueChange={(value: "employee" | "admin") => setCodeType(value)}>
                <SelectTrigger id="code-type" data-testid="select-code-type">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">员工码 (报备订单)</SelectItem>
                  <SelectItem value="admin">管理员工码 (审批订单)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleCreateCode}
                disabled={createCodeMutation.isPending || !employeeName.trim()}
                data-testid="button-generate-code"
              >
                {createCodeMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                生成{codeType === "admin" ? "管理员工码" : "员工码"}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            生成6位数字激活码，有效期15分钟。{codeType === "admin" ? "管理员工码用于审批订单" : "员工码用于报备订单"}
          </p>
        </CardContent>
      </Card>

      {/* Employee Codes List */}
      <Card data-testid="card-employee-codes">
        <CardHeader>
          <CardTitle data-testid="text-codes-title">有效员工码列表</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingCodes ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : employeeCodes && employeeCodes.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>激活码</TableHead>
                    <TableHead>员工姓名</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>过期时间</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeCodes?.map((code) => (
                    <TableRow key={code.id} data-testid={`row-code-${code.id}`}>
                      <TableCell>
                        <span className="font-mono font-semibold text-lg" data-testid={`text-code-${code.code}`}>
                          {code.code}
                        </span>
                      </TableCell>
                      <TableCell data-testid={`text-name-${code.id}`}>{code.name}</TableCell>
                      <TableCell>
                        <Badge variant={code.type === "admin" ? "default" : "secondary"} data-testid={`type-${code.type}`}>
                          {code.type === "admin" ? "管理员工码" : "员工码"}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-created-${code.id}`}>{formatDate(code.createdAt)}</TableCell>
                      <TableCell data-testid={`text-expires-${code.id}`}>{formatDate(code.expiresAt)}</TableCell>
                      <TableCell>
                        {code.isUsed ? (
                          <Badge variant="secondary" data-testid={`status-used-${code.id}`}>
                            <CheckCircle2 className="w-3 h-3 mr-1" />已使用
                          </Badge>
                        ) : (
                          getExpirationStatus(code.expiresAt)
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!code.isUsed && new Date() < new Date(code.expiresAt) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(code.code)}
                            data-testid={`button-copy-${code.id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              暂无有效员工码
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin Group Configuration */}
      <Card data-testid="card-admin-config">
        <CardHeader>
          <CardTitle data-testid="text-admin-title">
            <Shield className="w-5 h-5 inline-block mr-2" />
            管理群配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Admin Activation Code */}
          <div>
            <Label>管理群激活码（4位数字）</Label>
            <div className="flex gap-4 mt-2">
              {isEditingCode ? (
                <>
                  <Input
                    placeholder="输入4位数字"
                    value={adminActivationCode}
                    onChange={(e) => setAdminActivationCode(e.target.value)}
                    maxLength={4}
                    pattern="\d{4}"
                    data-testid="input-admin-code"
                  />
                  <Button 
                    onClick={handleUpdateAdminCode}
                    disabled={updateAdminCodeMutation.isPending}
                    data-testid="button-save-code"
                  >
                    保存
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setIsEditingCode(false);
                      setAdminActivationCode("");
                    }}
                    data-testid="button-cancel-edit"
                  >
                    取消
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <div className="font-mono text-2xl font-bold text-primary" data-testid="text-current-code">
                      {isLoadingSettings ? (
                        <Skeleton className="h-8 w-24" />
                      ) : (
                        currentAdminCode || "未设置"
                      )}
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setIsEditingCode(true);
                      setAdminActivationCode(currentAdminCode);
                    }}
                    data-testid="button-edit-code"
                  >
                    修改
                  </Button>
                  {currentAdminCode && (
                    <Button
                      variant="ghost"
                      onClick={() => copyToClipboard(currentAdminCode)}
                      data-testid="button-copy-admin-code"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              管理员在群内发送此激活码即可激活管理群
            </p>
          </div>

          {/* Admin Groups List */}
          <div>
            <h3 className="font-semibold mb-3" data-testid="text-groups-title">已激活的管理群</h3>
            {isLoadingGroups ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : adminGroups && adminGroups.length > 0 ? (
              <div className="space-y-2">
                {adminGroups?.map((group) => (
                  <div 
                    key={group.id} 
                    className="flex items-center justify-between p-4 bg-muted rounded-lg"
                    data-testid={`card-group-${group.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium" data-testid={`text-group-id-${group.id}`}>
                          群ID: {group.groupId}
                        </p>
                        <p className="text-sm text-muted-foreground" data-testid={`text-group-activated-${group.id}`}>
                          激活时间: {formatDate(group.activatedAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="default" data-testid={`status-group-${group.id}`}>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      已激活
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-muted rounded-lg text-muted-foreground">
                暂无已激活的管理群
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}