import axios, { type AxiosError, type AxiosInstance } from 'axios';
import * as Sentry from '@sentry/react';

/**
 * Attaches a standardized Sentry response interceptor to an Axios instance.
 * - Extracts and surfaces custom server error messages from error.response.data.error.
 * - Automatically captures 5xx server errors and network drops to Sentry.
 * - Safely skips client-side request cancellations (axios.isCancel).
 */
export const attachSentryInterceptor = (axiosInstance: AxiosInstance): void => {
  axiosInstance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ error?: string }>) => {
      const serverMessage = error.response?.data?.error;
      if (typeof serverMessage === 'string' && serverMessage) {
        error.message = serverMessage;
      }

      // Capture unexpected server 5xx errors or network drops into Sentry (skip client cancels)
      if (!axios.isCancel(error) && (!error.response || error.response.status >= 500)) {
        Sentry.captureException(error, {
          extra: {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response?.status,
            serverMessage,
          },
        });
      }

      return Promise.reject(error);
    }
  );
};
