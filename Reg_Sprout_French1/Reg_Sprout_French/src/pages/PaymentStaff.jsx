import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, serverTimestamp, query } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

const STATUS_COLORS = {
  Pending: '#F59E0B',
  Contacted: '#0EA5E9',
  Confirmed: '#0D6EFD',
  Paid: '#10B981',
  Cancelled: '#EF4444'
};

const STATUS_OPTIONS = ['Pending', 'Contacted', 'Confirmed', 'Paid', 'Cancelled'];

const DEFAULT_REGISTRATIONS = [
  {
    id: "reg_001",
    name: "Senthil Kumar",
    email: "senthil@sprout.edu",
    phone: "+919500070756",
    city: "Chennai",
    occupation: "Indépendant",
    status: "Paid",
    createdAtDate: new Date(Date.now() - 3600000 * 2),
    language: "fr"
  },
  {
    id: "reg_002",
    name: "Amina Diallo",
    email: "amina.diallo@sprout.edu",
    phone: "+221771234567",
    city: "Dakar",
    occupation: "Commerçant",
    status: "Pending",
    createdAtDate: new Date(Date.now() - 3600000 * 5),
    language: "en"
  },
  {
    id: "reg_003",
    name: "Kwame Mensah",
    email: "kwame.m@sprout.edu",
    phone: "+233241234567",
    city: "Accra",
    occupation: "Étudiant",
    status: "Contacted",
    createdAtDate: new Date(Date.now() - 3600000 * 24),
    language: "en"
  },
  {
    id: "reg_004",
    name: "Fatima Zahra",
    email: "fatima.z@sprout.edu",
    phone: "+212612345678",
    city: "Casablanca",
    occupation: "Salarié",
    status: "Confirmed",
    createdAtDate: new Date(Date.now() - 3600000 * 48),
    language: "fr"
  }
];

export default function PaymentStaff() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  
  const [showNewModal, setShowNewModal] = useState(false);
  const [newRegistrationsAlert, setNewRegistrationsAlert] = useState([]);

  const fetchRegistrations = async () => {
    setLoading(true);
    let fetchedData = [];

    // 1. Try Firestore query
    try {
      const q = query(collection(db, 'registrations'));
      const snapshot = await getDocs(q);
      if (snapshot && !snapshot.empty) {
        fetchedData = snapshot.docs.map(doc => {
          const item = doc.data();
          return {
            id: doc.id,
            ...item,
            status: item.status || 'Pending',
            createdAtDate: item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.clientSystemTime || Date.now())
          };
        });
      }
    } catch (fsError) {
      console.warn("Firestore registrations query unavailable:", fsError.message);
    }

    // 2. Fallback to LocalStorage or seed data
    if (!fetchedData || fetchedData.length === 0) {
      try {
        const localData = localStorage.getItem('sprout_registrations_store');
        if (localData) {
          const parsed = JSON.parse(localData);
          fetchedData = parsed.map(item => ({
            ...item,
            createdAtDate: new Date(item.createdAtDate)
          }));
        } else {
          fetchedData = DEFAULT_REGISTRATIONS;
          localStorage.setItem('sprout_registrations_store', JSON.stringify(DEFAULT_REGISTRATIONS));
        }
      } catch (err) {
        fetchedData = DEFAULT_REGISTRATIONS;
      }
    }

    fetchedData.sort((a, b) => b.createdAtDate - a.createdAtDate);
    setRegistrations(fetchedData);
    checkNewRegistrations(fetchedData);
    setLoading(false);
  };

  useEffect(() => {
    fetchRegistrations();
    // eslint-disable-next-line
  }, []);

  const checkNewRegistrations = (data) => {
    if (data.length === 0) return;
    
    const lastSeen = localStorage.getItem('paymentStaffLastSeen');
    if (lastSeen) {
      const lastSeenTime = parseInt(lastSeen, 10);
      const newItems = data.filter(item => item.createdAtDate.getTime() > lastSeenTime);
      if (newItems.length > 0) {
        setNewRegistrationsAlert(newItems);
        setShowNewModal(true);
      }
    } else {
      localStorage.setItem('paymentStaffLastSeen', Date.now().toString());
    }
  };

  const handleAcknowledgeNew = () => {
    localStorage.setItem('paymentStaffLastSeen', Date.now().toString());
    setShowNewModal(false);
    setNewRegistrationsAlert([]);
  };

  const handleStatusChange = async (id, newStatus) => {
    const updatedBy = currentUser?.email || 'admin@sprout.app';
    const now = new Date();

    // Immediate state & LocalStorage sync
    setRegistrations(prev => {
      const updated = prev.map(reg => 
        reg.id === id 
          ? { ...reg, status: newStatus, statusUpdatedAt: now, statusUpdatedBy: updatedBy } 
          : reg
      );
      try {
        localStorage.setItem('sprout_registrations_store', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // Firestore update if available
    try {
      const ref = doc(db, 'registrations', id);
      await updateDoc(ref, {
        status: newStatus,
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: updatedBy
      });
    } catch (fsErr) {
      console.warn("Firestore update skipped (local store active):", fsErr.message);
    }

    // Auto-dispatch WhatsApp confirmation if marked Paid
    if (newStatus === 'Paid') {
      const targetStudent = registrations.find(r => r.id === id);
      if (targetStudent?.phone) {
        fetch('https://kairos-whatsapp-bot-cy5w.onrender.com/api/webhook/payment-confirmed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: targetStudent.phone,
            amount: 50,
            transactionId: `TXN_${Date.now()}`
          })
        }).catch(err => console.warn("WhatsApp payment webhook sync:", err.message));
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const totalCount = registrations.length;
  const todayCount = registrations.filter(r => r.createdAtDate >= todayStart).length;
  const pendingCount = registrations.filter(r => r.status === 'Pending').length;
  const paidCount = registrations.filter(r => r.status === 'Paid').length;

  const filteredRegistrations = useMemo(() => {
    return registrations.filter(reg => {
      if (filterStatus && reg.status !== filterStatus) return false;
      if (filterDate) {
        const dStr = reg.createdAtDate.toISOString().split('T')[0];
        if (dStr !== filterDate) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        return (
          (reg.name && reg.name.toLowerCase().includes(s)) ||
          (reg.email && reg.email.toLowerCase().includes(s)) ||
          (reg.phone && reg.phone.toLowerCase().includes(s)) ||
          (reg.city && reg.city.toLowerCase().includes(s))
        );
      }
      return true;
    });
  }, [registrations, search, filterStatus, filterDate]);

  const grouped = useMemo(() => {
    const groups = {};
    filteredRegistrations.forEach(reg => {
      const dateStr = reg.createdAtDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(reg);
    });
    return groups;
  }, [filteredRegistrations]);

  const latestRegistrationId = registrations.length > 0 ? registrations[0].id : null;

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: '#F8FAFC' }}>
      
      {/* Header */}
      <header className="bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center shadow-sm sticky-top">
        <div className="d-flex align-items-center gap-3">
          <img src={logo} alt="Sprout Logo" style={{ height: '45px', objectFit: 'contain' }} />
          <div className="d-none d-sm-block border-start ps-3 ms-2">
            <h1 className="h5 mb-0" style={{ color: '#0B192C', fontWeight: '700', letterSpacing: '-0.5px' }}>
              Payment Dashboard
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

      <main className="flex-grow-1 p-4 container-fluid" style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* Summary Cards */}
        <div className="row g-4 mb-5">
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '5px solid #0B192C' }}>
              <div className="card-body p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase mb-2" style={{ color: '#64748B', fontWeight: '600', fontSize: '0.8rem', letterSpacing: '1px' }}>Total Registrations</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#0B192C' }}>{totalCount}</h2>
                </div>
                <div className="bg-light rounded-circle d-flex justify-content-center align-items-center" style={{ width: '56px', height: '56px' }}>
                  <i className="fa-solid fa-users text-secondary fs-4"></i>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '5px solid #00AEEF' }}>
              <div className="card-body p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase mb-2" style={{ color: '#64748B', fontWeight: '600', fontSize: '0.8rem', letterSpacing: '1px' }}>Registrations Today</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#00AEEF' }}>{todayCount}</h2>
                </div>
                <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(0,174,239,0.1)' }} className="rounded-circle d-flex justify-content-center align-items-center">
                  <i className="fa-solid fa-calendar-day fs-4" style={{ color: '#00AEEF' }}></i>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '5px solid #F59E0B' }}>
              <div className="card-body p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase mb-2" style={{ color: '#64748B', fontWeight: '600', fontSize: '0.8rem', letterSpacing: '1px' }}>Pending</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#F59E0B' }}>{pendingCount}</h2>
                </div>
                <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(245,158,11,0.1)' }} className="rounded-circle d-flex justify-content-center align-items-center">
                  <i className="fa-regular fa-clock fs-4" style={{ color: '#F59E0B' }}></i>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '5px solid #10B981' }}>
              <div className="card-body p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase mb-2" style={{ color: '#64748B', fontWeight: '600', fontSize: '0.8rem', letterSpacing: '1px' }}>Paid</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#10B981' }}>{paidCount}</h2>
                </div>
                <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(16,185,129,0.1)' }} className="rounded-circle d-flex justify-content-center align-items-center">
                  <i className="fa-solid fa-check-circle fs-4" style={{ color: '#10B981' }}></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="card border-0 shadow-sm rounded-4 mb-5">
          <div className="card-body p-4">
            <div className="row g-3 align-items-end">
              <div className="col-12 col-lg-5">
                <label className="form-label text-muted fw-bold mb-2" style={{ fontSize: '0.85rem' }}>
                  <i className="fa-solid fa-magnifying-glass me-2"></i>Search Registrations
                </label>
                <input 
                  type="text" 
                  className="form-control form-control-lg border-0 bg-light w-100" 
                  placeholder="Search by name, email, phone, city..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ fontSize: '1rem' }}
                />
              </div>
              <div className="col-12 col-sm-6 col-lg-3">
                <label className="form-label text-muted fw-bold mb-2" style={{ fontSize: '0.85rem' }}>
                  <i className="fa-solid fa-filter me-2"></i>Status Filter
                </label>
                <select className="form-select form-select-lg border-0 bg-light w-100" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: '1rem' }}>
                  <option value="">All Statuses</option>
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-sm-6 col-lg-2">
                <label className="form-label text-muted fw-bold mb-2" style={{ fontSize: '0.85rem' }}>
                  <i className="fa-regular fa-calendar me-2"></i>Date Filter
                </label>
                <input 
                  type="date" 
                  className="form-control form-control-lg border-0 bg-light w-100" 
                  value={filterDate} 
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setFilterDate(e.target.value)} 
                  style={{ fontSize: '1rem' }} 
                />
              </div>
              <div className="col-12 col-lg-2 d-flex gap-2 justify-content-lg-end">
                <button className="btn btn-light border btn-lg transition-all flex-grow-1 flex-lg-grow-0" onClick={() => { setSearch(''); setFilterStatus(''); setFilterDate(''); }} title="Reset Filters" style={{ height: '48px', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-rotate-left"></i>
                </button>
                <button className="btn btn-lg text-white transition-all flex-grow-1 flex-lg-grow-0" onClick={fetchRegistrations} disabled={loading} style={{ backgroundColor: '#00AEEF', height: '48px', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Refresh Data">
                  <i className="fa-solid fa-arrows-rotate"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border" style={{ color: '#00AEEF' }} role="status"></div>
            <p className="mt-3 text-muted fw-semibold">Syncing latest data...</p>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-5 bg-white shadow-sm rounded-4">
            <div className="mb-4">
              <i className="fa-regular fa-folder-open text-muted" style={{ fontSize: '4rem', opacity: 0.5 }}></i>
            </div>
            <h4 className="text-muted fw-bold mb-2">No Registrations Found</h4>
            <p className="text-secondary">Try adjusting your search or filter settings.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <div key={date} className="mb-5">
              <div className="d-flex align-items-center mb-4">
                <h5 className="mb-0 fw-bold" style={{ color: '#0B192C' }}>{date}</h5>
                <hr className="flex-grow-1 ms-3 text-muted opacity-25" />
              </div>
              <div className="row g-4">
                {items.map(reg => {
                  const isNewest = reg.id === latestRegistrationId && !search && !filterStatus && !filterDate;
                  const statusColor = STATUS_COLORS[reg.status] || '#64748B';
                  
                  return (
                    <div key={reg.id} className="col-12 col-xl-6">
                      <div className={`card border-0 rounded-4 shadow-sm h-100 transition-all ${isNewest ? 'border-primary border border-2' : ''}`} style={{ backgroundColor: isNewest ? '#F0F9FF' : '#fff' }}>
                        <div className="card-body p-4">
                          
                          <div className="d-flex flex-wrap flex-sm-nowrap justify-content-between align-items-start mb-4 gap-3">
                            <div className="d-flex align-items-start gap-3 flex-grow-1" style={{ minWidth: 0 }}>
                              <div className="rounded-circle d-flex justify-content-center align-items-center text-white fw-bold shadow-sm flex-shrink-0" style={{ width: '48px', height: '48px', backgroundColor: '#0B192C', fontSize: '1.2rem' }}>
                                {reg.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                <h5 className="mb-1 fw-bold text-truncate" style={{ color: '#0F172A' }}>
                                  {reg.name}
                                  {isNewest && <span className="badge ms-2 rounded-pill align-top bg-danger animate-pulse">NEW</span>}
                                </h5>
                                <div className="text-muted d-flex flex-column gap-1" style={{ fontSize: '0.9rem' }}>
                                  <span className="text-truncate" title={reg.email}>
                                    <i className="fa-solid fa-envelope me-2 text-secondary"></i>{reg.email}
                                  </span>
                                  <span className="text-truncate" title={reg.phone}>
                                    <i className="fa-solid fa-phone me-2 text-secondary"></i>{reg.phone}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="d-flex flex-row flex-sm-column align-items-center align-items-sm-end gap-2 flex-shrink-0 mt-2 mt-sm-0" style={{ minWidth: '140px' }}>
                              <span className="badge rounded-pill px-3 py-2 fw-semibold shadow-sm text-center w-100" style={{ backgroundColor: statusColor, color: '#fff', fontSize: '0.85rem' }}>
                                <i className="fa-solid fa-circle me-2" style={{ fontSize: '0.6rem' }}></i>{reg.status}
                              </span>
                              <select 
                                className="form-select form-select-sm border-0 bg-light fw-semibold text-secondary w-100" 
                                value={reg.status}
                                onChange={(e) => handleStatusChange(reg.id, e.target.value)}
                                style={{ cursor: 'pointer' }}
                              >
                                {STATUS_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          
                          <div className="bg-light rounded-4 p-3 d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center border gap-3">
                            <div className="d-flex flex-column gap-2 text-muted w-100" style={{ fontSize: '0.85rem' }}>
                              <span><i className="fa-solid fa-location-dot me-2 text-secondary"></i><strong>{reg.city}</strong></span>
                              <span><i className="fa-solid fa-briefcase me-2 text-secondary"></i>{reg.occupation}</span>
                            </div>
                            <div className="d-flex flex-column gap-2 text-muted text-start text-sm-end w-100 border-top border-sm-0 pt-2 pt-sm-0 mt-2 mt-sm-0" style={{ fontSize: '0.85rem' }}>
                              <span><i className="fa-regular fa-clock me-2 text-secondary"></i>{reg.createdAtDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                              {reg.statusUpdatedBy && (
                                <span className="text-truncate w-100" title={reg.statusUpdatedBy}>
                                  <i className="fa-solid fa-user-pen me-2 text-secondary"></i>{reg.statusUpdatedBy.split('@')[0]}
                                </span>
                              )}
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>

      {/* New Registration Modal */}
      {showNewModal && (
        <>
          <div className="modal-backdrop fade show" style={{ opacity: 0.5 }}></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
                <div className="modal-header text-white border-0" style={{ backgroundColor: '#00AEEF' }}>
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-bell me-2 fs-5"></i>New Registration Received</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={handleAcknowledgeNew}></button>
                </div>
                <div className="modal-body p-4">
                  <p className="text-secondary mb-4">You have new registrations that require your attention.</p>
                  {newRegistrationsAlert.slice(0, 3).map(r => (
                    <div key={r.id} className="p-3 bg-light border rounded-4 mb-3 d-flex justify-content-between align-items-center">
                      <div>
                        <strong className="d-block mb-1" style={{ color: '#0B192C' }}>{r.name}</strong>
                        <span className="small text-muted"><i className="fa-solid fa-location-dot me-1"></i>{r.city} &bull; {r.occupation}</span>
                      </div>
                      <span className="badge bg-primary rounded-pill">New</span>
                    </div>
                  ))}
                  {newRegistrationsAlert.length > 3 && (
                    <p className="text-muted small text-center mt-2 fw-semibold">...and {newRegistrationsAlert.length - 3} more.</p>
                  )}
                </div>
                <div className="modal-footer border-0 bg-light p-3">
                  <button type="button" className="btn btn-light border rounded-pill px-4 fw-semibold text-secondary" onClick={handleAcknowledgeNew}>Close</button>
                  <button type="button" className="btn text-white rounded-pill px-4 fw-semibold" style={{ backgroundColor: '#00AEEF' }} onClick={handleAcknowledgeNew}>View Details</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
