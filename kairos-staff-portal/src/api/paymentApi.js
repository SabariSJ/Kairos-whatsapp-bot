import axiosInstance from './axiosInstance';

export const paymentApi = {
  getPayments: async (params = {}) => {
    const response = await axiosInstance.get('/staff/payments', { params });
    return response.data;
  },
  updatePaymentStatus: async (paymentId, status) => {
    const response = await axiosInstance.patch(`/staff/payments/${paymentId}/status`, { status });
    return response.data;
  },
  sendWhatsAppConfirmation: async (paymentId) => {
    // Isolated notification call
    const response = await axiosInstance.post(`/staff/payments/${paymentId}/send-whatsapp`);
    return response.data;
  },
  retryNotification: async (paymentId) => {
    const response = await axiosInstance.post(`/staff/payments/${paymentId}/retry-notification`);
    return response.data;
  },
};
