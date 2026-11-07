import axios, { type AxiosInstance } from 'axios';
import { auth } from '@/lib/firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

class UserApiService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const user = auth.currentUser;
        if (user && config.headers) {
          try {
            const token = await user.getIdToken();
            if (token) {
              config.headers.Authorization = `Bearer ${token}`;
            }
          } catch (error) {
            console.error('Error getting auth token:', error);
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  async getUserProfile(): Promise<any> {
    const response = await this.axiosInstance.get('/users/profile');
    return response.data;
  }

  async updateUserProfile(data: Partial<{
    name: string;
    usn: string;
    mobile_number: string;
    current_year: number;
    department: string;
  }>): Promise<void> {
    await this.axiosInstance.post('/users/profile', data);
  }
}

export const userApi = new UserApiService();

