/**
 * BillingApi Service
 * Handles network requests between the Expo mobile client and the Flask backend.
 * Provides timeout safety via AbortController, structured error decoding,
 * and graceful fallback handling for network connection exceptions.
 */

export const API_BASE_URL = 'http://192.168.18.62:5001/api';
const REQUEST_TIMEOUT_MS = 25000; // 25-second timeout to prevent indefinite hangs

export interface SearchItem {
  code: string;
  description: string;
  type?: string;
}

export interface AnalyzedCodeItem {
  code: string;
  justification: string;
  notes?: string;
  confidence?: 'high' | 'moderate' | 'low';
  verified_in_db?: boolean;
}

export interface ScenarioAnalysisResponse {
  icd_codes: AnalyzedCodeItem[];
  cpt_codes: AnalyzedCodeItem[];
  hcpcs_codes: AnalyzedCodeItem[];
  modifiers: AnalyzedCodeItem[];
}

export class ApiNetworkError extends Error {
  public status?: number;
  public details?: string;
  public isTimeout?: boolean;
  public isConnectionRefusal?: boolean;

  constructor(message: string, options?: { status?: number; details?: string; isTimeout?: boolean; isConnectionRefusal?: boolean }) {
    super(message);
    this.name = 'ApiNetworkError';
    this.status = options?.status;
    this.details = options?.details;
    this.isTimeout = options?.isTimeout;
    this.isConnectionRefusal = options?.isConnectionRefusal;
  }
}

/**
 * Executes a resilient fetch with automatic AbortController timeout
 * and detailed error extraction.
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    return response;
  } catch (error: any) {
    const message = error?.message || 'Network connection failed';
    const isTimeout =
      error?.name === 'AbortError' ||
      message.toLowerCase().includes('timeout');

    if (isTimeout) {
      throw new ApiNetworkError(
        `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. The backend server at ${API_BASE_URL} took too long to respond.`,
        { isTimeout: true, details: message }
      );
    }

    const isRefused =
      message.includes('ConnectException') ||
      message.includes('Failed to connect') ||
      message.includes('Network request failed') ||
      message.toLowerCase().includes('canceled') ||
      message.toLowerCase().includes('cancelled') ||
      message.toLowerCase().includes('fetch failed');

    throw new ApiNetworkError(
      isRefused
        ? `Unable to connect to Flask server at ${API_BASE_URL}.\n\nEnsure:\n1. Flask backend is running ('python backend/app.py')\n2. Mobile phone and laptop are on the same Wi-Fi\n3. Mobile Data (4G/LTE) is turned OFF on your phone`
        : message,
      { isConnectionRefusal: isRefused, details: message }
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parses and handles non-200 HTTP responses safely, extracting JSON details if available.
 */
async function handleResponseJson<T>(response: Response): Promise<T> {
  let responseData: any = null;
  const rawText = await response.text();

  try {
    responseData = rawText ? JSON.parse(rawText) : null;
  } catch {
    // Response was not JSON (e.g., HTML 502/500 from proxy or plain error)
  }

  if (!response.ok) {
    const serverMessage =
      responseData?.details ||
      responseData?.error ||
      rawText ||
      `HTTP Error ${response.status} (${response.statusText})`;

    throw new ApiNetworkError(serverMessage, {
      status: response.status,
      details: responseData?.details,
    });
  }

  return responseData as T;
}

/**
 * Searches the SQLite database for ICD-10, CPT, HCPCS, or Modifier codes.
 */
export async function searchDatabase(
  query: string,
  type: 'icd' | 'cpt' | 'hcpcs' | 'modifier' | 'all' = 'all'
): Promise<SearchItem[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const endpoint = `${API_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&type=${encodeURIComponent(type)}`;
  const response = await fetchWithTimeout(endpoint, { method: 'GET' });
  const result = await handleResponseJson<{ status: string; data: SearchItem[] }>(response);
  return Array.isArray(result?.data) ? result.data : [];
}

/**
 * Submits a clinical narrative to the AI engine for scenario coding analysis.
 */
export async function analyzeScenario(narrative: string): Promise<ScenarioAnalysisResponse> {
  const trimmed = narrative.trim();
  if (!trimmed) {
    throw new ApiNetworkError('Clinical narrative cannot be blank.');
  }

  const endpoint = `${API_BASE_URL}/analyze-scenario`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    body: JSON.stringify({ narrative: trimmed }),
  });

  const parsed = await handleResponseJson<ScenarioAnalysisResponse>(response);

  // Guarantee clean arrays to prevent undefined mapping exceptions in the UI
  return {
    icd_codes: Array.isArray(parsed?.icd_codes) ? parsed.icd_codes : [],
    cpt_codes: Array.isArray(parsed?.cpt_codes) ? parsed.cpt_codes : [],
    hcpcs_codes: Array.isArray(parsed?.hcpcs_codes) ? parsed.hcpcs_codes : [],
    modifiers: Array.isArray(parsed?.modifiers) ? parsed.modifiers : [],
  };
}

/**
 * Verifies if the backend server is reachable over Wi-Fi.
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
