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
import { Save, TestTube, Bot, Trash2, AlertTriangle, Activity, RefreshCw, CheckCircle, XCircle, AlertCircle } from "lucide-react";
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
  const [showWebhookResetConfirmation, setShowWebhookResetConfirmation] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<any>(null);
  const [webhookDiagnostics, setWebhookDiagnostics] = useState<any>(null);
  
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

  const webhookDiagnosticsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/bot-config/webhook-diagnostics", {});
      return response.json();
    },
    onSuccess: (data) => {
      setWebhookDiagnostics(data);
      toast({
        title: "诊断完成",
        description: "Webhook状态诊断已完成",
      });
    },
    onError: (error) => {
      toast({
        title: "诊断失败",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const webhookResetMutation = useMutation({
    mutationFn: async (dropPendingUpdates: boolean = true) => {
      const response = await apiRequest("POST", "/api/bot-config/reset-webhook", {
        dropPendingUpdates
      });
      return response.json();
    },
    onSuccess: (data) => {
      setWebhookDiagnostics(data.diagnostics);
      setShowWebhookResetConfirmation(false);
      toast({
        title: "重置成功",
        description: data.droppedPendingUpdates ? 
          "Webhook已重置，pending updates已清理" : 
          "Webhook已重置",
      });
    },
    onError: (error) => {
      toast({
        title: "重置失败",
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

  const handleDiagnoseWebhook = () => {
    webhookDiagnosticsMutation.mutate();
  };

  const handleResetWebhook = () => {
    setShowWebhookResetConfirmation(true);
  };

  const handleResetWebhookConfirm = () => {
    webhookResetMutation.mutate(true); // Drop pending updates
  };

  const handleResetWebhookCancel = () => {
    setShowWebhookResetConfirmation(false);
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
                
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button 
                    onClick={handleSaveConfig}
                    disabled={saveBotConfigMutation.isPending}
                    className="flex-1 min-w-[120px]"
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
                  
                  {/* Show webhook diagnostic and reset buttons only if bot config exists */}
                  {config && (config as any).botToken && (
                    <>
                      <Button 
                        variant="outline"
                        onClick={handleDiagnoseWebhook}
                        disabled={webhookDiagnosticsMutation.isPending}
                        data-testid="button-diagnose-webhook"
                      >
                        <Activity className="w-4 h-4 mr-2" />
                        {webhookDiagnosticsMutation.isPending ? "诊断中..." : "诊断Webhook"}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={handleResetWebhook}
                        disabled={webhookResetMutation.isPending}
                        data-testid="button-reset-webhook"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        重置Webhook
                      </Button>
                    </>
                  )}
                  
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

                {/* Webhook Diagnostics Display */}
                {webhookDiagnostics && (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center">
                      <Activity className="w-4 h-4 mr-2" />
                      Webhook 诊断结果
                    </h3>
                    <div className="space-y-3">
                      {/* Connection Status */}
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm font-medium">连接状态</p>
                          <p className="text-xs text-muted-foreground">API连接测试</p>
                        </div>
                        <div className="flex items-center">
                          {webhookDiagnostics.connectionTest ? (
                            <>
                              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                              <span className="text-sm text-green-600">正常</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-red-500 mr-2" />
                              <span className="text-sm text-red-600">失败</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Webhook Status */}
                      {webhookDiagnostics.webhookInfo && (
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium">Webhook状态</p>
                              <p className="text-xs text-muted-foreground">当前配置信息</p>
                            </div>
                            <div className="flex items-center">
                              {webhookDiagnostics.analysis?.hasWebhook ? (
                                <>
                                  <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                                  <span className="text-sm text-green-600">已配置</span>
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="w-4 h-4 text-yellow-500 mr-2" />
                                  <span className="text-sm text-yellow-600">未配置</span>
                                </>
                              )}
                            </div>
                          </div>
                          
                          <div className="space-y-2 text-xs">
                            {webhookDiagnostics.webhookInfo.url && (
                              <div>
                                <span className="font-medium">URL: </span>
                                <span className="text-muted-foreground break-all">{webhookDiagnostics.webhookInfo.url}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span>
                                <span className="font-medium">待处理更新: </span>
                                <span className={`${(webhookDiagnostics.webhookInfo.pending_update_count || 0) > 0 ? 'text-red-600 font-medium' : 'text-green-600'}`}>
                                  {webhookDiagnostics.webhookInfo.pending_update_count || 0}
                                </span>
                              </span>
                              <span>
                                <span className="font-medium">最大连接数: </span>
                                <span className="text-muted-foreground">{webhookDiagnostics.webhookInfo.max_connections || 'N/A'}</span>
                              </span>
                            </div>
                            {webhookDiagnostics.webhookInfo.last_error_message && webhookDiagnostics.webhookInfo.last_error_message !== 'None' && (
                              <div>
                                <span className="font-medium text-red-600">最后错误: </span>
                                <span className="text-red-600">{webhookDiagnostics.webhookInfo.last_error_message}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Recommendations */}
                      {webhookDiagnostics.analysis && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                          <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2 text-sm">建议操作</h4>
                          <div className="space-y-1">
                            {!webhookDiagnostics.analysis.hasWebhook && (
                              <p className="text-xs text-blue-700 dark:text-blue-300">• Webhook未配置，请保存配置以设置webhook</p>
                            )}
                            {webhookDiagnostics.webhookInfo?.pending_update_count > 0 && (
                              <p className="text-xs text-blue-700 dark:text-blue-300">• 检测到 {webhookDiagnostics.webhookInfo.pending_update_count} 个待处理更新，建议重置webhook清理</p>
                            )}
                            {webhookDiagnostics.webhookInfo?.last_error_message && webhookDiagnostics.webhookInfo.last_error_message !== 'None' && (
                              <p className="text-xs text-blue-700 dark:text-blue-300">• 发现webhook错误，建议重置webhook修复问题</p>
                            )}
                            {webhookDiagnostics.analysis.hasWebhook && (!webhookDiagnostics.webhookInfo?.pending_update_count || webhookDiagnostics.webhookInfo.pending_update_count === 0) && (!webhookDiagnostics.webhookInfo?.last_error_message || webhookDiagnostics.webhookInfo.last_error_message === 'None') && (
                              <p className="text-xs text-blue-700 dark:text-blue-300">• Webhook配置正常，无需特殊处理</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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

      {/* Webhook Reset Confirmation Modal */}
      <Dialog open={showWebhookResetConfirmation} onOpenChange={setShowWebhookResetConfirmation}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-webhook-reset-confirmation">
          <DialogHeader>
            <DialogTitle className="flex items-center text-orange-600">
              <RefreshCw className="w-5 h-5 mr-2" />
              确认重置Webhook配置
            </DialogTitle>
            <DialogDescription className="text-left">
              重置Webhook将会发生以下操作：
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">重置操作：</h4>
              <ul className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
                <li>• 删除当前Webhook配置</li>
                <li>• 清除所有待处理的更新 (pending updates)</li>
                <li>• 重新注册Webhook到Telegram服务器</li>
                <li>• 使用新的密钥重新认证</li>
              </ul>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>用途：</strong>修复Webhook重复消息问题、清理错误状态、解决连接异常。
                该操作是安全的，不会影响机器人数据或用户信息。
              </p>
            </div>

            {webhookDiagnostics?.webhookInfo?.pending_update_count > 0 && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>检测到问题：</strong>当前有 {webhookDiagnostics.webhookInfo.pending_update_count} 个待处理更新，
                  这可能导致重复消息。重置将清除这些更新。
                </p>
              </div>
            )}
          </div>
          
          <div className="flex space-x-3 justify-end">
            <Button 
              variant="outline" 
              onClick={handleResetWebhookCancel}
              disabled={webhookResetMutation.isPending}
              data-testid="button-cancel-webhook-reset"
            >
              取消
            </Button>
            <Button 
              variant="default"
              onClick={handleResetWebhookConfirm}
              disabled={webhookResetMutation.isPending}
              data-testid="button-confirm-webhook-reset"
              className="bg-orange-600 hover:bg-orange-700"
            >
              {webhookResetMutation.isPending ? "重置中..." : "确认重置"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}