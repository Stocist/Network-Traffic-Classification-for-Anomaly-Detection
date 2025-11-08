import axios from "axios";

export const http = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000",
  timeout: 12000,
});

http.interceptors.response.use(
  (r) => r,
  (err) => Promise.reject(err?.response?.data ?? err)
);

