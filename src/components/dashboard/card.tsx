import React from 'react';

interface CardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, children, className = '' }: CardProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-800">{title}</h3>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  description, 
  icon, 
  trend, 
  className = '' 
}: StatCardProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm p-5 ${className}`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <h3 className="text-2xl font-semibold mt-1 text-gray-800">{value}</h3>
          
          {trend && (
            <div className="flex items-center mt-1">
              <span className={`text-xs font-medium ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className={`h-3 w-3 ml-1 ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d={trend.isPositive 
                    ? "M5 10l7-7m0 0l7 7m-7-7v18" 
                    : "M19 14l-7 7m0 0l-7-7m7 7V3"} 
                />
              </svg>
            </div>
          )}
          
          {description && (
            <p className="text-xs text-gray-500 mt-1">{description}</p>
          )}
        </div>
        
        {icon && (
          <div className="bg-blue-50 p-2 rounded-lg">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
