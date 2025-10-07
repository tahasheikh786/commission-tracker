'use client';

import React, { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, AlertCircle, Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  requireUpload?: boolean;
  requireEdit?: boolean;
  fallback?: ReactNode;
  showLoadingSpinner?: boolean;
}

export default function AuthGuard({
  children,
  requireAuth = true,
  requireAdmin = false,
  requireUpload = false,
  requireEdit = false,
  fallback,
  showLoadingSpinner = true
}: AuthGuardProps) {
  const { user, permissions, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (requireAuth && !isAuthenticated) {
      console.log('AuthGuard: Not authenticated, redirecting to login');
      router.push('/auth/login');
      return;
    }

    if (requireAdmin && user?.role !== 'admin') {
      console.log('AuthGuard: Not admin, redirecting to home');
      router.push('/');
      return;
    }

    if (requireUpload && permissions && !permissions.can_upload) {
      console.log('AuthGuard: No upload permission, redirecting to home');
      router.push('/');
      return;
    }

    if (requireEdit && permissions && !permissions.can_edit) {
      console.log('AuthGuard: No edit permission, redirecting to home');
      router.push('/');
      return;
    }
  }, [isAuthenticated, user, permissions, isLoading, requireAuth, requireAdmin, requireUpload, requireEdit, router]);

  // Show loading state
  if (isLoading) {
    if (showLoadingSpinner) {
      return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center space-y-4"
          >
            <div className="w-16 h-16 loading-skeleton-shimmer rounded-xl mx-auto"></div>
            <div className="space-y-2">
              <div className="w-32 h-4 loading-skeleton-shimmer rounded-lg mx-auto" style={{ animationDelay: '200ms' }}></div>
              <div className="w-24 h-3 loading-skeleton-shimmer rounded-lg mx-auto" style={{ animationDelay: '400ms' }}></div>
            </div>
          </motion.div>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return null; // Will redirect to login
  }

  if (requireAdmin && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md mx-auto p-6"
        >
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            You don&apos;t have permission to access this page. Admin access is required.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  if (requireUpload && permissions && !permissions.can_upload) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md mx-auto p-6"
        >
          <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Upload Restricted</h1>
          <p className="text-muted-foreground mb-6">
            You don&apos;t have permission to upload files. Please contact your administrator.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  if (requireEdit && permissions && !permissions.can_edit) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md mx-auto p-6"
        >
          <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Edit Restricted</h1>
          <p className="text-muted-foreground mb-6">
            You have read-only access. You cannot edit data. Please contact your administrator.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
