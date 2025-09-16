import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Save, TestTube, Bot, Trash2, AlertTriangle } from "lucide-react";
import { TokenChangeConfirmationModal } from "@/components/modals/token-change-confirmation-modal";

export default function BotConfig() {
  const [botConfig, setBotConfig] = useState({
    botToken: "",
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
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<any>(null);
  
  // Update state when config data changes
  React.useEffect(() => {
    if (config) {
      const configToken = (config as any).botToken || "";
      setBotConfig({
        botToken: configToken,
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

  const deleteBotConfigMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/bot-config", {
        confirm: "DELETE"
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot-config"] });
      toast({
        title: "删除成功",
        description: `机器人配置已删除，已清理 ${data.clearedUsers} 个用户、${data.clearedOrders} 个订单、${data.clearedGroups} 个群聊的数据`,
      });
      // Reset form state
      setBotConfig({ botToken: "" });
      setIsTokenMasked(false);
      setOriginalToken("");
    },
    onError: (error) => {
      toast({
        title: "删除失败",
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

  const handleDeleteConfig = () => {
    setShowDeleteConfirmation(true);
  };

  const handleDeleteConfirm = () => {
    setShowDeleteConfirmation(false);
    deleteBotConfigMutation.mutate();
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirmation(false);
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
                
                {/* Environment-aware Webhook Information */}
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 text-blue-700">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-sm font-medium">智能环境分离</span>
                  </div>
                  <p className="text-xs text-blue-600 mt-1">
                    系统自动检测环境并使用对应配置，开发和生产环境完全隔离，避免webhook冲突。
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
                
                {/* Environment Configuration Information */}
                {(config as any)?.environment && (
                  <div className="space-y-4">
                    <div className="border-t pt-4">
                      <h3 className="text-lg font-semibold text-foreground mb-2">环境配置状态</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        当前系统支持开发和生产环境分离，避免环境间的webhook冲突
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Current Environment */}
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-foreground">当前环境</h4>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            (config as any).environment.isProduction 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {(config as any).environment.currentEnvironment === 'production' ? '生产环境' : '开发环境'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(config as any).environment.isProduction 
                            ? '您正在生产环境中运行，webhook配置将直接影响用户体验' 
                            : '您正在开发环境中运行，webhook配置不会影响生产环境'}
                        </p>
                      </div>
                      
                      {/* Webhook Configuration Status */}
                      <div className="p-4 border rounded-lg">
                        <h4 className="text-sm font-medium text-foreground mb-2">Webhook配置</h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span>生产Webhook:</span>
                            <span className={`px-1.5 py-0.5 rounded ${
                              (config as any).environment.hasProdWebhookUrl
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {(config as any).environment.hasProdWebhookUrl ? '已配置' : '未配置'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>开发Webhook:</span>
                            <span className={`px-1.5 py-0.5 rounded ${
                              (config as any).environment.hasDevWebhookUrl
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {(config as any).environment.hasDevWebhookUrl ? '已配置' : '可选'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Environment Configuration Guide */}
                {(config as any)?.environment && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      环境配置指南
                    </h4>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <div>
                        <p className="font-medium text-foreground mb-1">如何实现环境分离：</p>
                        <ul className="space-y-1 ml-4 list-disc">
                          <li><strong>生产环境</strong>：在Secrets中配置 <code className="bg-gray-200 px-1 rounded">TELEGRAM_BOT_TOKEN</code> 和 <code className="bg-gray-200 px-1 rounded">TELEGRAM_WEBHOOK_URL</code></li>
                          <li><strong>开发环境</strong>：可选配置 <code className="bg-gray-200 px-1 rounded">TELEGRAM_DEV_BOT_TOKEN</code> 和 <code className="bg-gray-200 px-1 rounded">TELEGRAM_DEV_WEBHOOK_URL</code></li>
                          <li>如果未配置开发环境变量，开发环境不会注册webhook，避免干扰生产环境</li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-foreground mb-1">推荐配置：</p>
                        <ul className="space-y-1 ml-4 list-disc">
                          <li>创建两个不同的Telegram机器人（一个用于生产，一个用于开发）</li>
                          <li>使用不同bot token的机器人完全隔离两个环境</li>
                          <li>在开发环境中测试功能，在生产环境中上线</li>
                        </ul>
                      </div>
                      <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
                        <p className="text-yellow-800 text-xs">
                          <strong>注意：</strong>当前环境为 {(config as any).environment.currentEnvironment === 'production' ? '生产环境' : '开发环境'}，
                          修改Bot Token将影响 {(config as any).environment.currentEnvironment === 'production' ? '正式用户' : '开发测试'}。
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
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
                  
                  {/* Show delete button only if bot config exists AND in development environment */}
                  {config && (config as any).botToken && (config as any).environment && !(config as any).environment.isProduction && (
                    <Button 
                      variant="destructive"
                      onClick={handleDeleteConfig}
                      disabled={deleteBotConfigMutation.isPending}
                      data-testid="button-delete-config"
                      className="ml-auto"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      删除配置
                    </Button>
                  )}
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
      
      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-delete-confirmation">
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertTriangle className="w-5 h-5 mr-2" />
              确认删除机器人配置
            </DialogTitle>
            <DialogDescription className="text-left">
              删除机器人配置将会发生以下操作：
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">将会清除的数据：</h4>
              <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                <li>• 所有机器人配置</li>
                <li>• 所有员工用户数据</li>
                <li>• 所有订单记录</li>
                <li>• 所有管理员群聊配置</li>
              </ul>
            </div>
            
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>注意：</strong>该操作不可逆转，删除后需要重新配置才能使用机器人。
                此功能仅在开发环境可用，保证生产环境数据安全。
              </p>
            </div>
          </div>
          
          <div className="flex space-x-3 justify-end">
            <Button 
              variant="outline" 
              onClick={handleDeleteCancel}
              disabled={deleteBotConfigMutation.isPending}
              data-testid="button-cancel-delete"
            >
              取消
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteConfirm}
              disabled={deleteBotConfigMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteBotConfigMutation.isPending ? "删除中..." : "确认删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}