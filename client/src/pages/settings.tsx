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
import { Settings as SettingsIcon, Database, Download, Trash, Save } from "lucide-react";

export default function Settings() {
  const [systemSettings, setSystemSettings] = useState({
    systemName: "TG报备机器人管理系统",
    timezone: "Asia/Shanghai",
    language: "zh-CN",
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/settings"],
  });

  // Update system settings when data changes
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

  const handleSaveSettings = () => {
    saveSettingsMutation.mutate(systemSettings);
  };

  const handleDatabaseAction = (action: string) => {
    toast({
      title: "功能开发中",
      description: `${action}功能正在开发中，敬请期待`,
    });
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

        {/* Database Management */}
        <Card data-testid="card-database-management">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="w-5 h-5 mr-2" />
              数据库管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 border border-border rounded-lg">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Database className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-foreground">数据备份</p>
                <p className="text-xs text-muted-foreground mb-3">备份所有系统数据</p>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => handleDatabaseAction("数据备份")}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  data-testid="button-backup"
                >
                  备份
                </Button>
              </div>
              
              <div className="text-center p-4 border border-border rounded-lg">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Download className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-medium text-foreground">导出数据</p>
                <p className="text-xs text-muted-foreground mb-3">导出订单和用户数据</p>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => handleDatabaseAction("导出数据")}
                  className="bg-green-600 text-white hover:bg-green-700"
                  data-testid="button-export"
                >
                  导出
                </Button>
              </div>
              
              <div className="text-center p-4 border border-border rounded-lg">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Trash className="w-6 h-6 text-red-600" />
                </div>
                <p className="text-sm font-medium text-foreground">清理数据</p>
                <p className="text-xs text-muted-foreground mb-3">清理过期的订单数据</p>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => handleDatabaseAction("清理数据")}
                  className="bg-red-600 text-white hover:bg-red-700"
                  data-testid="button-cleanup"
                >
                  清理
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
