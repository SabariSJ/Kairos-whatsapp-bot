import axiosInstance from './axiosInstance';

export const reportApi = {
  getSummary: async (params = {}) => {
    const response = await axiosInstance.get('/staff/reports/summary', { params });
    return response.data;
  },
  getRecords: async (params = {}) => {
    const response = await axiosInstance.get('/staff/reports/records', { params });
    return response.data;
  },
};
