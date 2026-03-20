import axios from 'axios';

const AUTH_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/auth` : '/auth';
const authHttp = axios.create({ baseURL: AUTH_BASE });

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
    mustChangePassword: boolean;
  };
}

export const authApi = {
  login: (email: string, password: string) =>
    authHttp.post<LoginResponse>('/login', { email, password }).then(r => r.data),

  changePassword: (email: string, currentPassword: string, newPassword: string) =>
    authHttp.post('/change-password', { email, currentPassword, newPassword }).then(r => r.data),

  forgotPassword: (email: string) =>
    authHttp.post('/forgot-password', { email }).then(r => r.data),

  resetPassword: (token: string, newPassword: string) =>
    authHttp.post('/reset-password', { token, newPassword }).then(r => r.data),
};
