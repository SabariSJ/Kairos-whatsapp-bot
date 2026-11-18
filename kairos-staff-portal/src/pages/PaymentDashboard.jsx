import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { paymentApi } from '../api/paymentApi';
import LanguageFilter from '../components/LanguageFilter';
import logo from '../assets/logo.png';

const STATUS_COLORS = {
  Pending: '#F59E0B',
  Contacted: '#0EA5E9',
  Confirmed: '#0D6EFD',
  Paid: '#10B981',
  Cancelled: '#EF4444',
};

const STATUS_OPTIONS = ['Pending', 'Contacted', 'Confirmed', 'Paid', 'Cancelled'];

export default function PaymentDashboard() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filters
  const [language, setLanguage] = useState('all');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Status Update Confirmation Modal
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null); // { id, newStatus, studentName }
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // WhatsApp Confirmation Modal (Part F)
  const [whatsappModal, setWhatsappModal] = useState(null); // { paymentId, studentName, phone }
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [whatsappResponse, setWhatsappResponse] = useState(null);
  const [retryingId, setRetryingId] = useState(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await paymentApi.getPayments({
        language,
        status: filterStatus || undefined,
        search: search || undefined,
        date: filterDate || undefined,
      });
      if (data.success) {
        setPayments(data.payments || []);
      }
    } catch (err) {
      console.error('Failed to fetch payments:', err);
      setError(err.response?.data?.error || 'Failed to load payments from backend.');
    } finally {
      setLoading(false);
    }
  }, [language, filterStatus, search, filterDate]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Status Change Workflow with Confirmation
  const promptStatusChange = (paymentId, regId, studentName, newStatus) => {
    // If paymentId is 0 or unassigned, pass registrationId
    const targetId = paymentId && paymentId !== 0 ? paymentId : regId;
    setPendingStatusUpdate({
      id: targetId,
      newStatus,
      studentName,
    });
  };

  const confirmStatusChange = async () => {
    if (!pendingStatusUpdate) return;
    setIsUpdatingStatus(true);
    setError(null);
    try {
      const res = await paymentApi.updatePaymentStatus(
        pendingStatusUpdate.id,
        pendingStatusUpdate.newStatus
      );
      if (res.success) {
        let msg = `Status for ${pendingStatusUpdate.studentName} updated to '${pendingStatusUpdate.newStatus}'.`;
        if (pendingStatusUpdate.newStatus === 'Paid') {
          if (res.notification?.triggered) {
            msg += ` Automatic WhatsApp confirmation sent (${res.notification.status}).`;
          } else if (res.notification?.duplicate) {
            msg += ` (Enrolment is active; duplicate notification prevented).`;
          } else if (res.notification?.status === 'Failed') {
            msg += ` Note: WhatsApp notification failed (${res.notification.error || 'Check details'}). Retry is available.`;
          }
        }
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 5000);
        await fetchPayments();
      }
    } catch (err) {
      console.error('Status update failed:', err);
      setError(err.response?.data?.error || 'Failed to update payment status.');
    } finally {
      setIsUpdatingStatus(false);
      setPendingStatusUpdate(null);
    }
  };

  // Controlled Retry for Failed WhatsApp Notifications (Phase 6)
  const handleRetryNotification = async (paymentId, studentName) => {
    setRetryingId(paymentId);
    setError(null);
    try {
      const res = await paymentApi.retryNotification(paymentId);
      if (res.success) {
        setSuccessMsg(`WhatsApp notification retry initiated for ${studentName}. Status: ${res.result?.status || 'Sent'}`);
        setTimeout(() => setSuccessMsg(null), 4000);
        await fetchPayments();
      }
    } catch (err) {
      console.error('Notification retry failed:', err);
      setError(err.response?.data?.error || 'Failed to retry notification.');
    } finally {
      setRetryingId(null);
    }
  };

  // WhatsApp Confirmation Handler (Part F)
  const triggerSendWhatsApp = async () => {
    if (!whatsappModal) return;
    setIsSendingWhatsApp(true);
    setWhatsappResponse(null);
    try {
      const res = await paymentApi.sendWhatsAppConfirmation(whatsappModal.paymentId);
      setWhatsappResponse({
        success: true,
        message: res.message || 'WhatsApp message successfully triggered.',
      });
    } catch (err) {
      const errorMsg =
        err.response?.data?.error ||
        err.response?.status === 404
          ? 'Notification endpoint not yet active on backend. Ready for Phase 5 integration.'
          : 'Failed to send WhatsApp message.';
      setWhatsappResponse({
        success: false,
        message: errorMsg,
      });
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // Summary Metrics
  const totalCount = payments.length;
  const pendingCount = payments.filter((p) => p.status === 'Pending').length;
  const contactedCount = payments.filter((p) => p.status === 'Contacted').length;
  const confirmedCount = payments.filter((p) => p.status === 'Confirmed').length;
  const paidCount = payments.filter((p) => p.status === 'Paid').length;
  const cancelledCount = payments.filter((p) => p.status === 'Cancelled').length;

  return (
    <div className="d-flex flex-column min-vh-100" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Top Navbar */}
      <header className="bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center shadow-sm sticky-top">
        <div className="d-flex align-items-center gap-3">
          <img src={logo} alt="Sprout Logo" style={{ height: '42px', objectFit: 'contain' }} />
          <div className="border-start ps-3 ms-2">
            <div className="d-flex align-items-center gap-2">
              <h1 className="h5 mb-0 fw-bold" style={{ color: '#0B192C' }}>
                Payment Dashboard
              </h1>
              <span className="badge rounded-pill bg-primary" style={{ backgroundColor: '#00AEEF' }}>
                Staff
              </span>
            </div>
            <small className="text-muted" style={{ fontSize: '0.8rem' }}>
              {currentUser?.displayName || 'Payment Team'} &bull; {currentUser?.email}
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
        {/* Alerts */}
        {error && (
          <div className="alert alert-danger border-0 rounded-4 shadow-sm alert-dismissible fade show" role="alert">
            <i className="fa-solid fa-triangle-exclamation me-2"></i> {error}
            <button type="button" className="btn-close" onClick={() => setError(null)}></button>
          </div>
        )}
        {successMsg && (
          <div className="alert alert-success border-0 rounded-4 shadow-sm alert-dismissible fade show" role="alert">
            <i className="fa-solid fa-circle-check me-2"></i> {successMsg}
            <button type="button" className="btn-close" onClick={() => setSuccessMsg(null)}></button>
          </div>
        )}

        {/* Summary Metric Cards */}
        <div className="row g-3 mb-4">
          <div className="col-6 col-md-4 col-xl-2">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '4px solid #0B192C' }}>
              <div className="card-body p-3">
                <div className="text-uppercase text-muted fw-bold small">Total</div>
                <h3 className="mb-0 fw-bold" style={{ color: '#0B192C' }}>{totalCount}</h3>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4 col-xl-2">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '4px solid #F59E0B' }}>
              <div className="card-body p-3">
                <div className="text-uppercase text-muted fw-bold small">Pending</div>
                <h3 className="mb-0 fw-bold text-warning">{pendingCount}</h3>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4 col-xl-2">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '4px solid #0EA5E9' }}>
              <div className="card-body p-3">
                <div className="text-uppercase text-muted fw-bold small">Contacted</div>
                <h3 className="mb-0 fw-bold" style={{ color: '#0EA5E9' }}>{contactedCount}</h3>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4 col-xl-2">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '4px solid #0D6EFD' }}>
              <div className="card-body p-3">
                <div className="text-uppercase text-muted fw-bold small">Confirmed</div>
                <h3 className="mb-0 fw-bold text-primary">{confirmedCount}</h3>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4 col-xl-2">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '4px solid #10B981' }}>
              <div className="card-body p-3">
                <div className="text-uppercase text-muted fw-bold small">Paid</div>
                <h3 className="mb-0 fw-bold text-success">{paidCount}</h3>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4 col-xl-2">
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ borderLeft: '4px solid #EF4444' }}>
              <div className="card-body p-3">
                <div className="text-uppercase text-muted fw-bold small">Cancelled</div>
                <h3 className="mb-0 fw-bold text-danger">{cancelledCount}</h3>
              </div>
            </div>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-body p-3 p-md-4">
            <div className="row g-3 align-items-end">
              <div className="col-12 col-md-5">
                <label className="form-label text-muted fw-bold small mb-1">
                  <i className="fa-solid fa-magnifying-glass me-1"></i> Search
                </label>
                <input
                  type="text"
                  className="form-control border-0 bg-light"
                  placeholder="Search name, phone, email, city..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label text-muted fw-bold small mb-1">
                  <i className="fa-solid fa-filter me-1"></i> Status
                </label>
                <select
                  className="form-select border-0 bg-light"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-md-2">
                <label className="form-label text-muted fw-bold small mb-1">
                  <i className="fa-regular fa-calendar me-1"></i> Date
                </label>
                <input
                  type="date"
                  className="form-control border-0 bg-light"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
              </div>
              <div className="col-12 col-md-2 d-flex gap-2">
                <button
                  className="btn btn-light border flex-grow-1"
                  onClick={() => {
                    setSearch('');
                    setFilterStatus('');
                    setFilterDate('');
                    setLanguage('all');
                  }}
                  title="Reset Filters"
                >
                  <i className="fa-solid fa-rotate-left"></i>
                </button>
                <button
                  className="btn text-white flex-grow-1"
                  style={{ backgroundColor: '#00AEEF' }}
                  onClick={fetchPayments}
                  disabled={loading}
                  title="Refresh Data"
                >
                  <i className="fa-solid fa-arrows-rotate"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Registration Table / Cards */}
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status"></div>
            <p className="mt-3 text-muted fw-semibold">Loading student payment records...</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white">
            <i className="fa-regular fa-folder-open text-muted fa-3x mb-3 opacity-50"></i>
            <h5 className="fw-bold text-muted">No Records Found</h5>
            <p className="text-muted small">Try modifying search query or active language filter.</p>
          </div>
        ) : (
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th className="ps-4">Student</th>
                    <th>Contact</th>
                    <th>City & Profession</th>
                    <th>Language</th>
                    <th>Course</th>
                    <th>Payment</th>
                    <th>Enrolment</th>
                    <th>WhatsApp Notification</th>
                    <th className="text-end pe-4">Actions</th>
                  </tr>
                </thead>
                <tbody style={{ fontSize: '0.9rem' }}>
                  {payments.map((p) => {
                    const statusColor = STATUS_COLORS[p.status] || '#64748B';
                    const isFr = p.language === 'fr';
                    const isPaid = p.status === 'Paid';
                    const isEnrolled = p.enrollmentStatus === 'Active';
                    const nStatus = p.notificationStatus || (isPaid ? 'Pending' : 'Not Triggered');

                    return (
                      <tr key={p.registrationId}>
                        <td className="ps-4 py-3">
                          <div className="d-flex align-items-center gap-3">
                            <div
                              className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold shadow-sm flex-shrink-0"
                              style={{ width: '40px', height: '40px', backgroundColor: '#0B192C' }}
                            >
                              {p.fullName ? p.fullName.charAt(0).toUpperCase() : 'S'}
                            </div>
                            <div>
                              <div className="fw-bold text-dark">{p.fullName}</div>
                              <small className="text-muted">ID: #{p.registrationId}</small>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div><i className="fa-solid fa-phone me-1 text-muted small"></i> {p.countryCode} {p.phoneNumber}</div>
                          <small className="text-muted"><i className="fa-solid fa-envelope me-1 text-muted small"></i> {p.email}</small>
                        </td>

                        <td>
                          <div><strong>{p.city}</strong></div>
                          <small className="text-muted">{p.profession}</small>
                        </td>

                        <td>
                          <span
                            className={`badge rounded-pill px-2 py-1 ${
                              isFr ? 'bg-purple text-white' : 'bg-info text-dark'
                            }`}
                            style={isFr ? { backgroundColor: '#7C3AED' } : { backgroundColor: '#BAE6FD' }}
                          >
                            {isFr ? '🇫🇷 FR' : '🇬🇧 EN'}
                          </span>
                        </td>

                        <td>
                          <span className="small fw-semibold text-secondary">
                            {p.courseName}
                          </span>
                        </td>

                        <td>
                          <div className="d-flex flex-column gap-1" style={{ width: '130px' }}>
                            <span
                              className="badge rounded-pill text-white"
                              style={{ backgroundColor: statusColor }}
                            >
                              {p.status}
                            </span>
                            <select
                              className="form-select form-select-sm border-0 bg-light fw-semibold text-secondary"
                              value={p.status}
                              onChange={(e) =>
                                promptStatusChange(p.paymentId, p.registrationId, p.fullName, e.target.value)
                              }
                              style={{ fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`badge rounded-pill px-2 py-1 ${
                              isEnrolled ? 'bg-success text-white' : 'bg-secondary text-white'
                            }`}
                            style={isEnrolled ? { backgroundColor: '#10B981' } : { backgroundColor: '#94A3B8' }}
                          >
                            <i className={`fa-solid ${isEnrolled ? 'fa-check' : 'fa-clock'} me-1`}></i>
                            {p.enrollmentStatus || (isPaid ? 'Active' : 'Pending')}
                          </span>
                        </td>

                        <td>
                          {(() => {
                            if (nStatus === 'Delivered') {
                              return <span className="badge bg-success rounded-pill px-2 py-1 shadow-sm"><i className="fa-solid fa-check-double me-1"></i> Delivered</span>;
                            }
                            if (nStatus === 'Read') {
                              return <span className="badge bg-primary rounded-pill px-2 py-1 shadow-sm"><i className="fa-solid fa-eye me-1"></i> Read</span>;
                            }
                            if (nStatus === 'Sent') {
                              return <span className="badge rounded-pill px-2 py-1 shadow-sm text-dark" style={{ backgroundColor: '#BAE6FD' }}><i className="fa-solid fa-paper-plane me-1"></i> Sent</span>;
                            }
                            if (nStatus === 'Processing') {
                              return <span className="badge bg-warning rounded-pill px-2 py-1 shadow-sm text-dark"><i className="fa-solid fa-spinner fa-spin me-1"></i> Processing</span>;
                            }
                            if (nStatus === 'Failed') {
                              return (
                                <span className="badge bg-danger rounded-pill px-2 py-1 shadow-sm" title={p.notificationError || 'Notification failed'}>
                                  <i className="fa-solid fa-triangle-exclamation me-1"></i> Failed
                                </span>
                              );
                            }
                            if (nStatus === 'Pending') {
                              return <span className="badge bg-secondary rounded-pill px-2 py-1"><i className="fa-solid fa-clock me-1"></i> Pending</span>;
                            }
                            return <span className="badge bg-light text-muted border rounded-pill px-2 py-1">Not Triggered</span>;
                          })()}
                        </td>

                        <td className="text-end pe-4">
                          {nStatus === 'Failed' && isPaid ? (
                            <button
                              className="btn btn-sm btn-outline-danger rounded-pill px-3 shadow-sm"
                              onClick={() => handleRetryNotification(p.paymentId || p.registrationId, p.fullName)}
                              disabled={retryingId === (p.paymentId || p.registrationId)}
                              title={p.notificationError || 'Retry sending WhatsApp confirmation'}
                            >
                              {retryingId === (p.paymentId || p.registrationId) ? (
                                <><span className="spinner-border spinner-border-sm me-1"></span> Retrying...</>
                              ) : (
                                <><i className="fa-solid fa-rotate-right me-1"></i> Retry WhatsApp</>
                              )}
                            </button>
                          ) : isPaid ? (
                            <span className="text-success small fw-semibold">
                              <i className="fa-solid fa-circle-check me-1"></i> Enrolled
                            </span>
                          ) : (
                            <span className="text-muted small">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Dialog: Status Change */}
      {pendingStatusUpdate && (
        <>
          <div className="modal-backdrop fade show" style={{ opacity: 0.5 }}></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
                <div className="modal-header bg-light border-0">
                  <h5 className="modal-title fw-bold">Confirm Status Update</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setPendingStatusUpdate(null)}
                    disabled={isUpdatingStatus}
                  ></button>
                </div>
                <div className="modal-body p-4">
                  <p className="mb-2">
                    Are you sure you want to change the status for <strong>{pendingStatusUpdate.studentName}</strong> to:
                  </p>
                  <div className="p-3 bg-light rounded-3 text-center my-3">
                    <span
                      className="badge rounded-pill px-3 py-2 fs-6 text-white"
                      style={{ backgroundColor: STATUS_COLORS[pendingStatusUpdate.newStatus] }}
                    >
                      {pendingStatusUpdate.newStatus}
                    </span>
                  </div>
                  {pendingStatusUpdate.newStatus === 'Paid' && (
                    <div className="alert alert-info border-0 rounded-3 small mb-0">
                      <i className="fa-solid fa-circle-info me-1"></i> Changing to <strong>Paid</strong> will automatically activate the course enrollment in PostgreSQL.
                    </div>
                  )}
                </div>
                <div className="modal-footer bg-light border-0">
                  <button
                    type="button"
                    className="btn btn-light rounded-pill px-4"
                    onClick={() => setPendingStatusUpdate(null)}
                    disabled={isUpdatingStatus}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary rounded-pill px-4"
                    style={{ backgroundColor: '#00AEEF', borderColor: '#00AEEF' }}
                    onClick={confirmStatusChange}
                    disabled={isUpdatingStatus}
                  >
                    {isUpdatingStatus ? 'Updating...' : 'Confirm Update'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Manual WhatsApp Confirmation Modal (Part F) */}
      {whatsappModal && (
        <>
          <div className="modal-backdrop fade show" style={{ opacity: 0.5 }}></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
                <div className="modal-header text-white border-0" style={{ backgroundColor: '#10B981' }}>
                  <h5 className="modal-title fw-bold">
                    <i className="fa-brands fa-whatsapp me-2"></i> Send WhatsApp Confirmation
                  </h5>
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    onClick={() => setWhatsappModal(null)}
                    disabled={isSendingWhatsApp}
                  ></button>
                </div>
                <div className="modal-body p-4">
                  <p className="mb-3">
                    You are about to dispatch a WhatsApp enrollment confirmation to:
                  </p>
                  <div className="p-3 bg-light rounded-3 mb-3">
                    <div className="fw-bold">{whatsappModal.studentName}</div>
                    <div className="text-muted small">{whatsappModal.phone}</div>
                  </div>

                  {whatsappResponse && (
                    <div
                      className={`alert ${
                        whatsappResponse.success ? 'alert-success' : 'alert-warning'
                      } border-0 rounded-3 small`}
                    >
                      {whatsappResponse.message}
                    </div>
                  )}

                  <p className="text-muted small mb-0">
                    <i className="fa-solid fa-shield-halved me-1"></i> This manual action issues the single-use DRM classroom access token to the student's WhatsApp number.
                  </p>
                </div>
                <div className="modal-footer bg-light border-0">
                  <button
                    type="button"
                    className="btn btn-light rounded-pill px-4"
                    onClick={() => setWhatsappModal(null)}
                    disabled={isSendingWhatsApp}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn btn-success rounded-pill px-4 shadow-sm"
                    onClick={triggerSendWhatsApp}
                    disabled={isSendingWhatsApp}
                  >
                    {isSendingWhatsApp ? (
                      <span>Sending...</span>
                    ) : (
                      <span><i className="fa-solid fa-paper-plane me-1"></i> Send Now</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
