// 北京时区常量
export const BEIJING_TIMEZONE = 'Asia/Shanghai';

// 缓存时区设置
let cachedTimezone: string | null = null;

/**
 * 初始化时区设置（从服务器调用）
 */
export async function initializeTimezone(): Promise<void> {
  try {
    // 动态导入 storage，只在服务器端执行
    if (typeof window === 'undefined') {
      const { storage } = await import('../../server/storage');
      const timezoneSetting = await storage.getSetting('timezone');
      if (timezoneSetting?.value) {
        cachedTimezone = timezoneSetting.value;
        console.log(`[TimeUtils] Timezone initialized: ${cachedTimezone}`);
        return;
      }
    }
    
    // 默认使用北京时区
    cachedTimezone = BEIJING_TIMEZONE;
    console.log(`[TimeUtils] Using default timezone: ${cachedTimezone}`);
  } catch (error) {
    console.warn('[TimeUtils] Failed to initialize timezone setting, using Beijing timezone:', error);
    cachedTimezone = BEIJING_TIMEZONE;
  }
}

/**
 * 获取系统时区设置
 * 优先使用系统设置，fallback 到北京时区
 */
export async function getSystemTimezone(): Promise<string> {
  try {
    // 如果已缓存，直接返回
    if (cachedTimezone) {
      return cachedTimezone;
    }

    // 尝试初始化时区设置
    await initializeTimezone();
    return cachedTimezone || BEIJING_TIMEZONE;
  } catch (error) {
    console.warn('Failed to get system timezone setting, using Beijing timezone:', error);
    return BEIJING_TIMEZONE;
  }
}

/**
 * 同步获取系统时区（用于无法使用异步的场景）
 * 优先使用缓存的时区，否则返回北京时区
 */
export function getSystemTimezoneSync(): string {
  return cachedTimezone || BEIJING_TIMEZONE;
}

/**
 * 清除时区缓存（用于设置变更时）
 */
export function clearTimezoneCache(): void {
  cachedTimezone = null;
}

/**
 * 格式化日期时间为北京时区
 * @param date 日期对象或ISO字符串
 * @param options 格式化选项
 * @returns 格式化后的日期时间字符串
 */
export function formatDateTimeBeijing(
  date: Date | string | null | undefined,
  options?: {
    showSeconds?: boolean;
    timezone?: string;
  }
): string {
  if (!date) return "未知";

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return "无效日期";

    const timezone = options?.timezone || getSystemTimezoneSync();
    const showSeconds = options?.showSeconds ?? true;

    const formatOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      ...(showSeconds && { second: '2-digit' }),
      hour12: false, // 使用24小时制
    };

    return new Intl.DateTimeFormat('zh-CN', formatOptions).format(dateObj);
  } catch (error) {
    console.warn('Error formatting datetime:', error);
    return "格式化错误";
  }
}

/**
 * 格式化日期为北京时区（仅日期部分）
 * @param date 日期对象或ISO字符串
 * @param options 格式化选项
 * @returns 格式化后的日期字符串
 */
export function formatDateBeijing(
  date: Date | string | null | undefined,
  options?: {
    timezone?: string;
    format?: 'short' | 'long';
  }
): string {
  if (!date) return "未知";

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return "无效日期";

    const timezone = options?.timezone || getSystemTimezoneSync();
    const dateStyle = options?.format === 'long' ? 'long' : 'short';

    const formatOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };

    return new Intl.DateTimeFormat('zh-CN', formatOptions).format(dateObj);
  } catch (error) {
    console.warn('Error formatting date:', error);
    return "格式化错误";
  }
}

/**
 * 格式化时间为北京时区（仅时间部分）
 * @param date 日期对象或ISO字符串
 * @param options 格式化选项
 * @returns 格式化后的时间字符串
 */
export function formatTimeBeijing(
  date: Date | string | null | undefined,
  options?: {
    showSeconds?: boolean;
    timezone?: string;
  }
): string {
  if (!date) return "未知";

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return "无效时间";

    const timezone = options?.timezone || getSystemTimezoneSync();
    const showSeconds = options?.showSeconds ?? true;

    const formatOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      ...(showSeconds && { second: '2-digit' }),
      hour12: false, // 使用24小时制
    };

    return new Intl.DateTimeFormat('zh-CN', formatOptions).format(dateObj);
  } catch (error) {
    console.warn('Error formatting time:', error);
    return "格式化错误";
  }
}

/**
 * 获取北京时区某日的开始时间 (00:00:00.000Z)
 * @param dateStr YYYY-MM-DD 格式的日期字符串
 * @param timezone 时区，默认为系统时区
 * @returns UTC时间的Date对象，表示该日在指定时区的开始时间
 */
export function getBeijingStartOfDay(dateStr: string, timezone?: string): Date {
  try {
    const tz = timezone || getSystemTimezoneSync();
    
    // 解析日期字符串
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    // 创建该日期在指定时区的开始时间
    // 注意：这里使用了时区感知的方法
    const startOfDay = new Date();
    startOfDay.setFullYear(year, month - 1, day); // month是0-based
    startOfDay.setHours(0, 0, 0, 0);

    // 将本地时间转换为指定时区时间
    // 这是一个复杂的转换，我们需要计算时区偏移
    const beijingOffset = getBejingTimezoneOffset();
    const localOffset = startOfDay.getTimezoneOffset() * 60000; // 转换为毫秒
    
    // 计算调整后的UTC时间
    const adjustedTime = startOfDay.getTime() - localOffset + beijingOffset;
    
    return new Date(adjustedTime);
  } catch (error) {
    console.warn('Error calculating Beijing start of day:', error);
    // 回退到简单实现
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    date.setHours(date.getHours() - 8); // 减去8小时转换为UTC
    return date;
  }
}

/**
 * 获取北京时区某日的结束时间 (23:59:59.999Z)
 * @param dateStr YYYY-MM-DD 格式的日期字符串
 * @param timezone 时区，默认为系统时区
 * @returns UTC时间的Date对象，表示该日在指定时区的结束时间
 */
export function getBeijingEndOfDay(dateStr: string, timezone?: string): Date {
  try {
    const tz = timezone || getSystemTimezoneSync();
    
    // 解析日期字符串
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    // 创建该日期在指定时区的结束时间
    const endOfDay = new Date();
    endOfDay.setFullYear(year, month - 1, day); // month是0-based
    endOfDay.setHours(23, 59, 59, 999);

    // 将本地时间转换为指定时区时间
    const beijingOffset = getBejingTimezoneOffset();
    const localOffset = endOfDay.getTimezoneOffset() * 60000; // 转换为毫秒
    
    // 计算调整后的UTC时间
    const adjustedTime = endOfDay.getTime() - localOffset + beijingOffset;
    
    return new Date(adjustedTime);
  } catch (error) {
    console.warn('Error calculating Beijing end of day:', error);
    // 回退到简单实现
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day, 23, 59, 59, 999);
    date.setHours(date.getHours() - 8); // 减去8小时转换为UTC
    return date;
  }
}

/**
 * 获取北京时区偏移量（毫秒）
 * 北京时间 UTC+8，固定偏移8小时
 */
function getBejingTimezoneOffset(): number {
  return 8 * 60 * 60 * 1000; // 8小时转换为毫秒
}

/**
 * 获取当前北京时间
 * @returns 当前北京时间的Date对象
 */
export function getCurrentBeijingTime(): Date {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const beijingTime = new Date(utc + getBejingTimezoneOffset());
  return beijingTime;
}

/**
 * 将UTC时间转换为北京时间
 * @param utcDate UTC时间
 * @returns 北京时间
 */
export function utcToBeijing(utcDate: Date | string): Date {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  return new Date(date.getTime() + getBejingTimezoneOffset());
}

/**
 * 将北京时间转换为UTC时间
 * @param beijingDate 北京时间
 * @returns UTC时间
 */
export function beijingToUtc(beijingDate: Date | string): Date {
  const date = typeof beijingDate === 'string' ? new Date(beijingDate) : beijingDate;
  return new Date(date.getTime() - getBejingTimezoneOffset());
}

/**
 * 格式化相对时间（多久之前）
 * @param date 日期对象或ISO字符串
 * @param options 格式化选项
 * @returns 相对时间字符串
 */
export function formatRelativeTime(
  date: Date | string | null | undefined,
  options?: { timezone?: string }
): string {
  if (!date) return "未知";

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return "无效日期";

    const now = getCurrentBeijingTime();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return "刚刚";
    } else if (diffMinutes < 60) {
      return `${diffMinutes}分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours}小时前`;
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else {
      // 超过一周显示具体日期
      return formatDateBeijing(dateObj, options);
    }
  } catch (error) {
    console.warn('Error formatting relative time:', error);
    return "格式化错误";
  }
}

/**
 * 检查两个日期是否在同一天（北京时区）
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @param timezone 时区，默认为系统时区
 * @returns 是否在同一天
 */
export function isSameDay(
  date1: Date | string,
  date2: Date | string,
  timezone?: string
): boolean {
  try {
    const d1 = typeof date1 === "string" ? new Date(date1) : date1;
    const d2 = typeof date2 === "string" ? new Date(date2) : date2;

    const tz = timezone || getSystemTimezoneSync();

    const d1Str = formatDateBeijing(d1, { timezone: tz });
    const d2Str = formatDateBeijing(d2, { timezone: tz });

    return d1Str === d2Str;
  } catch (error) {
    console.warn('Error comparing dates:', error);
    return false;
  }
}

/**
 * 导出所有格式化函数的映射，便于批量替换
 */
export const timeFormatters = {
  dateTime: formatDateTimeBeijing,
  date: formatDateBeijing,
  time: formatTimeBeijing,
  relative: formatRelativeTime,
} as const;

/**
 * 兼容性函数：替换旧的 toLocaleString 调用
 * @param date 日期对象或ISO字符串
 * @returns 格式化后的日期时间字符串
 */
export function compatFormatDateTime(date: Date | string | null | undefined): string {
  return formatDateTimeBeijing(date);
}

/**
 * 兼容性函数：替换旧的 format 调用
 * @param date 日期对象或ISO字符串
 * @returns 格式化后的日期字符串
 */
export function compatFormatDate(date: Date | string | null | undefined): string {
  return formatDateBeijing(date);
}