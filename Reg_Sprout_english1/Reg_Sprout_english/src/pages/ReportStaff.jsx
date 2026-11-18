import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import * as XLSX from 'xlsx';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, ArcElement, Filler, ChartDataLabels
);

// Global Chart Defaults for Trendy Look
ChartJS.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
ChartJS.defaults.color = "#64748B";

const STATUS_COLORS = {
  Pending: '#F59E0B',
  Contacted: '#0EA5E9',
  Confirmed: '#0D6EFD',
  Paid: '#10B981',
  Cancelled: '#EF4444'
};

export default function ReportStaff() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchRegistrations = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'registrations'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => {
        const item = doc.data();
        return {
          id: doc.id,
          ...item,
          status: item.status || 'Pending',
          createdAtDate: item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.clientSystemTime || Date.now())
        };
      });
      data.sort((a, b) => b.createdAtDate - a.createdAtDate);
      setRegistrations(data);
    } catch (error) {
      console.error("Error fetching registrations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const filteredData = useMemo(() => {
    return registrations.filter(reg => {
      const d = new Date(reg.createdAtDate);
      d.setHours(0, 0, 0, 0);
      
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        if (d < s) return false;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(0, 0, 0, 0);
        if (d > e) return false;
      }
      return true;
    });
  }, [registrations, startDate, endDate]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - today.getDay());
    
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    let todayCount = 0;
    let yesterdayCount = 0;
    let weekCount = 0;
    let lastWeekCount = 0;
    let monthCount = 0;

    registrations.forEach(r => {
      const d = r.createdAtDate;
      if (d >= today) todayCount++;
      if (d >= yesterday && d < today) yesterdayCount++;
      if (d >= weekStart) weekCount++;
      if (d >= lastWeekStart && d < lastWeekEnd) lastWeekCount++;
      if (d >= monthStart) monthCount++;
    });

    return { total: registrations.length, today: todayCount, yesterday: yesterdayCount, week: weekCount, lastWeek: lastWeekCount, month: monthCount };
  }, [registrations]);

  const chartData = useMemo(() => {
    const dates = {};
    const statuses = {};
    const occupations = {};

    const OCCUPATION_MAP = {
      'Indépendant(e)': 'Self Employed',
      'Indépendant': 'Self Employed',
      "Projet de création d'entreprise": 'Planning to start a business',
      'Agriculteur / Travail agricole': 'Farmer / Agriculture related work',
      'Étudiant(e)': 'Student',
      'Étudiant': 'Student',
      'Étudiant universitaire': 'Student',
      'Autres': 'Others',
      'Professionnel actif': 'Others',
      'Professionnel(le) en activité': 'Others',
      'Personne au foyer': 'Others',
      'Enseignant': 'Others'
    };

    filteredData.forEach(r => {
      const dateStr = r.createdAtDate.toISOString().split('T')[0];
      dates[dateStr] = (dates[dateStr] || 0) + 1;
      statuses[r.status] = (statuses[r.status] || 0) + 1;
      
      const normalizedOcc = OCCUPATION_MAP[r.occupation] || r.occupation;
      occupations[normalizedOcc] = (occupations[normalizedOcc] || 0) + 1;
    });

    const sortedDates = Object.keys(dates).sort();
    
    // If there's only 1 date, pad it so it draws a line
    let lineLabels = [...sortedDates];
    let lineData = sortedDates.map(d => dates[d]);
    
    if (sortedDates.length === 1) {
      // Add a dummy previous date for visual line drawing
      const d = new Date(sortedDates[0]);
      d.setDate(d.getDate() - 1);
      const prevDateStr = d.toISOString().split('T')[0];
      lineLabels = [prevDateStr, sortedDates[0]];
      lineData = [0, dates[sortedDates[0]]];
    }
    
    return {
      dailyLine: {
        labels: lineLabels,
        datasets: [{
          label: 'Registrations',
          data: lineData,
          borderColor: '#00AEEF',
          backgroundColor: 'rgba(0, 174, 239, 0.15)',
          borderWidth: 3,
          pointBackgroundColor: '#FFFFFF',
          pointBorderColor: '#00AEEF',
          pointBorderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.4,
          fill: true
        }]
      },
      comparisonBar: {
        labels: ['Today vs Yesterday', 'This Week vs Last Week'],
        datasets: [
          {
            label: 'Current Period',
            data: [stats.today, stats.week],
            backgroundColor: '#0B192C',
            borderRadius: 6,
            maxBarThickness: 50
          },
          {
            label: 'Previous Period',
            data: [stats.yesterday, stats.lastWeek],
            backgroundColor: '#E2E8F0',
            borderRadius: 6,
            maxBarThickness: 50
          }
        ]
      },
      statusPie: {
        labels: Object.keys(statuses),
        datasets: [{
          data: Object.values(statuses),
          backgroundColor: Object.keys(statuses).map(s => STATUS_COLORS[s] || '#94A3B8'),
          borderWidth: 0,
          hoverOffset: 6,
          borderRadius: 8,
          spacing: 5
        }]
      },
      occupationPie: {
        labels: Object.keys(occupations),
        datasets: [{
          data: Object.values(occupations),
          backgroundColor: ['#00AEEF', '#FF7A00', '#70C041', '#F59E0B', '#0B192C', '#8B5CF6', '#EC4899', '#64748B'],
          borderWidth: 0,
          hoverOffset: 6,
          borderRadius: 8,
          spacing: 5
        }]
      }
    };
  }, [filteredData, stats]);

  const chartOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: {
        color: '#0B192C',
        font: { weight: 'bold', size: 12 },
        anchor: 'end',
        align: 'top',
        offset: 4,
        display: (context) => context.dataset.data[context.dataIndex] > 0
      },
      tooltip: {
        backgroundColor: '#0B192C',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 13 },
        padding: 12,
        cornerRadius: 8,
        displayColors: false
      }
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { color: '#94A3B8' }
      },
      y: {
        grid: { color: '#F1F5F9', borderDash: [4, 4], drawBorder: false },
        ticks: { color: '#94A3B8', padding: 10 }
      }
    }
  };

  const doughnutOptions = {
    maintainAspectRatio: false,
    cutout: '75%',
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: { size: 12 }
        }
      },
      datalabels: {
        color: '#fff',
        font: { weight: 'bold', size: 14 },
        display: (context) => context.dataset.data[context.dataIndex] > 0
      },
      tooltip: {
        backgroundColor: '#0B192C',
        padding: 12,
        cornerRadius: 8,
        bodyFont: { size: 13 }
      }
    }
  };

  const exportExcel = () => {
    const dataRows = filteredData.map(r => ({
      'Name': r.name || '',
      'Email': r.email || '',
      'Phone': r.phone || '',
      'City': r.city || '',
      'Occupation': r.occupation || '',
      'Server Created At': r.createdAtDate ? r.createdAtDate.toLocaleString() : '',
      'Client System Time (Timestamp)': r.clientSystemTime ? `${new Date(r.clientSystemTime).toLocaleString()} (${r.clientSystemTime})` : '',
      'Status': r.status || 'Pending',
      'Status Updated At': r.statusUpdatedAt ? (r.statusUpdatedAt.toDate ? r.statusUpdatedAt.toDate().toLocaleString() : new Date(r.statusUpdatedAt).toLocaleString()) : '',
      'Status Updated By': r.statusUpdatedBy || ''
    }));

    const summaryRows = [
      { Metric: 'Total Registrations (Filtered)', Value: filteredData.length },
      { Metric: 'Total Registrations (All Time)', Value: stats.total },
      { Metric: 'Today', Value: stats.today },
      { Metric: 'This Week', Value: stats.week },
      { Metric: 'This Month', Value: stats.month },
    ];

    const wb = XLSX.utils.book_new();
    const wsData = XLSX.utils.json_to_sheet(dataRows);
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

    XLSX.utils.book_append_sheet(wb, wsData, "Registrations");
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    let filename = `registration_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    if (startDate && endDate) {
      filename = `registration_report_${startDate}_to_${endDate}.xlsx`;
    }

    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Header */}
      <header className="bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center shadow-sm sticky-top">
        <div className="d-flex align-items-center gap-3">
          <img src={logo} alt="Sprout Logo" style={{ height: '45px', objectFit: 'contain' }} />
          <div className="d-none d-sm-block border-start ps-3 ms-2">
            <h1 className="h5 mb-0" style={{ color: '#0B192C', fontWeight: '700', letterSpacing: '-0.5px' }}>
              Report Dashboard
            </h1>
            <small className="text-muted" style={{ fontSize: '0.8rem' }}>
              {currentUser?.displayName} &bull; {currentUser?.email}
            </small>
          </div>
        </div>
        <button onClick={handleLogout} className="btn btn-light border rounded-circle text-secondary shadow-sm hover-primary d-flex align-items-center justify-content-center" style={{ width: '45px', height: '45px' }} title="Logout">
          <i className="fa-solid fa-right-from-bracket"></i>
        </button>
      </header>

      <main className="flex-grow-1 p-4 container-fluid" style={{ maxWidth: '1600px', margin: '0 auto' }}>
        {/* Summary Cards */}
        <div className="row g-4 mb-5">
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '5px solid #0B192C' }}>
              <div className="card-body p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase mb-2" style={{ color: '#64748B', fontWeight: '600', fontSize: '0.8rem', letterSpacing: '1px' }}>Total Registrations</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#0B192C' }}>{stats.total}</h2>
                </div>
                <div className="bg-light rounded-circle d-flex justify-content-center align-items-center" style={{ width: '56px', height: '56px' }}>
                  <i className="fa-solid fa-chart-pie text-secondary fs-4"></i>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '5px solid #00AEEF' }}>
              <div className="card-body p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase mb-2" style={{ color: '#64748B', fontWeight: '600', fontSize: '0.8rem', letterSpacing: '1px' }}>Regs Today</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#00AEEF' }}>{stats.today}</h2>
                </div>
                <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(0,174,239,0.1)' }} className="rounded-circle d-flex justify-content-center align-items-center">
                  <i className="fa-solid fa-chart-line fs-4" style={{ color: '#00AEEF' }}></i>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '5px solid #10B981' }}>
              <div className="card-body p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase mb-2" style={{ color: '#64748B', fontWeight: '600', fontSize: '0.8rem', letterSpacing: '1px' }}>This Week</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#10B981' }}>{stats.week}</h2>
                </div>
                <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(16,185,129,0.1)' }} className="rounded-circle d-flex justify-content-center align-items-center">
                  <i className="fa-solid fa-calendar-week fs-4" style={{ color: '#10B981' }}></i>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '5px solid #F59E0B' }}>
              <div className="card-body p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase mb-2" style={{ color: '#64748B', fontWeight: '600', fontSize: '0.8rem', letterSpacing: '1px' }}>This Month</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#F59E0B' }}>{stats.month}</h2>
                </div>
                <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(245,158,11,0.1)' }} className="rounded-circle d-flex justify-content-center align-items-center">
                  <i className="fa-solid fa-calendar-days fs-4" style={{ color: '#F59E0B' }}></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Export */}
        <div className="card border-0 shadow-sm rounded-4 mb-5">
          <div className="card-body p-4">
            <div className="row g-3 align-items-end">
              <div className="col-12 col-sm-6 col-md-4 col-lg-3">
                <label className="form-label text-muted fw-bold mb-2" style={{ fontSize: '0.85rem' }}>
                  <i className="fa-regular fa-calendar-plus me-2"></i>Start Date
                </label>
                <input 
                  type="date" 
                  className="form-control form-control-lg border-0 bg-light w-100" 
                  value={startDate} 
                  max={endDate || new Date().toISOString().split('T')[0]}
                  onChange={e => setStartDate(e.target.value)} 
                  style={{ fontSize: '1rem' }} 
                />
              </div>
              <div className="col-12 col-sm-6 col-md-4 col-lg-3">
                <label className="form-label text-muted fw-bold mb-2" style={{ fontSize: '0.85rem' }}>
                  <i className="fa-regular fa-calendar-minus me-2"></i>End Date
                </label>
                <input 
                  type="date" 
                  className="form-control form-control-lg border-0 bg-light w-100" 
                  value={endDate} 
                  min={startDate || undefined}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setEndDate(e.target.value)} 
                  style={{ fontSize: '1rem' }} 
                />
              </div>
              <div className="col-12 col-md-4 col-lg-6 d-flex gap-2 justify-content-md-end mt-3 mt-md-0 flex-wrap">
                <div className="d-flex gap-2 flex-grow-1 flex-md-grow-0">
                  <button className="btn btn-light border btn-lg transition-all flex-grow-1 flex-md-grow-0" onClick={() => { setStartDate(''); setEndDate(''); }} title="Reset Filter" style={{ height: '48px', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-solid fa-rotate-left"></i>
                  </button>
                  <button className="btn btn-lg text-white transition-all flex-grow-1 flex-md-grow-0" onClick={() => fetchRegistrations()} style={{ backgroundColor: '#00AEEF', height: '48px', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Apply Filter">
                    <i className="fa-solid fa-filter"></i>
                  </button>
                </div>
                <div className="flex-grow-1 flex-md-grow-0 d-flex justify-content-end">
                  <button className="btn btn-lg text-white rounded-circle shadow-sm transition-all d-flex align-items-center justify-content-center" onClick={exportExcel} disabled={filteredData.length === 0} style={{ backgroundColor: '#10B981', width: '48px', height: '48px', padding: 0 }} title="Export to Excel">
                    <i className="fa-solid fa-file-excel"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border" style={{ color: '#00AEEF' }} role="status"></div>
            <p className="mt-3 text-muted fw-semibold">Generating Reports...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-5 bg-white shadow-sm rounded-4">
            <div className="mb-4">
              <i className="fa-regular fa-folder-open text-muted" style={{ fontSize: '4rem', opacity: 0.5 }}></i>
            </div>
            <h4 className="text-muted fw-bold mb-2">No Data Available</h4>
            <p className="text-secondary">Try adjusting your date range filter.</p>
          </div>
        ) : (
          <>
            {/* Charts */}
            <div className="row g-4 mb-5">
              <div className="col-12 col-xl-6">
                <div className="card border-0 shadow-sm rounded-4 h-100 p-3 transition-all hover-primary" style={{ backgroundColor: '#fff' }}>
                  <div className="card-body">
                    <h5 className="card-title fw-bold mb-4 text-secondary"><i className="fa-solid fa-chart-area me-2" style={{ color: '#00AEEF' }}></i>Daily Registration Trends</h5>
                    <div style={{ height: '320px' }}>
                      <Line data={chartData.dailyLine} options={chartOptions} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-xl-6">
                <div className="card border-0 shadow-sm rounded-4 h-100 p-3 transition-all hover-primary" style={{ backgroundColor: '#fff' }}>
                  <div className="card-body">
                    <h5 className="card-title fw-bold mb-4 text-secondary"><i className="fa-solid fa-chart-simple me-2" style={{ color: '#0B192C' }}></i>Period Comparison</h5>
                    <div style={{ height: '320px' }}>
                      <Bar data={chartData.comparisonBar} options={chartOptions} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-xl-6">
                <div className="card border-0 shadow-sm rounded-4 h-100 p-3 transition-all hover-primary" style={{ backgroundColor: '#fff' }}>
                  <div className="card-body">
                    <h5 className="card-title fw-bold mb-4 text-secondary"><i className="fa-solid fa-chart-pie me-2" style={{ color: '#10B981' }}></i>Payment Status Distribution</h5>
                    <div style={{ height: '320px', display: 'flex', justifyContent: 'center' }}>
                      <Doughnut data={chartData.statusPie} options={doughnutOptions} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-xl-6">
                <div className="card border-0 shadow-sm rounded-4 h-100 p-3 transition-all hover-primary" style={{ backgroundColor: '#fff' }}>
                  <div className="card-body">
                    <h5 className="card-title fw-bold mb-4 text-secondary"><i className="fa-solid fa-briefcase me-2" style={{ color: '#F59E0B' }}></i>Profession Demographics</h5>
                    <div style={{ height: '320px', display: 'flex', justifyContent: 'center' }}>
                      <Doughnut data={chartData.occupationPie} options={doughnutOptions} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
              <div className="card-header bg-white border-bottom p-4">
                <h5 className="mb-0 fw-bold text-secondary"><i className="fa-solid fa-table-list me-2"></i>Raw Data ({filteredData.length} Records)</h5>
              </div>
              <div className="card-body p-0">
                {/* Desktop Table View */}
                <div className="table-responsive d-none d-lg-block">
                  <table className="table table-hover mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th className="py-3 px-4 border-bottom-0 text-muted" style={{ fontWeight: '600', fontSize: '0.85rem' }}>NAME / CONTACT</th>
                        <th className="py-3 px-4 border-bottom-0 text-muted" style={{ fontWeight: '600', fontSize: '0.85rem' }}>CITY / OCCUPATION</th>
                        <th className="py-3 px-4 border-bottom-0 text-muted" style={{ fontWeight: '600', fontSize: '0.85rem' }}>REGISTRATION TIMESTAMPS</th>
                        <th className="py-3 px-4 border-bottom-0 text-muted" style={{ fontWeight: '600', fontSize: '0.85rem' }}>STATUS / UPDATES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.map(reg => (
                        <tr key={reg.id}>
                          <td className="px-4 py-3">
                            <div className="fw-bold mb-1" style={{ color: '#0B192C' }}>{reg.name}</div>
                            <div className="text-muted" style={{ fontSize: '0.85rem' }}><i className="fa-solid fa-envelope me-2"></i>{reg.email}</div>
                            <div className="text-muted mt-1" style={{ fontSize: '0.85rem' }}><i className="fa-solid fa-phone me-2"></i>{reg.phone}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div style={{ color: '#0B192C' }}>{reg.city}</div>
                            <div className="text-muted mt-1" style={{ fontSize: '0.85rem' }}>{reg.occupation}</div>
                          </td>
                          <td className="px-4 py-3 text-muted" style={{ fontSize: '0.85rem' }}>
                            <div className="mb-2">
                              <span className="fw-bold" style={{ color: '#64748B' }}>Server:</span><br/>
                              {reg.createdAtDate.toLocaleString()}
                            </div>
                            <div>
                              <span className="fw-bold" style={{ color: '#64748B' }}>Client:</span><br/>
                              {new Date(reg.clientSystemTime || reg.createdAtDate).toLocaleString()}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="badge rounded-pill px-3 py-2 fw-semibold mb-2 shadow-sm" style={{ backgroundColor: STATUS_COLORS[reg.status] || '#94a3b8', color: '#fff', fontSize: '0.75rem' }}>
                              {reg.status}
                            </span>
                            {reg.statusUpdatedAt && (
                              <div className="text-muted bg-light p-2 rounded border" style={{ fontSize: '0.75rem' }}>
                                <div className="mb-1"><strong style={{ color: '#64748B' }}>Updated:</strong> {reg.statusUpdatedAt.toDate ? reg.statusUpdatedAt.toDate().toLocaleString() : new Date(reg.statusUpdatedAt).toLocaleString()}</div>
                                <div><strong style={{ color: '#64748B' }}>By:</strong> {reg.statusUpdatedBy}</div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="d-block d-lg-none p-3" style={{ backgroundColor: '#F8FAFC' }}>
                  {filteredData.map(reg => (
                    <div key={reg.id} className="card border-0 shadow-sm rounded-4 mb-4">
                      <div className="card-body p-4">
                        <div className="d-flex justify-content-between align-items-start mb-3">
                          <div>
                            <h5 className="fw-bold mb-1" style={{ color: '#0B192C' }}>{reg.name}</h5>
                            <div className="text-muted small"><i className="fa-solid fa-envelope me-2"></i>{reg.email}</div>
                            <div className="text-muted small mt-1"><i className="fa-solid fa-phone me-2"></i>{reg.phone}</div>
                          </div>
                          <span className="badge rounded-pill px-3 py-2 fw-semibold shadow-sm" style={{ backgroundColor: STATUS_COLORS[reg.status] || '#94a3b8', color: '#fff', fontSize: '0.75rem' }}>
                            {reg.status}
                          </span>
                        </div>
                        
                        <hr className="text-muted opacity-25 my-3" />
                        
                        <div className="row g-3 mb-4">
                          <div className="col-6">
                            <span className="text-muted small fw-bold d-block mb-1 text-uppercase" style={{ letterSpacing: '0.5px' }}>City</span>
                            <span style={{ color: '#0B192C', fontWeight: '500' }}>{reg.city}</span>
                          </div>
                          <div className="col-6">
                            <span className="text-muted small fw-bold d-block mb-1 text-uppercase" style={{ letterSpacing: '0.5px' }}>Occupation</span>
                            <span style={{ color: '#0B192C', fontWeight: '500' }}>{reg.occupation}</span>
                          </div>
                        </div>

                        <div className="bg-light p-3 rounded-4 border">
                          <div className="mb-3">
                            <span className="text-muted small fw-bold d-block mb-1 text-uppercase" style={{ letterSpacing: '0.5px' }}><i className="fa-solid fa-server me-2"></i>Server Time</span>
                            <span className="small text-secondary fw-semibold">{reg.createdAtDate.toLocaleString()}</span>
                          </div>
                          <div className="mb-3">
                            <span className="text-muted small fw-bold d-block mb-1 text-uppercase" style={{ letterSpacing: '0.5px' }}><i className="fa-solid fa-mobile-screen me-2"></i>Client Time</span>
                            <span className="small text-secondary fw-semibold">{new Date(reg.clientSystemTime || reg.createdAtDate).toLocaleString()}</span>
                          </div>
                          {reg.statusUpdatedAt && (
                            <div className="pt-3 mt-2 border-top">
                              <span className="text-muted small fw-bold d-block mb-1 text-uppercase" style={{ letterSpacing: '0.5px' }}><i className="fa-solid fa-clock-rotate-left me-2"></i>Status Updated</span>
                              <span className="small d-block text-secondary fw-semibold mb-1">{reg.statusUpdatedAt.toDate ? reg.statusUpdatedAt.toDate().toLocaleString() : new Date(reg.statusUpdatedAt).toLocaleString()}</span>
                              <span className="small d-block text-muted">By: {reg.statusUpdatedBy}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
