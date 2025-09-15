import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format Telegram group link based on group ID
 * @param groupId - Telegram group ID (can be negative for private groups)
 * @returns Formatted Telegram group link
 */
export function formatTelegramGroupLink(groupId: string): string {
  // Handle negative group IDs (private supergroups)
  if (groupId.startsWith('-100')) {
    // Remove -100 prefix and add /1 for private supergroup link format
    const cleanId = groupId.replace('-100', '');
    return `https://t.me/c/${cleanId}/1`;
  } else if (groupId.startsWith('-')) {
    // Handle other negative IDs (basic groups)
    const cleanId = groupId.replace('-', '');
    return `https://t.me/c/${cleanId}/1`;
  } else {
    // For positive IDs or usernames (public groups/channels)
    return `https://t.me/${groupId}`;
  }
}

/**
 * Format date to Beijing timezone string
 * @param date - Date object or ISO string
 * @returns Formatted Beijing time string
 */
export function formatBeijingTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}
