import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LanguageFilter from '../components/LanguageFilter';
import logo from '../assets/logo.png';

const STATUS_COLORS = {
  Pending: '#F59E0B',
  Contacted: '#0EA5E9',
  Confirmed: '#0D6EFD',
  Paid: '#10B981',
  Cancelled: '#EF4444'
};

const STATUS_OPTIONS = ['Pending', 'Contacted', 'Confirmed', 'Paid', 'Cancelled'];

const STATUS_FR = {
  Pending: 'En attente',
  Contacted: 'Contacté',
  Confirmed: 'Confirmé',
  Paid: 'Payé',
  Cancelled: 'Annulé'
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://kairos-whatsapp-bot-cy5w.onrender.com/api';

export default function PaymentStaff() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  
  // Filters
  const [language, setLanguage] = useState('all');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  
  // Updating state tracker
  const [updatingId, setUpdatingId] = useState(null);
  
  // Modal for new registrations alert
  const [showNewModal, setShowNewModal] = useState(false);
  const [newRegistrationsAlert, setNewRegistrationsAlert] = useState([]);

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (language && language !== 'all') params.append('language', language);
      if (filterStatus) params.append('status', filterStatus);
      if (filterDate) params.append('date', filterDate);
      if (search) params.append('search', search);

      const res = await fetch(`${API_BASE_URL}/staff/payments?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Impossible de récupérer les paiements.`);
      }
      const data = await res.json();
      const rawPayments = data.payments || [];

      // Map raw PostgreSQL records to UI model
      const mapped = rawPayments.map(p => ({
        id: p.paymentId && String(p.paymentId) !== '0' ? String(p.paymentId) : String(p.registrationId),
        paymentId: p.paymentId && String(p.paymentId) !== '0' ? String(p.paymentId) : null,
        registrationId: String(p.registrationId),
        name: p.fullName || 'Étudiant',
        email: p.email || '',
        phone: `${p.countryCode || ''} ${p.phoneNumber || ''}`.trim(),
        rawPhone: p.phoneNumber || '',
        city: p.city || 'N/A',
        occupation: p.profession || 'N/A',
        language: p.language || 'fr',
        courseName: p.courseName || 'Cours de Réussite Commerciale',
        status: p.status || 'Pending',
        statusUpdatedBy: p.updatedBy || '',
        statusUpdatedAt: p.updatedAt ? new Date(p.updatedAt) : null,
        createdAtDate: new Date(p.registeredAt || Date.now()),
        enrollmentId: p.enrollmentId || null,
        enrollmentStatus: p.enrollmentStatus || null
      }));

      mapped.sort((a, b) => Number(b.registrationId) - Number(a.registrationId));

      setRegistrations(mapped);
      localStorage.setItem('sprout_cached_payments', JSON.stringify(mapped));
      checkNewRegistrations(mapped);
    } catch (err) {
      console.warn('Erreur API, lecture du cache local:', err.message);
      const cached = localStorage.getItem('sprout_cached_payments');
      if (cached) {
        try {
          const parsed = JSON.parse(cached).map(item => ({
            ...item,
            createdAtDate: new Date(item.createdAtDate)
          }));
          setRegistrations(parsed);
        } catch (_) {}
      } else {
        setError('Impossible de joindre le serveur. Veuillez vérifier votre connexion.');
      }
    } finally {
      setLoading(false);
    }
  }, [language, filterStatus, filterDate, search]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

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

  const handleStatusChange = async (targetId, newStatus, studentName) => {
    const updatedBy = currentUser?.email || 'admin@sprout.app';
    setUpdatingId(targetId);
    setError(null);
    setSuccessMsg(null);

    // Optimistic UI update
    setRegistrations(prev =>
      prev.map(reg =>
        reg.id === targetId || reg.registrationId === targetId
          ? { ...reg, status: newStatus, statusUpdatedBy: updatedBy, statusUpdatedAt: new Date() }
          : reg
      )
    );

    try {
      const res = await fetch(`${API_BASE_URL}/staff/payments/${targetId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: newStatus,
          staffEmail: updatedBy
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Échec de la mise à jour sur le serveur.`);
      }

      const resData = await res.json();
      if (resData.success) {
        setSuccessMsg(`Statut pour ${studentName || 'Étudiant'} mis à jour à '${newStatus}'.`);
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err) {
      console.error('Erreur mise à jour PostgreSQL backend:', err);
      setError(`Échec de mise à jour du statut: ${err.message}`);
    } finally {
      setUpdatingId(null);
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
      if (language !== 'all' && reg.language !== language) return false;
      if (filterDate) {
        const dStr = reg.createdAtDate.toISOString().split('T')[0];
        if (dStr !== filterDate) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        return (
          reg.registrationId.includes(s) ||
          (reg.paymentId && reg.paymentId.includes(s)) ||
          (reg.name && reg.name.toLowerCase().includes(s)) ||
          (reg.email && reg.email.toLowerCase().includes(s)) ||
          (reg.phone && reg.phone.toLowerCase().includes(s)) ||
          (reg.city && reg.city.toLowerCase().includes(s))
        );
      }
      return true;
    });
  }, [registrations, search, filterStatus, filterDate, language]);

  const grouped = useMemo(() => {
    const groups = {};
    filteredRegistrations.forEach(reg => {
      const dateStr = reg.createdAtDate.toLocaleDateString(isEn ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(reg);
    });
    return groups;
  }, [filteredRegistrations, isEn]);

  const latestRegistrationId = registrations.length > 0 ? registrations[0].registrationId : null;
  const isEn = language === 'en';
  const t = (en, fr) => (isEn ? en : fr);

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: '#F8FAFC' }}>
      
      {/* Header */}
      <header className="bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center shadow-sm sticky-top">
        <div className="d-flex align-items-center gap-3">
          <img src={logo} alt="Sprout Logo" style={{ height: '45px', objectFit: 'contain' }} />
          <div className="d-none d-sm-block border-start ps-3 ms-2">
            <div className="d-flex align-items-center gap-2">
              <h1 className="h5 mb-0 fw-bold" style={{ color: '#0B192C' }}>
                {t('Payment Dashboard', 'Tableau de Bord des Paiements')}
              </h1>
              <span className="badge rounded-pill bg-primary" style={{ backgroundColor: '#00AEEF' }}>
                PostgreSQL Live
              </span>
            </div>
            <small className="text-muted" style={{ fontSize: '0.8rem' }}>
              {currentUser?.displayName || t('Payment Team', 'Équipe Paiement')} &bull; {currentUser?.email || 'admin@sprout.app'}
            </small>
          </div>
        </div>

        <div className="d-flex align-items-center gap-3">
          <LanguageFilter value={language} onChange={setLanguage} />
          <button 
            onClick={handleLogout} 
            className="btn btn-light border rounded-circle text-secondary shadow-sm hover-primary d-flex align-items-center justify-content-center" 
            style={{ width: '42px', height: '42px' }} 
            title={t('Logout', 'Déconnexion')}
          >
            <i className="fa-solid fa-right-from-bracket"></i>
          </button>
        </div>
      </header>

      <main className="flex-grow-1 p-4 container-fluid" style={{ maxWidth: '1440px', margin: '0 auto' }}>
        
        {/* Alerts */}
        {error && (
          <div className="alert alert-danger border-0 rounded-4 shadow-sm mb-4" role="alert">
            <i className="fa-solid fa-triangle-exclamation me-2"></i>{error}
          </div>
        )}
        {successMsg && (
          <div className="alert alert-success border-0 rounded-4 shadow-sm mb-4" role="alert">
            <i className="fa-solid fa-circle-check me-2"></i>{successMsg}
          </div>
        )}

        {/* Summary Cards */}
        <div className="row g-4 mb-4">
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '5px solid #0B192C' }}>
              <div className="card-body p-4 d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-uppercase mb-2 text-muted fw-bold small">{t('Total Registrations', 'Total Inscriptions')}</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#0B192C' }}>{totalCount}</h2>
                  <small className="text-muted">{t('PostgreSQL Database', 'Base PostgreSQL')}</small>
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
                  <h6 className="text-uppercase mb-2 text-muted fw-bold small">{t('Registered Today', 'Inscrits Aujourd’hui')}</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#00AEEF' }}>{todayCount}</h2>
                  <small className="text-muted">{t('Today', 'Aujourd’hui')}</small>
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
                  <h6 className="text-uppercase mb-2 text-muted fw-bold small">{t('Pending Payments', 'Paiements en Attente')}</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#F59E0B' }}>{pendingCount}</h2>
                  <small className="text-muted">{t('Pending', 'En cours')}</small>
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
                  <h6 className="text-uppercase mb-2 text-muted fw-bold small">{t('Paid Students', 'Étudiants Payés')}</h6>
                  <h2 className="mb-0 fw-bold" style={{ color: '#10B981' }}>{paidCount}</h2>
                  <small className="text-muted">{t('Access Unlocked', 'Accès débloqué')}</small>
                </div>
                <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(16,185,129,0.1)' }} className="rounded-circle d-flex justify-content-center align-items-center">
                  <i className="fa-solid fa-check-circle fs-4" style={{ color: '#10B981' }}></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-body p-3 p-md-4">
            <div className="row g-3 align-items-end">
              <div className="col-12 col-lg-5">
                <label className="form-label text-muted fw-bold small mb-1">
                  <i className="fa-solid fa-magnifying-glass me-2"></i>{t('Search Registration', 'Rechercher une Inscription')}
                </label>
                <input 
                  type="text" 
                  className="form-control border-0 bg-light w-100" 
                  placeholder={t('Search by ID, name, email, phone, city...', 'Recherche par ID, nom, email, téléphone, ville...')} 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="col-12 col-sm-6 col-lg-3">
                <label className="form-label text-muted fw-bold small mb-1">
                  <i className="fa-solid fa-filter me-2"></i>{t('Status', 'Statut')}
                </label>
                <select className="form-select border-0 bg-light w-100" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">{t('All Statuses', 'Tous les statuts')}</option>
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{t(opt, STATUS_FR[opt] || opt)}</option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-sm-6 col-lg-2">
                <label className="form-label text-muted fw-bold small mb-1">
                  <i className="fa-regular fa-calendar me-2"></i>{t('Date', 'Date')}
                </label>
                <input 
                  type="date" 
                  className="form-control border-0 bg-light w-100" 
                  value={filterDate} 
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setFilterDate(e.target.value)} 
                />
              </div>
              <div className="col-12 col-lg-2 d-flex gap-2 justify-content-lg-end">
                <button 
                  className="btn btn-light border transition-all flex-grow-1 flex-lg-grow-0" 
                  onClick={() => { setSearch(''); setFilterStatus(''); setFilterDate(''); setLanguage('all'); }} 
                  title={t('Reset', 'Réinitialiser')}
                >
                  <i className="fa-solid fa-rotate-left me-1"></i> {t('Reset', 'Réinit')}
                </button>
                <button 
                  className="btn text-white transition-all flex-grow-1 flex-lg-grow-0" 
                  onClick={fetchRegistrations} 
                  disabled={loading} 
                  style={{ backgroundColor: '#00AEEF' }} 
                  title={t('Refresh', 'Rafraîchir')}
                >
                  <i className="fa-solid fa-arrows-rotate me-1"></i> {t('Refresh', 'Actualiser')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* List of Registrations */}
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border" style={{ color: '#00AEEF' }} role="status"></div>
            <p className="mt-3 text-muted fw-semibold">{t('Fetching PostgreSQL registrations...', 'Récupération des inscriptions PostgreSQL...')}</p>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-5 bg-white shadow-sm rounded-4">
            <div className="mb-4">
              <i className="fa-regular fa-folder-open text-muted" style={{ fontSize: '4rem', opacity: 0.5 }}></i>
            </div>
            <h4 className="text-muted fw-bold mb-2">{t('No registrations found', 'Aucune inscription trouvée')}</h4>
            <p className="text-secondary">{t('Modify your search criteria or filters.', 'Modifiez vos critères de recherche ou filtres.')}</p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <div key={date} className="mb-5">
              <div className="d-flex align-items-center mb-3">
                <h5 className="mb-0 fw-bold" style={{ color: '#0B192C' }}>{date}</h5>
                <span className="badge bg-light text-muted border ms-3 rounded-pill">{items.length} {t('students', 'étudiants')}</span>
                <hr className="flex-grow-1 ms-3 text-muted opacity-25" />
              </div>
              <div className="row g-4">
                {items.map(reg => {
                  const isNewest = reg.registrationId === latestRegistrationId && !search && !filterStatus && !filterDate;
                  const statusColor = STATUS_COLORS[reg.status] || '#64748B';
                  const isUpdating = updatingId === reg.id || updatingId === reg.registrationId;

                  return (
                    <div key={reg.registrationId} className="col-12 col-xl-6">
                      <div className={`card border-0 rounded-4 shadow-sm h-100 transition-all ${isNewest ? 'border-primary border border-2' : ''}`} style={{ backgroundColor: isNewest ? '#F0F9FF' : '#fff' }}>
                        <div className="card-body p-4">
                          
                          <div className="d-flex flex-wrap flex-sm-nowrap justify-content-between align-items-start mb-3 gap-3">
                            <div className="d-flex align-items-start gap-3 flex-grow-1" style={{ minWidth: 0 }}>
                              <div className="rounded-circle d-flex justify-content-center align-items-center text-white fw-bold shadow-sm flex-shrink-0" style={{ width: '48px', height: '48px', backgroundColor: '#0B192C', fontSize: '1.2rem' }}>
                                {reg.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                                  <h5 className="mb-0 fw-bold text-truncate" style={{ color: '#0F172A' }}>
                                    {reg.name}
                                  </h5>
                                  <span className="badge bg-secondary rounded-pill font-monospace" style={{ fontSize: '0.75rem' }}>
                                    {t('Reg', 'Inscr')} #{reg.registrationId}
                                  </span>
                                  <span className={`badge rounded-pill ${reg.language === 'fr' ? 'bg-purple text-white' : 'bg-info text-dark'}`} style={reg.language === 'fr' ? { backgroundColor: '#7C3AED' } : {}}>
                                    {reg.language === 'fr' ? '🇫🇷 FR' : '🇬🇧 EN'}
                                  </span>
                                  {isNewest && <span className="badge rounded-pill bg-danger">{t('NEW', 'NOUVEAU')}</span>}
                                </div>
                                <div className="text-muted d-flex flex-column gap-1" style={{ fontSize: '0.88rem' }}>
                                  <span className="text-truncate" title={reg.email}>
                                    <i className="fa-solid fa-envelope me-2 text-secondary"></i>{reg.email || t('No email provided', 'Aucun email')}
                                  </span>
                                  <span className="text-truncate" title={reg.phone}>
                                    <i className="fa-solid fa-phone me-2 text-secondary"></i>{reg.phone}
                                  </span>
                                  <span className="text-truncate small text-muted">
                                    <i className="fa-solid fa-book-open me-2 text-secondary"></i>{reg.courseName}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="d-flex flex-row flex-sm-column align-items-center align-items-sm-end gap-2 flex-shrink-0 mt-2 mt-sm-0" style={{ minWidth: '150px' }}>
                              <span className="badge rounded-pill px-3 py-2 fw-semibold shadow-sm text-center w-100" style={{ backgroundColor: statusColor, color: '#fff', fontSize: '0.85rem' }}>
                                <i className="fa-solid fa-circle me-1" style={{ fontSize: '0.6rem' }}></i>{t(reg.status, STATUS_FR[reg.status] || reg.status)}
                              </span>
                              <div className="d-flex align-items-center gap-1 w-100">
                                <select 
                                  className="form-select form-select-sm border bg-light fw-semibold text-secondary w-100" 
                                  value={reg.status}
                                  disabled={isUpdating}
                                  onChange={(e) => handleStatusChange(reg.id || reg.registrationId, e.target.value, reg.name)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {STATUS_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{t(opt, STATUS_FR[opt] || opt)}</option>
                                  ))}
                                </select>
                                {isUpdating && <div className="spinner-border spinner-border-sm text-primary" role="status"></div>}
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-light rounded-4 p-3 d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center border gap-3">
                            <div className="d-flex flex-column gap-1 text-muted w-100" style={{ fontSize: '0.85rem' }}>
                              <span><i className="fa-solid fa-location-dot me-2 text-secondary"></i><strong>{reg.city}</strong></span>
                              <span><i className="fa-solid fa-briefcase me-2 text-secondary"></i>{reg.occupation}</span>
                            </div>
                            <div className="d-flex flex-column gap-1 text-muted text-start text-sm-end w-100 border-top border-sm-0 pt-2 pt-sm-0 mt-2 mt-sm-0" style={{ fontSize: '0.85rem' }}>
                              <span>
                                <i className="fa-regular fa-clock me-2 text-secondary"></i>
                                {reg.createdAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {reg.paymentId && (
                                <span className="small text-muted">
                                  <i className="fa-solid fa-receipt me-1"></i> {t('Payment', 'Paiement')} #{reg.paymentId}
                                </span>
                              )}
                              {reg.enrollmentStatus && (
                                <span className="small text-success fw-semibold">
                                  <i className="fa-solid fa-graduation-cap me-1"></i> {t('Enrolled', 'Inscrit')} ({reg.enrollmentStatus === 'Active' || reg.enrollmentStatus === 'active' ? t('Active', 'Actif') : reg.enrollmentStatus})
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
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-bell me-2 fs-5"></i>Nouvelle inscription reçue</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={handleAcknowledgeNew}></button>
                </div>
                <div className="modal-body p-4">
                  <p className="text-secondary mb-4">Nouvelles inscriptions en base de données nécessitant votre attention :</p>
                  {newRegistrationsAlert.slice(0, 3).map(r => (
                    <div key={r.registrationId} className="p-3 bg-light border rounded-4 mb-3 d-flex justify-content-between align-items-center">
                      <div>
                        <strong className="d-block mb-1" style={{ color: '#0B192C' }}>{r.name} (Inscr #{r.registrationId})</strong>
                        <span className="small text-muted"><i className="fa-solid fa-location-dot me-1"></i>{r.city} &bull; {r.occupation}</span>
                      </div>
                      <span className="badge bg-primary rounded-pill">Nouveau</span>
                    </div>
                  ))}
                  {newRegistrationsAlert.length > 3 && (
                    <p className="text-muted small text-center mt-2 fw-semibold">...et {newRegistrationsAlert.length - 3} de plus.</p>
                  )}
                </div>
                <div className="modal-footer border-0 bg-light p-3">
                  <button type="button" className="btn btn-light border rounded-pill px-4 fw-semibold text-secondary" onClick={handleAcknowledgeNew}>Fermer</button>
                  <button type="button" className="btn text-white rounded-pill px-4 fw-semibold" style={{ backgroundColor: '#00AEEF' }} onClick={handleAcknowledgeNew}>Voir détails</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
