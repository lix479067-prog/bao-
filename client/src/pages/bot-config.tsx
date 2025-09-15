import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Save, TestTube, Bot } from "lucide-react";
import { TokenChangeConfirmationModal } from "@/components/modals/token-change-confirmation-modal";

export default function BotConfig() {
  const [botConfig, setBotConfig] = useState({
    botToken: "",
    webhookUrl: "",
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["/api/bot-config"],
  });
  
  // Track if bot token is masked and original token for change detection
  const [isTokenMasked, setIsTokenMasked] = useState(false);
  const [originalToken, setOriginalToken] = useState<string>("");
  const [showTokenChangeConfirmation, setShowTokenChangeConfirmation] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<any>(null);
  
  // Update state when config data changes
  React.useEffect(() => {
    if (config) {
      const configToken = (config as any).botToken || "";
      setBotConfig({
        botToken: configToken,
        webhookUrl: (config as any).webhookUrl || "",
      });
      // Check if token is masked from server
      setIsTokenMasked((config as any).botTokenMasked === true);
      
      // Store original token for change detection (only if not masked)
      if (!(config as any).botTokenMasked) {
        setOriginalToken(configToken);
      }
    }
  }, [config]);

  const saveBotConfigMutation = useMutation({
    mutationFn: async (configData: any) => {
      const response = await apiRequest("POST", "/api/bot-config", configData);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot-config"] });
      
      // Show different messages based on whether data was cleared
      if (data.dataCleared) {
        toast({
          title: "配置已更新",
          description: `机器人Token已更换，已清理 ${data.clearDataResult.clearedUsers} 个用户、${data.clearDataResult.clearedOrders} 个订单、${data.clearDataResult.clearedGroups} 个群聊的数据`,
        });
      } else {
        toast({
          title: "成功",
          description: "机器人配置已保存",
        });
      }
      
      // Update original token for future comparisons
      setOriginalToken(data.botToken || "");
      setIsTokenMasked(false);
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

  const handleSaveConfig = () => {
    // Don't send the masked token if it hasn't been changed
    const configToSave = { ...botConfig };
    if (isTokenMasked && botConfig.botToken.includes('*')) {
      // If token is still masked (not changed), don't send it
      delete (configToSave as any).botToken;
    }
    
    // Improved token change detection logic
    // Case 1: Token was masked and user entered a new non-masked token
    const tokenChangedFromMasked = isTokenMasked && 
      botConfig.botToken && 
      !botConfig.botToken.includes('*') &&
      botConfig.botToken.trim().length > 0;
    
    // Case 2: Token was not masked and user changed it to a different value
    const tokenChangedFromUnmasked = !isTokenMasked && 
      botConfig.botToken && 
      originalToken && 
      botConfig.botToken !== originalToken && 
      !botConfig.botToken.includes('*');
    
    const hasTokenChanged = tokenChangedFromMasked || tokenChangedFromUnmasked;
    
    if (hasTokenChanged) {
      // Show confirmation dialog for token change
      setPendingConfig(configToSave);
      setShowTokenChangeConfirmation(true);
    } else {
      // Reset the masked flag when user enters a new token
      if (!botConfig.botToken.includes('*')) {
        setIsTokenMasked(false);
      }
      // Proceed with normal save
      saveBotConfigMutation.mutate(configToSave);
    }
  };

  const handleTokenChangeConfirm = () => {
    if (pendingConfig) {
      setShowTokenChangeConfirmation(false);
      setIsTokenMasked(false);
      saveBotConfigMutation.mutate(pendingConfig);
      setPendingConfig(null);
    }
  };

  const handleTokenChangeCancel = () => {
    setShowTokenChangeConfirmation(false);
    setPendingConfig(null);
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">机器人配置</h1>
        <p className="text-muted-foreground">配置Telegram机器人连接</p>
      </div>

      <div className="max-w-2xl">
        <Card data-testid="card-bot-config">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Bot className="w-5 h-5 mr-2" />
              机器人连接配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {configLoading ? (
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
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
                    placeholder="请输入Bot Token (例如: 1234567890:ABC-DEF...)"
                    value={botConfig.botToken}
                    onChange={(e) => setBotConfig(prev => ({ ...prev, botToken: e.target.value }))}
                    data-testid="input-bot-token"
                  />
                  <p className="text-xs text-muted-foreground">
                    从 @BotFather 获取的机器人令牌
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">Webhook URL (可选)</Label>
                  <Input
                    id="webhookUrl"
                    type="url"
                    placeholder="https://your-domain.com/api/telegram/webhook"
                    value={botConfig.webhookUrl}
                    onChange={(e) => setBotConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                    data-testid="input-webhook-url"
                  />
                  <p className="text-xs text-muted-foreground">
                    用于接收Telegram消息的Webhook地址
                  </p>
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
                
                <div className="flex space-x-3 pt-2">
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

                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-2">快速设置指南</h3>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>从 @BotFather 创建或获取机器人Token</li>
                    <li>将Token粘贴到上方输入框</li>
                    <li>点击"测试连接"验证配置</li>
                    <li>保存配置后机器人即可使用</li>
                  </ol>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      <TokenChangeConfirmationModal
        open={showTokenChangeConfirmation}
        onOpenChange={handleTokenChangeCancel}
        onConfirm={handleTokenChangeConfirm}
        isProcessing={saveBotConfigMutation.isPending}
      />
    </div>
  );
}