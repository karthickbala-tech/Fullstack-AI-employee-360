import React, { useState } from 'react';
import brandLogo from '../assets/brand-logo.png';
import type {
  ActivePage,
  DataSourceMode,
  EmployeeDirectoryEntry,
  ZohoConnectionStatus,
} from '../types/employee360';
import { EmployeeAvatar } from './EmployeeAvatar';

interface TopNavBarProps {
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  employees: EmployeeDirectoryEntry[];
  selectedEmployeeId: string;
  onSelectEmployee: (employeeId: string) => void;
  dataSourceMode: DataSourceMode;
  onToggleDataSourceMode: (mode: DataSourceMode) => void;
  connectionStatus: ZohoConnectionStatus | null;
  isLoadingData: boolean;
  onRefreshData: () => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  activePage,
  onSelectPage,
  employees,
  selectedEmployeeId,
  onSelectEmployee,
  dataSourceMode,
  onToggleDataSourceMode,
  connectionStatus,
  isLoadingData,
  onRefreshData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  const currentEmp = employees.find(
    (e) => e.employeeId.toUpperCase() === selectedEmployeeId.toUpperCase()
  );

  const filteredEmployees = employees.filter((emp) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      emp.employeeId.toLowerCase().includes(q) ||
      (emp.fullName || '').toLowerCase().includes(q) ||
      (emp.department || '').toLowerCase().includes(q) ||
      (emp.jobTitle || '').toLowerCase().includes(q)
    );
  });

  const handleCustomEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    onSelectEmployee(searchQuery.trim().toUpperCase());
    setDropdownOpen(false);
    setSearchQuery('');
  };

  return (
    <header className="top-nav-bar" role="banner">
      {/* Zone 1: Brand Title + Active Subject Selector */}
      <div className="top-nav-left">
        <div className="brand-lockup">
          <div className="brand-icon" aria-hidden="true">
            <img src={brandLogo} alt="" width={36} height={36} />
          </div>
          <span className="brand-title">AI Employee 360</span>
        </div>

        {/* Employee Context Search & Selector */}
        <div className="employee-selector-wrapper">
          <button
            type="button"
            className="employee-selector-trigger"
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-expanded={dropdownOpen}
            aria-label="Select employee context"
          >
            <EmployeeAvatar
              employeeId={selectedEmployeeId}
              fullName={currentEmp?.fullName || null}
              size="sm"
            />
            <span className="selector-emp-name">
              {currentEmp?.fullName || `Employee ${selectedEmployeeId}`}
            </span>
            <span className="selector-emp-sep" aria-hidden="true">
              ·
            </span>
            <span className="selector-emp-id mono-num">{selectedEmployeeId}</span>
            <svg
              className="selector-chevron"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="employee-dropdown-menu" role="listbox">
              <form onSubmit={handleCustomEmployeeSubmit} className="employee-search-form">
                <svg
                  className="search-input-icon"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  className="employee-search-input"
                  placeholder="Filter or enter Employee ID (e.g. DEMO001, HRM2)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searchQuery.trim() && (
                  <button type="submit" className="employee-id-go-btn">
                    Load ID
                  </button>
                )}
              </form>

              <div className="employee-dropdown-header">
                <span>
                  {dataSourceMode === 'mock'
                    ? 'Demo Employee 360 Records'
                    : 'Live Zoho People Directory'}
                </span>
                <span className="mono-num">{filteredEmployees.length} records</span>
              </div>

              <div className="employee-dropdown-list">
                {filteredEmployees.map((emp) => {
                  const isSelected =
                    emp.employeeId.toUpperCase() === selectedEmployeeId.toUpperCase();
                  return (
                    <button
                      key={emp.employeeId}
                      type="button"
                      className={`employee-dropdown-item ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        onSelectEmployee(emp.employeeId);
                        setDropdownOpen(false);
                        setSearchQuery('');
                      }}
                    >
                      <EmployeeAvatar
                        employeeId={emp.employeeId}
                        fullName={emp.fullName}
                        size="sm"
                      />
                      <div className="emp-item-details">
                        <div className="emp-item-top">
                          <span className="emp-item-name">
                            {emp.fullName || 'Name Not Recorded'}
                          </span>
                          <span className="emp-item-id mono-num">{emp.employeeId}</span>
                        </div>
                        <div className="emp-item-meta">
                          <span>{emp.jobTitle || 'Role Unknown'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{emp.department || 'Department Unknown'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{emp.status || 'Unknown'}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {filteredEmployees.length === 0 && (
                  <div className="employee-dropdown-empty">
                    <p>No matching directory entry for &ldquo;{searchQuery}&rdquo;.</p>
                    <button
                      type="button"
                      className="query-direct-btn"
                      onClick={() => {
                        onSelectEmployee(searchQuery.trim().toUpperCase());
                        setDropdownOpen(false);
                        setSearchQuery('');
                      }}
                    >
                      Query Employee ID &ldquo;{searchQuery.trim().toUpperCase()}&rdquo; directly
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zone 2: Centered AI / Dashboard Navigation Toggle (Primary Requirement) */}
      <nav className="top-nav-center" aria-label="Primary view toggle">
        <div className="mode-toggle-track" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activePage === 'ai'}
            className={`mode-toggle-btn ${activePage === 'ai' ? 'is-active' : ''}`}
            onClick={() => onSelectPage('ai')}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>AI Chat</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activePage === 'dashboard'}
            className={`mode-toggle-btn ${activePage === 'dashboard' ? 'is-active' : ''}`}
            onClick={() => onSelectPage('dashboard')}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span>Dashboard</span>
          </button>
        </div>
      </nav>

      {/* Zone 3: Data Source Mode & Connection Info */}
      <div className="top-nav-right">
        <div className="source-switch-group" role="group" aria-label="Data source mode">
          <button
            type="button"
            className={`source-btn ${dataSourceMode === 'mock' ? 'active' : ''}`}
            onClick={() => onToggleDataSourceMode('mock')}
            title="Use realistic Employee 360 demo dataset (Sarah Anderson, David Wilson, Priya Sharma)"
          >
            Demo Data
          </button>
          <button
            type="button"
            className={`source-btn ${dataSourceMode === 'live' ? 'active' : ''}`}
            onClick={() => onToggleDataSourceMode('live')}
            title="Connect directly to deployed Catalyst serverless API"
          >
            Live API
          </button>
        </div>

        <button
          type="button"
          className="nav-icon-btn"
          onClick={onRefreshData}
          disabled={isLoadingData}
          title="Refresh Employee 360 context"
          aria-label="Refresh Employee 360 context"
        >
          <svg
            className={isLoadingData ? 'spin-anim' : ''}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
            <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          type="button"
          className="nav-icon-btn"
          onClick={() => setStatusModalOpen((prev) => !prev)}
          aria-expanded={statusModalOpen}
          title="API & Zoho People Connection Status"
          aria-label="API & Zoho People Connection Status"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {statusModalOpen && (
          <div className="connection-popover" role="dialog" aria-label="Backend API Status">
            <div className="popover-header">
              <h4>Headless API &amp; Connector Boundary</h4>
              <button
                type="button"
                className="popover-close"
                aria-label="Close connection status"
                onClick={() => setStatusModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="popover-body">
              <div className="popover-row">
                <span>Active Data Source</span>
                <strong>
                  {dataSourceMode === 'mock'
                    ? 'Demo Mock Dataset (Frontend Isolated)'
                    : 'Live Catalyst Serverless API'}
                </strong>
              </div>
              <div className="popover-row">
                <span>Connection Status</span>
                <span className={connectionStatus?.connected ? 'status-ok' : 'status-warn'}>
                  {connectionStatus?.connected ? 'Connected' : 'Unverified / Offline'}
                </span>
              </div>
              <div className="popover-row">
                <span>Organization</span>
                <span>{connectionStatus?.organizationName || 'VSK HR Solution Pvt Ltd'}</span>
              </div>
              <div className="popover-row">
                <span>Catalyst Connection</span>
                <span className="mono-num">
                  {connectionStatus?.connectionName || 'zohopeople_employee360_v2'}
                </span>
              </div>
              <div className="popover-row">
                <span>Portal / DC</span>
                <span className="mono-num">
                  {connectionStatus?.portalId || '60076299713'} ({connectionStatus?.dataCenter || 'in'})
                </span>
              </div>
              {connectionStatus?.message && (
                <p className="popover-note">{connectionStatus.message}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
