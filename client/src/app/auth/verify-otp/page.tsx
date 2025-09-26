'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { motion } from 'framer-motion';
import { Mail, Building2, ArrowLeft, ArrowRight, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function VerifyOTPPage() {
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { verifyOTP, requestOTP, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const email = searchParams.get('email');
  const purpose = searchParams.get('purpose') as 'login' | 'registration';
  const firstName = searchParams.get('firstName');
  const lastName = searchParams.get('lastName');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  // Redirect if no email or purpose
  useEffect(() => {
    if (!email || !purpose) {
      router.push('/auth/login');
    }
  }, [email, purpose, router]);

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (otp.length !== 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    setIsLoading(true);
    try {
      await verifyOTP({ email: email!, otp, purpose: purpose! });
      toast.success(purpose === 'login' ? 'Login successful!' : 'Account created and verified successfully!');
      router.push('/');
    } catch (error: any) {
      toast.error(error.message || 'OTP verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    
    setIsResending(true);
    try {
      await requestOTP({ email: email!, purpose: purpose! });
      setCountdown(60); // 60 second cooldown
      toast.success('Verification code sent!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend OTP');
    } finally {
      setIsResending(false);
    }
  };

  const handleBack = () => {
    if (purpose === 'login') {
      router.push('/auth/login');
    } else {
      router.push('/auth/signup');
    }
  };

  const formatEmail = (email: string) => {
    const [username, domain] = email.split('@');
    return `${username.slice(0, 2)}***@${domain}`;
  };

  if (!email || !purpose) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-100/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-2xl mb-4 shadow-lg">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 bg-clip-text text-transparent mb-2">
            Verify Your Email
          </h1>
          <p className="text-slate-600">
            {purpose === 'login' ? 'Complete your login' : 'Complete your registration'}
          </p>
        </motion.div>

        {/* OTP Verification Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-slate-200"
        >
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">
              Enter Verification Code
            </h2>
            <p className="text-slate-600">
              We&apos;ve sent a 6-digit verification code to
            </p>
            <p className="text-slate-800 font-semibold mt-1">
              {formatEmail(email)}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* OTP Input */}
            <div>
              <label htmlFor="otp" className="block text-sm font-semibold text-slate-700 mb-2">
                Verification Code
              </label>
              <div className="relative">
                <input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={handleOtpChange}
                  className="block w-full px-4 py-4 text-center text-2xl font-mono tracking-widest border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="000000"
                  maxLength={6}
                  required
                  disabled={isLoading}
                />
              </div>
              <p className="mt-2 text-sm text-slate-500 text-center">
                Enter the 6-digit code sent to your email
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <motion.button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center shadow-lg hover:shadow-xl"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Verify Code
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </motion.button>

              <div className="flex space-x-3">
                <motion.button
                  type="button"
                  onClick={handleBack}
                  disabled={isLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 bg-slate-100 text-slate-700 py-3 px-4 rounded-xl font-semibold hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </motion.button>

                <motion.button
                  type="button"
                  onClick={handleResend}
                  disabled={isLoading || isResending || countdown > 0}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 bg-green-100 text-green-700 py-3 px-4 rounded-xl font-semibold hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
                >
                  {isResending ? (
                    <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  ) : countdown > 0 ? (
                    <>
                      <Clock className="mr-2 h-4 w-4" />
                      {countdown}s
                    </>
                  ) : (
                    'Resend Code'
                  )}
                </motion.button>
              </div>
            </div>
          </form>

          {/* Help Text */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <CheckCircle className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-medium">Didn&apos;t receive the code?</p>
                <ul className="mt-2 space-y-1 text-xs">
                  <li>• Check your spam/junk folder</li>
                  <li>• Make sure you entered the correct email address</li>
                  <li>• Wait a few minutes and try resending</li>
                  <li>• Contact support if the problem persists</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Development Note */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                <div className="text-xs text-yellow-700">
                  <p className="font-medium">Development Mode</p>
                  <p>Check your server console for the OTP code if email is not configured.</p>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Background Decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}
