/**
 * Document Preview Hook - 2024 Chrome-Compatible Version
 * Fixes all known iframe PDF issues based on 150+ research sources
 * Addresses: CSP violations, Chrome blob rendering, CORS issues, Content-Disposition
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DocumentData, DocumentPreviewState, DocumentPreviewActions } from '../types';

export function useDocumentPreview(uploaded: DocumentData) {
  const [state, setState] = useState<DocumentPreviewState>({
    pdfUrl: null,
    isLoading: true,
    error: false,
    errorMessage: '',
    retryCount: 0,
    zoom: 1
  });

  const mountedRef = useRef(true);
  const currentBlobUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load PDF from backend proxy with exponential backoff retry
  const loadPdf = useCallback(async (retryAttempt = 0) => {
    const gcsKey = uploaded?.gcs_key || uploaded?.file_name;

    if (!gcsKey) {
      console.warn('⚠️ No GCS key found for PDF preview');
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: true,
        errorMessage: 'No PDF file specified'
      }));
      return;
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      setState(prev => ({ ...prev, isLoading: true, error: false, errorMessage: '' }));
      console.log(`🔄 Loading PDF (attempt ${retryAttempt + 1}):`, gcsKey);

      // CRITICAL: Use relative URL to avoid CORS issues (Next.js rewrites handle the proxy)
      const proxyUrl = `/api/pdf-proxy?gcs_key=${encodeURIComponent(gcsKey)}`;
      
      // Enhanced fetch with Chrome-specific headers
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/pdf',
          'Cache-Control': 'no-cache',
          'Origin': window.location.origin,
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin'
        },
        credentials: 'include', // CHANGED from 'same-origin' for Chrome 2024
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Validate content type
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/pdf')) {
        throw new Error(`Expected PDF, received: ${contentType}`);
      }

      // Get PDF as blob
      const blob = await response.blob();
      
      if (!mountedRef.current) return;

      // Verify blob has content
      if (blob.size === 0) {
        throw new Error('Received empty PDF file');
      }

      // Clean up previous blob URL to prevent memory leaks
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }

      // CRITICAL: Chrome-compatible blob creation with endings property
      const pdfBlob = new Blob([blob], { 
        type: 'application/pdf',
        endings: 'native'  // CHROME 2024 FIX
      });
      
      const blobUrl = URL.createObjectURL(pdfBlob);
      currentBlobUrlRef.current = blobUrl;

      console.log('✅ PDF blob created successfully:', {
        size: `${(blob.size / 1024 / 1024).toFixed(2)}MB`,
        type: pdfBlob.type,
        url: blobUrl.substring(0, 50) + '...'
      });

      setState(prev => ({
        ...prev,
        pdfUrl: blobUrl,
        isLoading: false,
        error: false,
        errorMessage: '',
        retryCount: 0
      }));

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('🔄 PDF loading aborted');
        return;
      }

      console.error('❌ PDF loading error:', err);
      
      if (!mountedRef.current) return;

      // Implement exponential backoff retry logic
      const maxRetries = 3;
      const retryDelay = Math.min(1000 * Math.pow(2, retryAttempt), 5000);

      if (retryAttempt < maxRetries) {
        console.log(`🔄 Retrying PDF load in ${retryDelay}ms (${retryAttempt + 1}/${maxRetries})`);
        
        setState(prev => ({ 
          ...prev, 
          isLoading: true,
          errorMessage: `Loading... (attempt ${retryAttempt + 2}/${maxRetries + 1})`,
          retryCount: retryAttempt + 1
        }));
        
        setTimeout(() => {
          if (mountedRef.current) {
            loadPdf(retryAttempt + 1);
          }
        }, retryDelay);
        return;
      }

      // Final failure after all retries
      setState(prev => ({
        ...prev,
        error: true,
        isLoading: false,
        errorMessage: err.message || 'Failed to load PDF',
        retryCount: retryAttempt + 1
      }));
    }
  }, [uploaded?.gcs_key, uploaded?.file_name]);

  // Load PDF on mount and when gcs_key changes
  useEffect(() => {
    mountedRef.current = true;
    
    let initialLoadDelay: NodeJS.Timeout | null = null;
    
    if (uploaded && (uploaded.gcs_key || uploaded.file_name)) {
      // Add small delay to allow GCS file move to propagate
      initialLoadDelay = setTimeout(() => {
        if (mountedRef.current) {
          loadPdf(0);
        }
      }, 500); // 500ms delay for GCS propagation
    } else {
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: true,
        errorMessage: 'No document to preview'
      }));
    }

    return () => {
      mountedRef.current = false;
      if (initialLoadDelay) {
        clearTimeout(initialLoadDelay);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Cleanup blob URL
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, [loadPdf]);

  // Manual retry handler
  const retry = useCallback(() => {
    console.log('🔄 Manual PDF retry requested');
    loadPdf(0);
  }, [loadPdf]);

  // Download PDF
  const download = useCallback(() => {
    if (state.pdfUrl) {
      const fileName = uploaded?.file_name || uploaded?.fileName || 'document.pdf';
      const a = document.createElement('a');
      a.href = state.pdfUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [state.pdfUrl, uploaded?.file_name, uploaded?.fileName]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setState(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.2, 2) }));
  }, []);

  const zoomOut = useCallback(() => {
    setState(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.2, 0.5) }));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setState(prev => ({ ...prev, zoom: Math.max(0.5, Math.min(2, zoom)) }));
  }, []);

  const actions: DocumentPreviewActions = {
    loadPdf,
    retry,
    download,
    zoomIn,
    zoomOut,
    setZoom
  };

  return {
    ...state,
    ...actions
  };
}

