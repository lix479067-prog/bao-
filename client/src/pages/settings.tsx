import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatTelegramGroupLink, formatBeijingTime } from "@/lib/utils";
import { Settings as SettingsIcon, Database, Download, Trash, Save, Shield, Edit, ExternalLink, MessageCircle, Users } from "lucide-react";

export default function Settings() {
  const [systemSettings, setSystemSettings] = useState({
    systemName: "TG报备机器人管理系统",
    timezone: "Asia/Shanghai",
    language: "zh-CN",
  });
  
  // Activation code states
  const [groupActivationCode, setGroupActivationCode] = useState("");
  const [adminActivationCode, setAdminActivationCode] = useState("");
  const [isEditingGroupCode, setIsEditingGroupCode] = useState(false);
  const [isEditingAdminCode, setIsEditingAdminCode] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/settings"],
  });

  // Fetch active admin groups
  const { data: adminGroups, isLoading: isLoadingGroups } = useQuery({
    queryKey: ["/api/admin-groups"],
  });

  // Update system settings and activation codes when data changes
  React.useEffect(() => {
    if (Array.isArray(settings) && settings.length > 0) {
      const settingsMap = settings.reduce((acc: any, setting: any) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {});
      
      setSystemSettings(prev => ({
        ...prev,
        ...settingsMap,
      }));
      
      // Set activation codes
      setGroupActivationCode(settingsMap.admin_group_activation_code || "");
      setAdminActivationCode(settingsMap.admin_activation_code || "");
    }
  }, [settings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: any) => {
      const promises = Object.entries(settings).map(([key, value]) => 
        apiRequest("POST", "/api/settings", { key, value: String(value) })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "成功",
        description: "系统设置已保存",
      });
    },
    onError: (error) => {
      toast({
        title: "错误",
        description: "保存失败: " + error.message,
        variant: "destructive",
      });
    },
  });
  
  // Group activation code mutation
  const updateGroupCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("PUT", "/api/settings/admin-activation-code", { code });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setIsEditingGroupCode(false);
      toast({
        title: "更新成功",
        description: "群聊激活码已更新",
      });
    },
    onError: () => {
      toast({
        title: "更新失败",
        description: "群聊激活码更新失败，请重试",
        variant: "destructive",
      });
    },
  });
  
  // Admin activation code mutation
  const updateAdminCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/settings", { 
        key: "admin_activation_code", 
        value: code 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setIsEditingAdminCode(false);
      toast({
        title: "更新成功",
        description: "管理员激活码已更新",
      });
    },
    onError: () => {
      toast({
        title: "更新失败",
        description: "管理员激活码更新失败，请重试",
        variant: "destructive",
      });
    },
  });

  const handleSaveSettings = () => {
    saveSettingsMutation.mutate(systemSettings);
  };
  
  const handleUpdateGroupCode = () => {
    if (!groupActivationCode.match(/^\d{4}$/)) {
      toast({
        title: "格式错误",
        description: "群聊激活码必须是4位数字",
        variant: "destructive",
      });
      return;
    }
    updateGroupCodeMutation.mutate(groupActivationCode);
  };
  
  const handleUpdateAdminCode = () => {
    if (!adminActivationCode.match(/^\d{4}$/)) {
      toast({
        title: "格式错误",
        description: "管理员激活码必须是4位数字",
        variant: "destructive",
      });
      return;
    }
    updateAdminCodeMutation.mutate(adminActivationCode);
  };

  // Excel export mutation
  const exportDataMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/export/excel", {
        method: "GET",
        headers: {
          "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });
      
      if (!response.ok) {
        throw new Error("导出失败");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `报备系统数据导出_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "导出成功",
        description: "数据已成功导出为Excel文件",
      });
    },
    onError: (error) => {
      toast({
        title: "导出失败",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExportData = () => {
    exportDataMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">系统设置</h1>
        <p className="text-muted-foreground">配置系统参数和数据管理</p>
      </div>

      <div className="space-y-6">
        {/* System Settings */}
        <Card data-testid="card-system-settings">
          <CardHeader>
            <CardTitle className="flex items-center">
              <SettingsIcon className="w-5 h-5 mr-2" />
              系统设置
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="p-4 border border-border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                        <Skeleton className="h-6 w-11" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="systemName">系统名称</Label>
                    <Input
                      id="systemName"
                      value={systemSettings.systemName}
                      onChange={(e) => setSystemSettings(prev => ({ ...prev, systemName: e.target.value }))}
                      data-testid="input-system-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="timezone">时区设置</Label>
                    <Select value={systemSettings.timezone} onValueChange={(value) => setSystemSettings(prev => ({ ...prev, timezone: value }))}>
                      <SelectTrigger data-testid="select-timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asia/Shanghai">Asia/Shanghai (GMT+8)</SelectItem>
                        <SelectItem value="UTC">UTC (GMT+0)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="language">语言设置</Label>
                    <Select value={systemSettings.language} onValueChange={(value) => setSystemSettings(prev => ({ ...prev, language: value }))}>
                      <SelectTrigger data-testid="select-language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh-CN">简体中文</SelectItem>
                        <SelectItem value="en-US">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-4">
                </div>
              </div>
            )}
            
            <div className="mt-6 flex justify-end">
              <Button 
                onClick={handleSaveSettings}
                disabled={saveSettingsMutation.isPending}
                data-testid="button-save-settings"
              >
                <Save className="w-4 h-4 mr-2" />
                保存设置
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Activation Code Management */}
        <Card data-testid="card-activation-codes">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              激活码管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="p-4 border border-border rounded-lg">
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-32" />
                      <div className="flex space-x-2">
                        <Skeleton className="h-10 flex-1" />
                        <Skeleton className="h-10 w-20" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Group Activation Code */}
                <div className="p-4 border border-border rounded-lg">
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">群聊激活码</h3>
                      <p className="text-xs text-muted-foreground">用于群聊激活管理权限</p>
                    </div>
                    
                    {isEditingGroupCode ? (
                      <div className="flex space-x-2">
                        <Input
                          value={groupActivationCode}
                          onChange={(e) => setGroupActivationCode(e.target.value)}
                          placeholder="输入4位数字"
                          maxLength={4}
                          data-testid="input-group-activation-code"
                        />
                        <Button
                          size="sm"
                          onClick={handleUpdateGroupCode}
                          disabled={updateGroupCodeMutation.isPending}
                          data-testid="button-save-group-code"
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIsEditingGroupCode(false);
                            setGroupActivationCode(settings?.find((s: any) => s.key === "admin_group_activation_code")?.value || "");
                          }}
                          data-testid="button-cancel-group-code"
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-lg" data-testid="text-group-code-display">
                          {groupActivationCode || "****"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsEditingGroupCode(true)}
                          data-testid="button-edit-group-code"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          编辑
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin Activation Code */}
                <div className="p-4 border border-border rounded-lg">
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">管理员激活码</h3>
                      <p className="text-xs text-muted-foreground">用于个人管理员权限激活</p>
                    </div>
                    
                    {isEditingAdminCode ? (
                      <div className="flex space-x-2">
                        <Input
                          value={adminActivationCode}
                          onChange={(e) => setAdminActivationCode(e.target.value)}
                          placeholder="输入4位数字"
                          maxLength={4}
                          data-testid="input-admin-activation-code"
                        />
                        <Button
                          size="sm"
                          onClick={handleUpdateAdminCode}
                          disabled={updateAdminCodeMutation.isPending}
                          data-testid="button-save-admin-code"
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIsEditingAdminCode(false);
                            setAdminActivationCode(settings?.find((s: any) => s.key === "admin_activation_code")?.value || "");
                          }}
                          data-testid="button-cancel-admin-code"
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-lg" data-testid="text-admin-code-display">
                          {adminActivationCode || "****"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsEditingAdminCode(true)}
                          data-testid="button-edit-admin-code"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          编辑
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Admin Groups */}
        <Card data-testid="card-admin-groups">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              已激活管理群聊 ({adminGroups?.length || 0}个)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingGroups ? (
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="p-4 border border-border rounded-lg">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-40" />
                          <Skeleton className="h-3 w-36" />
                        </div>
                        <Skeleton className="h-9 w-24" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : adminGroups && adminGroups.length > 0 ? (
              <div className="space-y-4">
                {adminGroups.map((group: any) => {
                  const groupLink = formatTelegramGroupLink(group.groupId);
                  const activatedTime = formatBeijingTime(group.activatedAt);
                  
                  return (
                    <div key={group.id} className="p-4 border border-border rounded-lg bg-muted/30">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center space-x-2">
                            <MessageCircle className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-medium text-foreground" data-testid={`text-group-name-${group.id}`}>
                              群聊管理员
                            </h3>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                              已激活
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground" data-testid={`text-group-id-${group.id}`}>
                            群聊ID: {group.groupId}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-group-time-${group.id}`}>
                            ⏰ 激活时间: {activatedTime}
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(groupLink, '_blank')}
                            className="text-xs"
                            data-testid={`button-jump-group-${group.id}`}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            跳转到群聊
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">暂无已激活的管理群聊</p>
                <p className="text-xs text-muted-foreground mt-1">
                  使用群聊激活码激活管理群聊后将显示在这里
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data Export */}
        <Card data-testid="card-data-export">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Download className="w-5 h-5 mr-2" />
              数据导出
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              导出包含员工统计、客户分析、项目统计和汇总报表的Excel文件
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Excel报表导出</p>
                <p className="text-xs text-muted-foreground">
                  包含4个工作表：员工统计、客户分析、项目统计、汇总报表
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• 员工订单统计和表现分析</li>
                  <li>• 客户交易数据和行为分析</li> 
                  <li>• 项目业务数据和收益统计</li>
                  <li>• 系统整体数据汇总报表</li>
                </ul>
              </div>
              <Button 
                onClick={handleExportData}
                disabled={exportDataMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white min-w-[120px]"
                data-testid="button-export"
              >
                {exportDataMutation.isPending ? "导出中..." : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    导出Excel
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
