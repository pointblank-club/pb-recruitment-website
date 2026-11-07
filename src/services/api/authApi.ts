import axios, { type AxiosInstance } from 'axios';
import { getDepartmentFromBranch } from '@/constants';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export interface SignupPayload {
  name: string;
  id: string;
  email: string;
  mobile: string;
  joiningYear: number;
  branch: string;
  password: string;
}

class AuthApiService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async signup(data: SignupPayload): Promise<void> {
    const payload = {
      name: data.name,
      usn: data.id,
      email: data.email,
      mobile_number: data.mobile,
      current_year: data.joiningYear,
      department: getDepartmentFromBranch(data.branch),
      password: data.password,
    };

    await this.axiosInstance.post('/auth/signup', payload);
  }
}

export const authApi = new AuthApiService();

