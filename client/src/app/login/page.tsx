'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useThemeHydration } from '@/hooks/useThemeHydration';
import LoadingScreen from '@/app/components/LoadingScreen';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Building2, 
  Mail, 
  Settings, 
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Moon,
  Sun,
  Database,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Clock,
  Bell,
  Palette,
  Monitor
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { isEmailAuthorized, getAuthorizedEmails } from '@/utils/emailValidation';

export default function LoginPage() {
  const router = useRouter();
  const { requestOTP, verifyOTP, isAuthenticated } = useAuth();
  const { theme, setTheme, actualTheme } = useTheme();
  const { mounted, isDark } = useThemeHydration();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailValid, setIsEmailValid] = useState(true);
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [otpExpiration, setOtpExpiration] = useState<Date | null>(null);
  const [otpExpired, setOtpExpired] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const totalSteps = 2;

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // OTP expiration timer
  useEffect(() => {
    if (otpExpiration) {
      const timer = setInterval(() => {
        const now = new Date();
        if (now >= otpExpiration) {
          setOtpExpired(true);
          setOtpExpiration(null);
          clearInterval(timer);
        }
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [otpExpiration]);

  // Force re-render for OTP timer display
  const [otpTimer, setOtpTimer] = useState(0);
  useEffect(() => {
    if (otpExpiration && !otpExpired) {
      const timer = setInterval(() => {
        setOtpTimer(getOtpTimeRemaining());
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [otpExpiration, otpExpired]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Validate email in real-time
    if (name === 'email') {
      const emailValid = value.trim() === '' || isEmailAuthorized(value);
      setIsEmailValid(emailValid);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(value);
  };

  const validateStep = (step: number) => {
    switch (step) {
      case 1:
        if (!formData.email) {
          toast.error('Please enter your email address');
          return false;
        }
        if (!isEmailAuthorized(formData.email)) {
          toast.error('This email address is not authorized for login');
          return false;
        }
        if (!formData.password) {
          toast.error('Please enter your password');
          return false;
        }
        return true;
      case 2:
        if (otp.length !== 6) {
          toast.error('Please enter a valid 6-digit code');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = async () => {
    if (validateStep(currentStep)) {
      if (currentStep === 1) {
        // Request OTP before moving to verification step
        setIsLoading(true);
        try {
          await requestOTP({ email: formData.email, purpose: 'login' });
          toast.success('Verification code sent to your email!');
          setCountdown(60); // 60 second cooldown
          
          // Set OTP expiration to 10 minutes from now
          const expirationTime = new Date();
          expirationTime.setMinutes(expirationTime.getMinutes() + 10);
          setOtpExpiration(expirationTime);
          setOtpExpired(false);
          
          setCurrentStep(2);
        } catch (error: any) {
          toast.error(error.message || 'Failed to send verification code');
        } finally {
          setIsLoading(false);
        }
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    
    setIsResending(true);
    try {
      await requestOTP({ email: formData.email, purpose: 'login' });
      setCountdown(60); // 60 second cooldown
      
      // Reset OTP expiration to 10 minutes from now
      const expirationTime = new Date();
      expirationTime.setMinutes(expirationTime.getMinutes() + 10);
      setOtpExpiration(expirationTime);
      setOtpExpired(false);
      
      toast.success('Verification code sent!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend OTP');
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      // Verify OTP to complete login
      await verifyOTP({
        email: formData.email,
        otp: otp,
        purpose: 'login'
      });
      
      toast.success('Login completed successfully!');
      router.push('/');
    } catch (error: any) {
      toast.error(error.message || 'OTP verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const formatEmail = (email: string) => {
    const [username, domain] = email.split('@');
    return `${username.slice(0, 2)}***@${domain}`;
  };

  const getOtpTimeRemaining = () => {
    if (!otpExpiration) return 0;
    const now = new Date();
    const diff = otpExpiration.getTime() - now.getTime();
    return Math.max(0, Math.floor(diff / 1000));
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Login Credentials';
      case 2: return 'Verify Email';
      default: return 'Login';
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 1: return 'Enter your email and password';
      case 2: return 'Enter the verification code';
      default: return 'Complete your login';
    }
  };

  // Don't render theme-dependent content until mounted
  if (!mounted) {
    return <LoadingScreen message="Loading Commission Tracker..." />;
  }

  return (
    <div className={`h-screen flex flex-col ${isDark ? 'dark' : ''}`}>

      {/* Top Bar - Logo, Progress Bar, Theme Toggle */}
      <div className="fixed top-4 left-0 right-0 z-50 px-4">
        <div className="flex items-center justify-between">
          {/* Logo - Left */}
          <Link href="/landing" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-105">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 dark:from-slate-100 dark:via-slate-200 dark:to-slate-300 bg-clip-text text-transparent">
                Commission Tracker
              </span>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                AI-Powered Commission Management
              </div>
            </div>
          </Link>

          {/* Progress Bar and Theme Toggle - Right */}
          <div className="flex items-center space-x-4">
            {/* Progress Bar */}
            <div className="flex items-center">
              {[1, 2].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    currentStep > step
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : currentStep === step
                      ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                  }`}>
                    {currentStep > step ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <span className="text-sm font-semibold">{step}</span>
                    )}
                  </div>
                  {step < 2 && (
                    <div className={`w-8 h-0.5 mx-2 ${
                      currentStep > step ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`} />
                  )}
                </div>
              ))}
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setTheme('light')}
                className={`p-2 rounded-md transition-all duration-200 ${
                  actualTheme === 'light' 
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Light Mode"
              >
                <Sun className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-2 rounded-md transition-all duration-200 ${
                  actualTheme === 'dark' 
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Dark Mode"
              >
                <Moon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`p-2 rounded-md transition-all duration-200 ${
                  theme === 'system' 
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="System Mode"
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Screen Layout */}
      <div className="flex flex-1">
        {/* Left Side - Form */}
        <div className="w-1/2 bg-blue-50 dark:bg-slate-800 flex flex-col relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_1px_1px,rgba(59,130,246,0.3)_1px,transparent_0)] bg-[length:20px_20px]"></div>
          </div>
          
          {/* Form Content */}
          <div className="flex-1 px-8 py-8 overflow-y-auto relative z-10 flex items-center justify-center">
            <div className="max-w-md mx-auto">
              {/* Logo and Header */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center mb-8"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mb-4">
                  <Building2 className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 dark:from-slate-100 dark:via-slate-200 dark:to-slate-300 bg-clip-text text-transparent mb-2">
                  {getStepTitle()}
                </h1>
                <p className="text-slate-600 dark:text-slate-400">
                  {getStepDescription()}
                </p>
              </motion.div>

              {/* Login Form */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* Step 1: Login Credentials */}
                    {currentStep === 1 && (
                      <div className="rounded-2xl p-8">
                        <div className="space-y-6">
                          <div>
                            <label htmlFor="email" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Email Address *
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Mail className={`h-5 w-5 ${!isEmailValid && formData.email ? 'text-red-400' : 'text-slate-400'}`} />
                              </div>
                              <input
                                id="email"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                autoComplete="email"
                                className={`block w-full pl-10 pr-3 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 ${
                                  !isEmailValid && formData.email 
                                    ? 'border-red-300 dark:border-red-500 focus:ring-red-500 bg-red-50 dark:bg-red-900/20' 
                                    : 'border-slate-200 dark:border-slate-600 focus:ring-blue-500'
                                }`}
                                placeholder="Enter your email"
                                required
                              />
                              {!isEmailValid && formData.email && (
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                  <AlertCircle className="h-5 w-5 text-red-400" />
                                </div>
                              )}
                            </div>
                            {!isEmailValid && formData.email && (
                              <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                <div className="flex items-start">
                                  <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 mr-2 flex-shrink-0" />
                                  <div className="text-sm text-red-700 dark:text-red-300">
                                    <p className="font-medium">Email not authorized</p>
                                    <p className="mt-1">Only authorized email addresses can login. Contact your administrator for access.</p>
                                    <p className="mt-2 text-xs">
                                      <strong>Authorized emails:</strong> {getAuthorizedEmails().join(', ')}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          <div>
                            <label htmlFor="password" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Password *
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-slate-400" />
                              </div>
                              <input
                                id="password"
                                name="password"
                                type={showPassword ? "text" : "password"}
                                value={formData.password}
                                onChange={handleInputChange}
                                autoComplete="current-password"
                                className="block w-full pl-10 pr-12 py-3 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                                placeholder="Enter your password"
                                required
                              />
                              <button
                                type="button"
                                onClick={togglePasswordVisibility}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                              >
                                {showPassword ? (
                                  <EyeOff className="h-5 w-5" />
                                ) : (
                                  <Eye className="h-5 w-5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="mt-8 space-y-3">
                          <motion.button
                            onClick={nextStep}
                            disabled={isLoading}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center cursor-pointer"
                          >
                            {isLoading ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                Continue
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </>
                            )}
                          </motion.button>
                        </div>

                        {/* Register Link */}
                        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
                            Don't have an account?{' '}
                            <Link 
                              href="/register" 
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold inline-flex items-center transition-colors"
                            >
                              Sign up
                              <ArrowLeft className="ml-1 h-3 w-3 rotate-180" />
                            </Link>
                          </p>
                        </div>

                        {/* Footer */}
                        <div className="mt-4">
                          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                            Secure access with OTP verification and domain-based authentication
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Step 2: OTP Verification */}
                    {currentStep === 2 && (
                      <div className="rounded-2xl p-8">
                        <div className="space-y-6">
                          <div className="text-center mb-6">
                            <p className="text-slate-600 dark:text-slate-400">
                              We've sent a 6-digit verification code to
                            </p>
                            <p className="text-slate-800 dark:text-slate-200 font-semibold mt-1">
                              {formatEmail(formData.email)}
                            </p>
                            
                            {/* OTP Expiration Status */}
                            {otpExpiration && !otpExpired && (
                              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <div className="flex items-center justify-center gap-2">
                                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                    Code expires in {formatTime(otpTimer)}
                                  </span>
                                </div>
                              </div>
                            )}
                            
                            {otpExpired && (
                              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                <div className="flex items-center justify-center gap-2">
                                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                  <span className="text-sm font-medium text-red-700 dark:text-red-300">
                                    Code has expired. Please request a new one.
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div>
                            <label htmlFor="otp" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Verification Code
                            </label>
                            <div className="relative">
                              <input
                                id="otp"
                                name="otp"
                                type="text"
                                value={otp}
                                onChange={handleOtpChange}
                                autoComplete="one-time-code"
                                className="block w-full px-4 py-4 text-center text-2xl font-mono tracking-widest border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                                placeholder="000000"
                                maxLength={6}
                                required
                                disabled={isLoading}
                              />
                            </div>
                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 text-center">
                              Enter the 6-digit code sent to your email
                            </p>
                          </div>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="mt-8 space-y-3">
                          <motion.button
                            onClick={handleSubmit}
                            disabled={isLoading}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center cursor-pointer"
                          >
                            {isLoading ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                Complete Login
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </>
                            )}
                          </motion.button>

                          <motion.button
                            onClick={prevStep}
                            disabled={isLoading}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 py-3 px-4 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center cursor-pointer"
                          >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                          </motion.button>

                          <motion.button
                            onClick={handleResend}
                            disabled={isLoading || isResending || countdown > 0}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 py-3 px-4 rounded-xl font-semibold hover:bg-green-200 dark:hover:bg-green-900/50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center cursor-pointer"
                          >
                            {isResending ? (
                              <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                            ) : countdown > 0 ? (
                              <>
                                <Clock className="mr-2 h-4 w-4" />
                                Resend in {countdown}s
                              </>
                            ) : (
                              'Resend Code'
                            )}
                          </motion.button>
                        </div>

                        {/* Register Link */}
                        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
                            Don't have an account?{' '}
                            <Link 
                              href="/register" 
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold inline-flex items-center transition-colors"
                            >
                              Sign up
                              <ArrowLeft className="ml-1 h-3 w-3 rotate-180" />
                            </Link>
                          </p>
                        </div>

                        {/* Footer */}
                        <div className="mt-4">
                          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                            Secure access with OTP verification and domain-based authentication
                          </p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Right Side - Feature Showcase */}
        <div className="w-1/2 relative">
          <div className={`h-full p-8 flex flex-col ${
            actualTheme === 'dark'
              ? 'bg-slate-900'
              : 'bg-slate-50'
          }`}>
            {/* Header */}
            <div className="mb-8">
            </div>

            {/* Dynamic Content Based on Step */}
            <div className="flex-1">
              {currentStep === 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="h-full flex flex-col items-center justify-center"
                >
                  {/* Image with Text Below */}
                  <div className="text-center mb-8">
                    <div className="w-32 h-32 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-3xl flex items-center justify-center mb-6 mx-auto">
                      <Lock className="w-16 h-16 text-white" />
                    </div>
                    <h3 className={`text-2xl font-bold mb-4 ${
                      actualTheme === 'dark' ? 'text-white' : 'text-slate-800'
                    }`}>
                      Secure Login
                    </h3>
                    <p className={`text-lg leading-relaxed max-w-md ${
                      actualTheme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                    }`}>
                      Enter your credentials to access your commission tracking dashboard and manage your business data securely.
                    </p>
                  </div>
                  
                  {/* Feature highlights */}
                  <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                    <div className={`p-4 rounded-xl ${
                      actualTheme === 'dark' ? 'bg-slate-800/50' : 'bg-white/80'
                    }`}>
                      <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center mb-2">
                        <Database className="w-4 h-4 text-white" />
                      </div>
                      <p className={`text-sm font-medium ${
                        actualTheme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                      }`}>
                        Dashboard Access
                      </p>
                    </div>
                    <div className={`p-4 rounded-xl ${
                      actualTheme === 'dark' ? 'bg-slate-800/50' : 'bg-white/80'
                    }`}>
                      <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center mb-2">
                        <Bell className="w-4 h-4 text-white" />
                      </div>
                      <p className={`text-sm font-medium ${
                        actualTheme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                      }`}>
                        Real-time Updates
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStep === 2 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="h-full flex flex-col items-center justify-center"
                >
                  {/* Image Gallery */}
                  <div className="grid grid-cols-2 gap-4 mb-8 w-full max-w-md">
                    <div className="aspect-square bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center">
                      <CheckCircle className="w-12 h-12 text-white" />
                    </div>
                    <div className="aspect-square bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center">
                      <Lock className="w-12 h-12 text-white" />
                    </div>
                    <div className="aspect-square bg-gradient-to-br from-pink-500 to-red-500 rounded-2xl flex items-center justify-center">
                      <Bell className="w-12 h-12 text-white" />
                    </div>
                    <div className="aspect-square bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center">
                      <Database className="w-12 h-12 text-white" />
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <h3 className={`text-2xl font-bold mb-4 ${
                      actualTheme === 'dark' ? 'text-white' : 'text-slate-800'
                    }`}>
                      Final Verification
                    </h3>
                    <p className={`text-lg leading-relaxed max-w-md ${
                      actualTheme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                    }`}>
                      Enter the verification code sent to your email to complete login and access your dashboard.
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
