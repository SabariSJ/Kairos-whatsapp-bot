import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reportApi } from '../api/reportApi';
import LanguageFilter from '../components/LanguageFilter';
import logo from '../assets/logo.png';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import * as XLSX from 'xlsx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
  ChartDataLabels
);

ChartJS.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
ChartJS.defaults.color = '#64748B';

const STATUS_COLORS = {
  Pending: '#F59E0B',
  Contacted: '#0EA5E9',
  Confirmed: '#0D6EFD',
  Paid: '#10B981',
  Cancelled: '#EF4444',
};

export default function ReportDashboard() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [language, setLanguage] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportApi.getSummary({
        language,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      if (res.success) {
        setReportData(res.report);
      }
    } catch (err) {
      console.error('Failed to load report summary:', err);
      setError(err.response?.data?.error || 'Failed to load report summary from backend.');
    } finally {
      setLoading(false);
    }
  }, [language, startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Export to Excel Engine
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const recordsRes = await reportApi.getRecords({
        language,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      const records = recordsRes.records || [];
      const kpis = reportData?.kpis || {};
      const statusCounts = reportData?.statusCounts || {};
      const professionBreakdown = reportData?.professionBreakdown || [];

      // Sheet 1: Registration Records
      const rows = records.map((r) => ({
        'Registration ID': r.registrationId,
        'Student Name': r.fullName,
        'Country Code': r.countryCode,
        'Phone Number': r.phoneNumber,
        'Email Address': r.email,
        City: r.city,
        Profession: r.profession,
        Language: r.language === 'fr' ? 'French' : 'English',
        Course: r.courseName,
        'Registered Date': r.registeredAt ? new Date(r.registeredAt).toLocaleString() : '',
        'Payment Status': r.paymentStatus,
        'Status Updated By': r.statusUpdatedBy || '',
        'Status Updated At': r.statusUpdatedAt ? new Date(r.statusUpdatedAt).toLocaleString() : '',
      }));

      // Sheet 2: Executive Summary
      const summaryRows = [
        { Metric: 'Active Language Filter', Value: language.toUpperCase() },
        { Metric: 'Date Range', Value: `${startDate || 'Start'} to ${endDate || 'Now'}` },
        { Metric: 'Total Registrations', Value: kpis.total || 0 },
        { Metric: 'English Registrations', Value: kpis.englishCount || 0 },
        { Metric: 'French Registrations', Value: kpis.frenchCount || 0 },
        { Metric: 'Registrations Today', Value: kpis.today || 0 },
        { Metric: 'Registrations Yesterday', Value: kpis.yesterday || 0 },
        { Metric: 'Registrations This Week', Value: kpis.thisWeek || 0 },
        { Metric: 'Registrations Last Week', Value: kpis.lastWeek || 0 },
        { Metric: 'Registrations This Month', Value: kpis.thisMonth || 0 },
      ];

      // Sheet 3: Status Breakdown
      const statusRows = Object.entries(statusCounts).map(([status, count]) => ({
        'Payment Status': status,
        'Total Count': count,
      }));

      // Sheet 4: Profession Breakdown
      const profRows = professionBreakdown.map((p) => ({
        Profession: p.profession,
        Count: p.count,
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Students');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary KPIs');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statusRows), 'Status Breakdown');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profRows), 'Professions');

      const dateStamp = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Kairos_Report_${language}_${dateStamp}.xlsx`);
    } catch (err) {
      console.error('Excel Export error:', err);
      alert('Failed to export Excel report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Chart Data Calculations
  const chartData = useMemo(() => {
    if (!reportData) return null;

    const { kpis = {}, statusCounts = {}, professionBreakdown = [], dailyTrend = [] } = reportData;

    // Daily Line Chart
    let lineLabels = dailyTrend.map((d) => d.date);
    let lineCounts = dailyTrend.map((d) => d.count);
    if (lineLabels.length === 1) {
      lineLabels = ['Previous', lineLabels[0]];
      lineCounts = [0, lineCounts[0]];
    }

    const dailyLine = {
      labels: lineLabels,
      datasets: [
        {
          label: 'Registrations',
          data: lineCounts,
          borderColor: '#00AEEF',
          backgroundColor: 'rgba(0, 174, 239, 0.15)',
          borderWidth: 3,
          pointBackgroundColor: '#FFFFFF',
          pointBorderColor: '#00AEEF',
          pointBorderWidth: 3,
          pointRadius: 5,
          tension: 0.4,
          fill: true,
        },
      ],
    };

    // Comparison Bar
    const comparisonBar = {
      labels: ['Today vs Yesterday', 'This Week vs Last Week'],
      datasets: [
        {
          label: 'Current Period',
          data: [kpis.today || 0, kpis.thisWeek || 0],
          backgroundColor: '#0B192C',
          borderRadius: 6,
          maxBarThickness: 50,
        },
        {
          label: 'Previous Period',
          data: [kpis.yesterday || 0, kpis.lastWeek || 0],
          backgroundColor: '#E2E8F0',
          borderRadius: 6,
          maxBarThickness: 50,
        },
      ],
    };

    // Status Doughnut
    const statusLabels = Object.keys(statusCounts);
    const statusData = Object.values(statusCounts);
    const statusPie = {
      labels: statusLabels,
      datasets: [
        {
          data: statusData,
          backgroundColor: statusLabels.map((s) => STATUS_COLORS[s] || '#94A3B8'),
          borderWidth: 0,
          hoverOffset: 6,
          borderRadius: 8,
          spacing: 4,
        },
      ],
    };

    // Profession Doughnut
    const profLabels = professionBreakdown.map((p) => p.profession);
    const profData = professionBreakdown.map((p) => p.count);
    const professionPie = {
      labels: profLabels,
      datasets: [
        {
          data: profData,
          backgroundColor: [
            '#00AEEF',
            '#FF7A00',
            '#70C041',
            '#F59E0B',
            '#0B192C',
            '#8B5CF6',
            '#EC4899',
            '#64748B',
          ],
          borderWidth: 0,
          hoverOffset: 6,
          borderRadius: 8,
          spacing: 4,
        },
      ],
    };

    return { dailyLine, comparisonBar, statusPie, professionPie };
  }, [reportData]);

  const kpis = reportData?.kpis || {};

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Top Navbar */}
      <header className="bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center shadow-sm sticky-top">
        <div className="d-flex align-items-center gap-3">
          <img src={logo} alt="Sprout Logo" style={{ height: '42px', objectFit: 'contain' }} />
          <div className="border-start ps-3 ms-2">
            <div className="d-flex align-items-center gap-2">
              <h1 className="h5 mb-0 fw-bold" style={{ color: '#0B192C' }}>
                Report Dashboard
              </h1>
              <span className="badge rounded-pill bg-success" style={{ backgroundColor: '#10B981' }}>
                Analytics
              </span>
            </div>
            <small className="text-muted" style={{ fontSize: '0.8rem' }}>
              {currentUser?.displayName || 'Report Team'} &bull; {currentUser?.email}
            </small>
          </div>
        </div>

        <div className="d-flex align-items-center gap-3">
          <LanguageFilter value={language} onChange={setLanguage} />
          <button
            onClick={handleLogout}
            className="btn btn-light border rounded-circle text-secondary shadow-sm hover-primary d-flex align-items-center justify-content-center"
            style={{ width: '42px', height: '42px' }}
            title="Logout"
          >
            <i className="fa-solid fa-right-from-bracket"></i>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow-1 p-4 container-fluid" style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {error && (
          <div className="alert alert-danger border-0 rounded-4 shadow-sm" role="alert">
            <i className="fa-solid fa-triangle-exclamation me-2"></i> {error}
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="row g-4 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="card border-0 shadow-sm rounded-4 h-100" style={{ borderLeft: '5px solid #0B192C' }}>
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 className="text-uppercase text-muted fw-bold small mb-2">Total Registrations</h6>
                    <h2 className="mb-1 fw-bold" style={{ color: '#0B192C' }}>{kpis.total || 0}</h2>
                    <div className="d-flex gap-2 mt-2">
                      <span className="badge bg-info text-dark rounded-pill">EN: {kpis.englishCount || 0}</span>
                      <span className="badge bg-purple text-white rounded-pill" style={{ backgroundColor: '#7C3AED' }}>FR: {kpis.frenchCount || 0}</span>
                    </div>
                  </div>
                  <div className="bg-light rounded-circle p-3">
                    <i className="fa-solid fa-chart-pie text-secondary fs-4"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="card border-0 shadow-sm rounded-4 h-100" style={{ borderLeft: '5px solid #00AEEF' }}>
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 className="text-uppercase text-muted fw-bold small mb-2">Registered Today</h6>
                    <h2 className="mb-1 fw-bold text-primary" style={{ color: '#00AEEF' }}>{kpis.today || 0}</h2>
                    <small className="text-muted">Yesterday: {kpis.yesterday || 0}</small>
                  </div>
                  <div className="rounded-circle p-3" style={{ backgroundColor: 'rgba(0,174,239,0.1)' }}>
                    <i className="fa-solid fa-chart-line fs-4" style={{ color: '#00AEEF' }}></i>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="card border-0 shadow-sm rounded-4 h-100" style={{ borderLeft: '5px solid #10B981' }}>
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 className="text-uppercase text-muted fw-bold small mb-2">This Week</h6>
                    <h2 className="mb-1 fw-bold text-success">{kpis.thisWeek || 0}</h2>
                    <small className="text-muted">Last Week: {kpis.lastWeek || 0}</small>
                  </div>
                  <div className="rounded-circle p-3" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                    <i className="fa-solid fa-calendar-week fs-4" style={{ color: '#10B981' }}></i>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-sm-6 col-xl-3">
            <div className="card border-0 shadow-sm rounded-4 h-100" style={{ borderLeft: '5px solid #F59E0B' }}>
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 className="text-uppercase text-muted fw-bold small mb-2">This Month</h6>
                    <h2 className="mb-1 fw-bold text-warning">{kpis.thisMonth || 0}</h2>
                    <small className="text-muted">Month to date</small>
                  </div>
                  <div className="rounded-circle p-3" style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}>
                    <i className="fa-solid fa-calendar-days fs-4" style={{ color: '#F59E0B' }}></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Date Filter & Export Toolbar */}
        <div className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-body p-3 p-md-4">
            <div className="row g-3 align-items-end">
              <div className="col-12 col-sm-6 col-md-3">
                <label className="form-label text-muted fw-bold small mb-1">
                  <i className="fa-regular fa-calendar-plus me-1"></i> Start Date
                </label>
                <input
                  type="date"
                  className="form-control border-0 bg-light"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="col-12 col-sm-6 col-md-3">
                <label className="form-label text-muted fw-bold small mb-1">
                  <i className="fa-regular fa-calendar-minus me-1"></i> End Date
                </label>
                <input
                  type="date"
                  className="form-control border-0 bg-light"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="col-12 col-md-6 d-flex gap-2 justify-content-md-end">
                <button
                  className="btn btn-light border px-3"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setLanguage('all');
                  }}
                  title="Reset Filter"
                >
                  <i className="fa-solid fa-rotate-left me-1"></i> Reset
                </button>
                <button
                  className="btn text-white px-3"
                  style={{ backgroundColor: '#00AEEF' }}
                  onClick={fetchReport}
                  disabled={loading}
                >
                  <i className="fa-solid fa-filter me-1"></i> Apply
                </button>
                <button
                  className="btn btn-success px-3 shadow-sm"
                  onClick={handleExportExcel}
                  disabled={isExporting || (kpis.total || 0) === 0}
                  title="Export to Excel (.xlsx)"
                >
                  {isExporting ? (
                    <span className="spinner-border spinner-border-sm me-1"></span>
                  ) : (
                    <i className="fa-solid fa-file-excel me-1"></i>
                  )}
                  Export Excel
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status"></div>
            <p className="mt-3 text-muted fw-semibold">Compiling analytics charts...</p>
          </div>
        ) : !chartData ? (
          <div className="card border-0 shadow-sm rounded-4 p-5 text-center">
            <p className="text-muted">No data available for the selected filters.</p>
          </div>
        ) : (
          <div className="row g-4">
            {/* Daily Line Trend */}
            <div className="col-12 col-lg-8">
              <div className="card border-0 shadow-sm rounded-4 h-100 p-4 bg-white">
                <h5 className="fw-bold mb-3" style={{ color: '#0B192C' }}>
                  <i className="fa-solid fa-chart-line me-2 text-primary"></i> Daily Registration Trend
                </h5>
                <div style={{ height: '320px' }}>
                  <Line
                    data={chartData.dailyLine}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
                      },
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Period Comparison Bar */}
            <div className="col-12 col-lg-4">
              <div className="card border-0 shadow-sm rounded-4 h-100 p-4 bg-white">
                <h5 className="fw-bold mb-3" style={{ color: '#0B192C' }}>
                  <i className="fa-solid fa-chart-column me-2 text-primary"></i> Period Comparison
                </h5>
                <div style={{ height: '320px' }}>
                  <Bar
                    data={chartData.comparisonBar}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom' } },
                      scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
                      },
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Payment Status Doughnut */}
            <div className="col-12 col-md-6">
              <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
                <h5 className="fw-bold mb-3" style={{ color: '#0B192C' }}>
                  <i className="fa-solid fa-circle-notch me-2 text-success"></i> Payment Status Breakdown
                </h5>
                <div style={{ height: '280px' }}>
                  <Doughnut
                    data={chartData.statusPie}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      cutout: '70%',
                      plugins: { legend: { position: 'right' } },
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Profession Breakdown Doughnut */}
            <div className="col-12 col-md-6">
              <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
                <h5 className="fw-bold mb-3" style={{ color: '#0B192C' }}>
                  <i className="fa-solid fa-briefcase me-2 text-warning"></i> Profession Distribution
                </h5>
                <div style={{ height: '280px' }}>
                  <Doughnut
                    data={chartData.professionPie}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      cutout: '70%',
                      plugins: { legend: { position: 'right' } },
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
