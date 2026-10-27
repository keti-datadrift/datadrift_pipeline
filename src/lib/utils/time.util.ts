// Utility functions for time formatting and manipulation

/**
 * Formats a date into a relative time string
 * e.g. 'just now', '37 minutes ago', '2 hours ago', '1 day ago', etc.
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const targetDate = typeof date === 'string' ? new Date(date) : date;

  // Handle invalid dates
  if (isNaN(targetDate.getTime())) {
    return 'unknown';
  }

  const diffInMs = now.getTime() - targetDate.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInWeeks = Math.floor(diffInDays / 7);
  const diffInMonths = Math.floor(diffInDays / 30);
  const diffInYears = Math.floor(diffInDays / 365);

  // Future dates
  if (diffInMs < 0) {
    return 'in the future';
  }

  // Less than 1 minute
  if (diffInSeconds < 60) {
    return 'just now';
  }

  // Minutes
  if (diffInMinutes < 60) {
    return diffInMinutes === 1
      ? '1 minute ago'
      : `${diffInMinutes} minutes ago`;
  }

  // Hours
  if (diffInHours < 24) {
    return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`;
  }

  // Days
  if (diffInDays < 7) {
    return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`;
  }

  // Weeks
  if (diffInWeeks < 4) {
    return diffInWeeks === 1 ? '1 week ago' : `${diffInWeeks} weeks ago`;
  }

  // Months
  if (diffInMonths < 12) {
    return diffInMonths === 1 ? '1 month ago' : `${diffInMonths} months ago`;
  }

  // Years
  return diffInYears === 1 ? '1 year ago' : `${diffInYears} years ago`;
}

/**
 * Get a human-readable relative time that updates appropriately
 * This can be used for components that need to show live updating time
 */
export function getRelativeTimeWithRefresh(date: Date | string): {
  relativeTime: string;
  shouldRefreshIn: number; // milliseconds until next logical refresh
} {
  const relativeTime = formatRelativeTime(date);

  const now = new Date();
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const diffInMs = now.getTime() - targetDate.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);

  let shouldRefreshIn: number;

  if (diffInSeconds < 60) {
    // Refresh every 10 seconds for "just now"
    shouldRefreshIn = 10 * 1000;
  } else if (diffInMinutes < 60) {
    // Refresh every minute for minute-based times
    shouldRefreshIn = 60 * 1000;
  } else if (diffInHours < 24) {
    // Refresh every hour for hour-based times
    shouldRefreshIn = 60 * 60 * 1000;
  } else {
    // Refresh every day for day+ based times
    shouldRefreshIn = 24 * 60 * 60 * 1000;
  }

  return {
    relativeTime,
    shouldRefreshIn,
  };
}
