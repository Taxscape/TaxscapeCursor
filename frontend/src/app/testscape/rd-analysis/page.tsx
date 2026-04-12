"use client";

import React from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery } from '@tanstack/react-query';
import { getQRESummary } from '@/lib/api';

export default function RDAnalysisPage() {
  const { clientId, taxYear } = useActiveContext();
  
  const numericTaxYear = parseInt(taxYear) || 2024;
  
  // Fetch QRE summary
  const { data: summary, isLoading } = useQuery({
    queryKey: ['qre-summary', clientId, numericTaxYear],
    queryFn: () => getQRESummary(clientId!, numericTaxYear),
    enabled: !!clientId,
  });
  
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
          <AnalysisIcon />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400 text-center max-w-md">
          Choose a client from the header to view R&D analysis.
        </p>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">R&D Analysis</h1>
        <p className="text-gray-400">Detailed breakdown of Qualified Research Expenses</p>
      </div>
      
      {/* QRE Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnalysisCard
          title="Wage QRE"
          value={formatCurrency(summary?.wage_qre || 0)}
          icon={<UsersIcon />}
          color="blue"
        />
        <AnalysisCard
          title="Supply QRE"
          value={formatCurrency(summary?.supply_qre || 0)}
          icon={<PackageIcon />}
          color="purple"
        />
        <AnalysisCard
          title="Contract QRE"
          value={formatCurrency(summary?.contract_qre || 0)}
          icon={<BuildingIcon />}
          color="indigo"
        />
        <AnalysisCard
          title="Total QRE"
          value={formatCurrency(summary?.total_qre || 0)}
          icon={<TrendingUpIcon />}
          color="green"
        />
      </div>
      
      {/* Detailed breakdown section would go here */}
      <div className="bg-[#12121a] border border-white/10 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-gray-500">
          <AnalysisIcon />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Advanced Analysis Coming Soon</h3>
        <p className="text-gray-400 max-w-md mx-auto">
          We are building interactive visualizations for project and department breakdowns.
        </p>
      </div>
    </div>
  );
}

function AnalysisCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/10 text-blue-400',
    purple: 'from-purple-500/20 to-purple-600/10 text-purple-400',
    indigo: 'from-indigo-500/20 to-indigo-600/10 text-indigo-400',
    green: 'from-green-500/20 to-green-600/10 text-green-400',
  };
  
  return (
    <div className="bg-[#12121a] border border-white/10 rounded-xl p-5">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <p className="text-sm text-gray-400 mb-1">{title}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function AnalysisIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
