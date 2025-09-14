import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Save, TestTube, Plus, Settings, Bot } from "lucide-react";

export default function BotConfig() {
  const [botConfig, setBotConfig] = useState({
    botToken: "",
    webhookUrl: "",
    adminGroupId: "",
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["/api/bot-config"],
  });
  
  // Track if bot token is masked
  const [isTokenMasked, setIsTokenMasked] = useState(false);
  
  // Update state when config data changes
  React.useEffect(() => {
    if (config) {
      setBotConfig({
        botToken: (config as any).botToken || "",
        webhookUrl: (config as any).webhookUrl || "",
        adminGroupId: (config as any).adminGroupId || "",
      });
      // Check if token is masked from server
      setIsTokenMasked((config as any).botTokenMasked === true);
    }
  }, [config]);

  const { data: keyboardButtons, isLoading: buttonsLoading } = useQuery({
    queryKey: ["/api/keyboard-buttons"],
  });

  const saveBotConfigMutation = useMutation({
    mutationFn: async (configData: any) => {
      await apiRequest("POST", "/api/bot-config", configData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot-config"] });
      toast({
        title: "成功",
        description: "机器人配置已保存",
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

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bot-config/test", {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.connected ? "连接成功" : "连接失败",
        description: data.connected ? "机器人连接正常" : "无法连接到Telegram服务器",
        variant: data.connected ? "default" : "destructive",
      });
    },
    onError: (error) => {
      toast({
        title: "测试失败",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateButtonMutation = useMutation({
    mutationFn: async ({ buttonId, isActive }: { buttonId: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/keyboard-buttons/${buttonId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keyboard-buttons"] });
      toast({
        title: "成功",
        description: "按钮配置已更新",
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

  const handleSaveConfig = () => {
    // Don't send the masked token if it hasn't been changed
    const configToSave = { ...botConfig };
    if (isTokenMasked && botConfig.botToken.includes('*')) {
      // If token is still masked (not changed), don't send it
      delete (configToSave as any).botToken;
    }
    // Reset the masked flag when user enters a new token
    if (!botConfig.botToken.includes('*')) {
      setIsTokenMasked(false);
    }
    saveBotConfigMutation.mutate(configToSave);
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  const handleButtonToggle = (buttonId: string, isActive: boolean) => {
    updateButtonMutation.mutate({ buttonId, isActive });
  };

  const getButtonTypeIcon = (type: string) => {
    switch (type) {
      case "deposit":
        return "💰";
      case "withdrawal":
        return "💸";
      case "refund":
        return "🔄";
      default:
        return "📋";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">机器人配置</h1>
        <p className="text-muted-foreground">配置Telegram机器人和内联键盘</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Configuration */}
        <Card data-testid="card-bot-config">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Bot className="w-5 h-5 mr-2" />
              机器人基础配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {configLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="botToken">Bot Token</Label>
                  <Input
                    id="botToken"
                    type="password"
                    placeholder="请输入Bot Token"
                    value={botConfig.botToken}
                    onChange={(e) => setBotConfig(prev => ({ ...prev, botToken: e.target.value }))}
                    data-testid="input-bot-token"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">Webhook URL</Label>
                  <Input
                    id="webhookUrl"
                    type="url"
                    placeholder="https://your-domain.com/api/telegram/webhook"
                    value={botConfig.webhookUrl}
                    onChange={(e) => setBotConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                    data-testid="input-webhook-url"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="adminGroupId">管理群组ID</Label>
                  <Input
                    id="adminGroupId"
                    placeholder="-100xxxxxxxxx"
                    value={botConfig.adminGroupId}
                    onChange={(e) => setBotConfig(prev => ({ ...prev, adminGroupId: e.target.value }))}
                    data-testid="input-admin-group-id"
                  />
                </div>
                
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-foreground">机器人状态</p>
                    <p className="text-xs text-muted-foreground">当前运行状态</p>
                  </div>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span className="text-sm text-green-600" data-testid="text-bot-status">运行中</span>
                  </div>
                </div>
                
                <div className="flex space-x-3">
                  <Button 
                    onClick={handleSaveConfig}
                    disabled={saveBotConfigMutation.isPending}
                    className="flex-1"
                    data-testid="button-save-config"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    保存配置
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testConnectionMutation.isPending}
                    data-testid="button-test-connection"
                  >
                    <TestTube className="w-4 h-4 mr-2" />
                    测试连接
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Keyboard Configuration */}
        <Card data-testid="card-keyboard-config">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              内联键盘配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {buttonsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="p-4 border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-6 w-11" />
                    </div>
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : keyboardButtons && Array.isArray(keyboardButtons) && keyboardButtons.length > 0 ? (
              <>
                {(keyboardButtons as any[])?.map((button: any) => (
                  <div key={button.id} className="p-4 border border-border rounded-lg" data-testid={`card-button-${button.id}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-foreground flex items-center">
                        <span className="mr-2">{getButtonTypeIcon(button.orderType)}</span>
                        {button.orderType === 'deposit' ? '入款报备' : 
                         button.orderType === 'withdrawal' ? '出款报备' : '退款报备'}
                      </span>
                      <Switch
                        checked={button.isActive}
                        onCheckedChange={(checked) => handleButtonToggle(button.id, checked)}
                        disabled={updateButtonMutation.isPending}
                        data-testid={`switch-button-${button.id}`}
                      />
                    </div>
                    <Input
                      value={button.text}
                      disabled
                      className="text-sm"
                      data-testid={`input-button-text-${button.id}`}
                    />
                  </div>
                ))}
                
                <Button variant="outline" className="w-full border-dashed" data-testid="button-add-button">
                  <Plus className="w-4 h-4 mr-2" />
                  添加新按钮
                </Button>
                
                <Button 
                  className="w-full"
                  disabled={updateButtonMutation.isPending}
                  data-testid="button-update-keyboard"
                >
                  更新键盘配置
                </Button>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Settings className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4">暂无按钮配置</p>
                <Button data-testid="button-create-first-button">
                  <Plus className="w-4 h-4 mr-2" />
                  创建第一个按钮
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
