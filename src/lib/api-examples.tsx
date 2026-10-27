/**
 * API 클라이언트 사용 예시
 */

import { ApiClient, ApiError, useApi } from './api-client';

const apiClient = new ApiClient();

// 1. 기본 사용법 - 컴포넌트에서 직접 호출
export async function fetchDocuments() {
  try {
    // GET /api/external/documents → http://api:9030/v1/documents
    const documents = await apiClient.get('/documents');
    return documents;
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    throw error;
  }
}

// 2. POST 요청 예시
export async function createDocument(data: { title: string; content: string }) {
  // POST /api/external/documents → http://api:9030/v1/documents
  return await apiClient.post('/documents', data);
}

// 3. React 컴포넌트에서 Hook 사용
import { useState } from 'react';

export function DocumentList() {
  const [searchTerm, setSearchTerm] = useState('');

  // Hook을 사용한 API 호출
  const { data, loading, error, execute } = useApi(
    () => apiClient.get(`/documents?search=${searchTerm}`),
    {
      onSuccess: (data) => console.log('Documents loaded:', data),
      onError: (error) => console.error('Failed to load documents:', error),
    },
  );

  return (
    <div>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search documents..."
      />
      <button onClick={execute} disabled={loading}>
        {loading ? 'Loading...' : 'Search'}
      </button>

      {error && <div className="error">Error: {error.message}</div>}

      {data && (
        <ul>
          {data.map((doc: any) => (
            <li key={doc.id}>{doc.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 4. 인증이 필요한 요청
export async function fetchProtectedData() {
  const token = localStorage.getItem('authToken');

  return await apiClient.get('/protected/data', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

// 5. 파일 업로드 예시
export async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  // FormData를 보낼 때는 Content-Type을 설정하지 않음 (브라우저가 자동으로 설정)
  const response = await fetch('/api/external/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Upload failed');
  }

  return await response.json();
}

// 6. SSE (Server-Sent Events) 예시
export function subscribeToEvents() {
  const eventSource = new EventSource('/api/external/events');

  eventSource.onmessage = (event) => {
    console.log('Received event:', event.data);
  };

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    eventSource.close();
  };

  return eventSource;
}

// 7. 취소 가능한 요청
export async function fetchWithCancel() {
  const controller = new AbortController();

  // 5초 후 자동 취소
  setTimeout(() => controller.abort(), 5000);

  try {
    const data = await apiClient.get('/slow-endpoint', {
      signal: controller.signal,
    });
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.name === 'AbortError') {
      console.log('Request was cancelled');
    }
    throw error;
  }
}
